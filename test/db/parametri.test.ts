import { test } from 'node:test'
import assert from 'node:assert/strict'
import type BetterSqlite3 from 'better-sqlite3'
import { creaDbTest } from './helpers'
import {
  configParametri,
  eliminaGruppo,
  eliminaParametro,
  salvaGruppo,
  salvaParametro,
  salvaValori,
  sposta,
  valoriLavorazione,
  valoriStorici
} from '../../src/main/agricolo/servizi/parametri'
import { ErroreUtente } from '../../src/main/agricolo/errori'

function lavorazione(db: BetterSqlite3.Database, tipo = 'maltazione'): number {
  return Number(
    db
      .prepare(
        `INSERT INTO agri_lavorazioni (tipo, stagione, codice, data_inizio, stato) VALUES (?, '2026/2027', 'X', '2026-07-20', 'in_corso')`
      )
      .run(tipo).lastInsertRowid
  )
}

function paramId(db: BetterSqlite3.Database, nome: string): number {
  return (db.prepare(`SELECT id FROM agri_parametri WHERE nome = ?`).get(nome) as { id: number }).id
}

test('configurazione predefinita della maltazione: 6 gruppi in ordine con i parametri', () => {
  const db = creaDbTest()
  const gruppi = configParametri(db, 'maltazione')
  assert.deepEqual(
    gruppi.map((g) => g.nome),
    [
      'Preparazione',
      'Macerazione',
      'Germinazione',
      'Essiccazione',
      'Post-essiccazione',
      'Test di laboratorio'
    ]
  )
  assert.equal(gruppi[5].con_data, true)
  assert.equal(gruppi[2].parametri[0].nome, 'Peso umido')
  assert.equal(configParametri(db, 'calibratura')[0].parametri.length, 2)
  assert.equal(configParametri(db, 'raccolta').length, 0)
})

test('nuovo gruppo e nuovo parametro in coda; nomi obbligatori e non ripetuti', () => {
  const db = creaDbTest()
  const g = salvaGruppo(db, null, { fase: 'raccolta', nome: 'Condizioni', con_data: false })
  salvaParametro(db, null, {
    gruppo_id: g,
    nome: 'Umidità alla raccolta',
    unita: '%',
    tipo: 'numero'
  })
  salvaParametro(db, null, { gruppo_id: g, nome: 'Meteo', unita: null, tipo: 'testo' })
  const [gruppo] = configParametri(db, 'raccolta')
  assert.deepEqual(
    gruppo.parametri.map((p) => p.nome),
    ['Umidità alla raccolta', 'Meteo']
  )
  assert.throws(
    () => salvaGruppo(db, null, { fase: 'raccolta', nome: ' ', con_data: false }),
    ErroreUtente
  )
  assert.throws(
    () => salvaGruppo(db, null, { fase: 'raccolta', nome: 'condizioni', con_data: false }),
    ErroreUtente
  )
  assert.throws(
    () => salvaParametro(db, null, { gruppo_id: g, nome: 'meteo', unita: null, tipo: 'testo' }),
    ErroreUtente
  )
  assert.throws(
    () =>
      salvaParametro(db, null, {
        gruppo_id: g,
        nome: 'X',
        unita: null,
        tipo: 'colore' as unknown as 'testo'
      }),
    ErroreUtente
  )
})

test('rinomina e sposta su/giu', () => {
  const db = creaDbTest()
  const [prep, mac] = configParametri(db, 'maltazione')
  salvaGruppo(db, prep.id, { fase: 'maltazione', nome: 'Pulizia e lavaggio', con_data: false })
  sposta(db, 'gruppo', mac.id, 'su')
  assert.deepEqual(
    configParametri(db, 'maltazione')
      .slice(0, 2)
      .map((g) => g.nome),
    ['Macerazione', 'Pulizia e lavaggio']
  )
  const p = configParametri(db, 'maltazione')[0].parametri
  sposta(db, 'parametro', p[1].id, 'su')
  assert.equal(configParametri(db, 'maltazione')[0].parametri[0].id, p[1].id)
  // spostare il primo verso l alto non fa nulla
  sposta(db, 'gruppo', configParametri(db, 'maltazione')[0].id, 'su')
  assert.equal(configParametri(db, 'maltazione')[0].nome, 'Macerazione')
})

test('valori: salva, valida per tipo, svuota cancellando', () => {
  const db = creaDbTest()
  const lav = lavorazione(db)
  const peso = paramId(db, 'Peso umido')
  const dolcezza = paramId(db, 'Dolcezza')
  const radichetta = paramId(db, 'Punta radichetta')
  const aspetto = paramId(db, 'Aspetto visivo')
  const testLab = configParametri(db, 'maltazione').find((g) => g.con_data)!
  salvaValori(
    db,
    lav,
    { [peso]: '1750', [dolcezza]: '8', [radichetta]: 'si', [aspetto]: ' bene ' },
    { [testLab.id]: '2026-09-02' }
  )
  const v = valoriLavorazione(db, lav)
  assert.deepEqual(v.valori, {
    [peso]: '1750',
    [dolcezza]: '8',
    [radichetta]: 'si',
    [aspetto]: 'bene'
  })
  assert.deepEqual(v.date, { [testLab.id]: '2026-09-02' })
  salvaValori(db, lav, { [peso]: '', [aspetto]: '' }, { [testLab.id]: '' })
  const v2 = valoriLavorazione(db, lav)
  assert.deepEqual(v2.valori, { [dolcezza]: '8', [radichetta]: 'si' })
  assert.deepEqual(v2.date, {})
  assert.throws(() => salvaValori(db, lav, { [peso]: 'tanto' }, {}), ErroreUtente)
  assert.throws(() => salvaValori(db, lav, { [dolcezza]: '11' }, {}), ErroreUtente)
  assert.throws(() => salvaValori(db, lav, { [dolcezza]: '7.5' }, {}), ErroreUtente)
  assert.throws(() => salvaValori(db, lav, { [radichetta]: 'forse' }, {}), ErroreUtente)
  assert.throws(() => salvaValori(db, 9999, { [peso]: '1' }, {}), ErroreUtente)
  // un errore non salva nulla a meta
  assert.throws(() => salvaValori(db, lav, { [peso]: '1800', [dolcezza]: '99' }, {}), ErroreUtente)
  assert.equal(valoriLavorazione(db, lav).valori[peso], undefined)
})

test('elimina parametro e gruppo: con valori diventano nascosti e restano nello storico, senza valori spariscono', () => {
  const db = creaDbTest()
  const lav = lavorazione(db)
  const peso = paramId(db, 'Peso umido')
  const lavaggio = paramId(db, 'Lavaggio')
  salvaValori(db, lav, { [peso]: '1750' }, {})
  assert.equal(eliminaParametro(db, peso), 'nascosto')
  assert.equal(eliminaParametro(db, lavaggio), 'eliminato')
  const germ = configParametri(db, 'maltazione').find((g) => g.nome === 'Germinazione')!
  assert.equal(
    germ.parametri.some((p) => p.id === peso),
    false
  )
  assert.deepEqual(valoriStorici(db, lav), [
    { gruppo: 'Germinazione', parametro: 'Peso umido', unita: 'kg', tipo: 'numero', valore: '1750' }
  ])
  const ess = configParametri(db, 'maltazione').find((g) => g.nome === 'Essiccazione')!
  assert.equal(eliminaGruppo(db, ess.id), 'eliminato')
  assert.equal(eliminaGruppo(db, germ.id), 'nascosto')
  assert.deepEqual(
    configParametri(db, 'maltazione').map((g) => g.nome),
    ['Preparazione', 'Macerazione', 'Post-essiccazione', 'Test di laboratorio']
  )
})

test('cambiare il tipo di un parametro con valori registrati e bloccato', () => {
  const db = creaDbTest()
  const lav = lavorazione(db)
  const dolcezza = paramId(db, 'Dolcezza')
  const gruppo = (
    db.prepare(`SELECT gruppo_id FROM agri_parametri WHERE id = ?`).get(dolcezza) as {
      gruppo_id: number
    }
  ).gruppo_id
  salvaValori(db, lav, { [dolcezza]: '8' }, {})
  assert.throws(
    () =>
      salvaParametro(db, dolcezza, {
        gruppo_id: gruppo,
        nome: 'Dolcezza',
        unita: null,
        tipo: 'testo'
      }),
    ErroreUtente
  )
  salvaParametro(db, dolcezza, {
    gruppo_id: gruppo,
    nome: 'Dolcezza al gusto',
    unita: null,
    tipo: 'scala'
  })
  assert.ok(
    configParametri(db, 'maltazione').some((g) =>
      g.parametri.some((p) => p.nome === 'Dolcezza al gusto')
    )
  )
})
