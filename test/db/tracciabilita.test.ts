import { test } from 'node:test'
import assert from 'node:assert/strict'
import type BetterSqlite3 from 'better-sqlite3'
import { creaDbTest } from './helpers'
import { lotto, materia } from './fixture'
import { salvaCampo, salvaSemina } from '../../src/main/agricolo/servizi/campi'
import { salvaOperazione } from '../../src/main/agricolo/servizi/operazioni'
import { salvaValori, configParametri } from '../../src/main/agricolo/servizi/parametri'
import {
  avviaMaltazione,
  chiudiMaltazione,
  salvaCalibratura,
  salvaRaccolta
} from '../../src/main/agricolo/servizi/lavorazioni'
import { salvaLottiImballi } from '../../src/main/agricolo/servizi/imballi'
import { cercaPartenze, traccia } from '../../src/main/agricolo/servizi/tracciabilita'
import { alberoACsv } from '../../src/main/agricolo/csv'
import type { NodoTraccia } from '../../src/shared/agricolo'

type Db = BetterSqlite3.Database

function appiattisci(
  nodi: NodoTraccia[],
  livello = 1,
  out: Array<{ livello: number; nodo: NodoTraccia }> = []
): Array<{ livello: number; nodo: NodoTraccia }> {
  for (const n of nodi) {
    out.push({ livello, nodo: n })
    appiattisci(n.figli, livello + 1, out)
  }
  return out
}

function dettaglio(n: NodoTraccia, etichetta: string): string | undefined {
  return n.dettagli.find((d) => d.etichetta === etichetta)?.valore
}

/** Filiera completa: campo → semina (con semente) → trattamento → raccolta → calibratura → maltazione → cotta → vendita. */
function filiera(db: Db): {
  campo: number
  semina: number
  cotta: number
  lottoMalto: number
  lottoFungicida: number
} {
  const campo = salvaCampo(db, null, {
    nome: 'Campo 1A',
    superficie_ha: 10,
    localita: 'Irgoli',
    rif_catastale: 'Fg 12',
    note: null
  })
  const seme = materia(db, 'Orzo da seme Concerto', 'semente', 'kg')
  lotto(db, seme, 'SEM-77', 2000)
  const semina = salvaSemina(db, null, {
    campo_id: campo,
    stagione: '2025/2026',
    coltura: 'orzo',
    varieta: 'Concerto',
    data: '2025-11-15',
    superficie_ha: 10,
    semente_testo: null,
    semente: { materia_prima_id: seme, quantita: 1800, lotto_id: null },
    note: null
  })
  const fung = materia(db, 'Fungicida X', 'fitofarmaco', 'L', { carenza: 30 })
  const lottoFungicida = lotto(db, fung, 'FG-1', 10)
  salvaOperazione(db, null, {
    semina_id: semina,
    tipo: 'trattamento',
    data: '2026-04-10',
    prodotto: { materia_prima_id: fung, quantita: 2, lotto_id: null },
    motivo: 'Ruggine',
    operatore: 'Mauro',
    note: null
  })
  const grezzo = materia(db, 'Orzo grezzo', 'orzo_grezzo', 'q')
  const calibrato = materia(db, 'Orzo calibrato', 'orzo_calibrato', 'q')
  const pilsner = materia(db, 'Malto Pilsner aziendale', 'malto', 'kg')
  const rac = salvaRaccolta(db, null, {
    semina_id: semina,
    data: '2026-06-25',
    stagione: '2025/2026',
    materia_prima_id: grezzo,
    quantita: 300,
    codice: '1A/2026',
    data_scadenza: null,
    note: null
  })
  const lg = (
    db
      .prepare(`SELECT id FROM lotti_materie_prime WHERE origine_tipo='raccolta' AND origine_id=?`)
      .get(rac) as { id: number }
  ).id
  const cal = salvaCalibratura(db, null, {
    lotto_id: lg,
    data: '2026-07-10',
    stagione: '2026/2027',
    quantita: 300,
    materia_prima_id: calibrato,
    note: null,
    frazioni: [
      { nome: '<3 mm', percentuale: 19, scarto: true, peso_specifico_gl: null },
      { nome: '3-4 mm', percentuale: 69, scarto: false, peso_specifico_gl: 62 },
      { nome: '4-5 mm', percentuale: 10, scarto: false, peso_specifico_gl: 66 },
      { nome: '>5 mm', percentuale: 1, scarto: false, peso_specifico_gl: null }
    ]
  })
  const umidita = configParametri(db, 'calibratura')[0].parametri[0].id
  salvaValori(db, cal, { [umidita]: '10' }, {})
  const l34 = (
    db.prepare(`SELECT id FROM lotti_materie_prime WHERE calibro = '3-4 mm'`).get() as {
      id: number
    }
  ).id
  const mal = avviaMaltazione(db, null, {
    data_inizio: '2026-07-20',
    stagione: '2026/2027',
    materia_prima_id: pilsner,
    codice: '187/2026PTL',
    input: [{ lotto_id: l34, kg: 1100 }],
    note: null
  })
  const dolcezza = (
    db.prepare(`SELECT id FROM agri_parametri WHERE nome = 'Dolcezza'`).get() as { id: number }
  ).id
  salvaValori(db, mal, { [dolcezza]: '8' }, {})
  chiudiMaltazione(db, mal, { data_uscita: '2026-08-29', peso_finale_kg: 920, data_scadenza: null })
  const lottoMalto = (
    db.prepare(`SELECT id FROM lotti_materie_prime WHERE origine_tipo='maltazione'`).get() as {
      id: number
    }
  ).id
  // cotta che usa il malto (come farebbe prod:avvia-cotta)
  const birra = Number(
    db.prepare(`INSERT INTO birre (nome, stile) VALUES ('Marduk Pils', 'Pils')`).run()
      .lastInsertRowid
  )
  const cotta = Number(
    db
      .prepare(
        `INSERT INTO cotte (numero_lotto, birra_id, data_inizio, litri_teorici, stato) VALUES ('L-2026-50', ?, '2026-09-05', 1000, 'confezionata')`
      )
      .run(birra).lastInsertRowid
  )
  db.prepare(
    `INSERT INTO cotta_materie_prime (cotta_id, lotto_materia_prima_id, materia_prima_id, quantita_usata) VALUES (?, ?, ?, 200)`
  ).run(cotta, lottoMalto, pilsner)
  const luppolo = materia(db, 'Cascade', 'luppolo', 'kg')
  const ll = lotto(db, luppolo, 'HOP-9', 5)
  db.prepare(
    `INSERT INTO cotta_materie_prime (cotta_id, lotto_materia_prima_id, materia_prima_id, quantita_usata) VALUES (?, ?, ?, 2)`
  ).run(cotta, ll, luppolo)
  // imballi
  const bott = Number(
    db
      .prepare(
        `INSERT INTO materiali_confezionamento (nome, categoria, attivo) VALUES ('Bottiglia 33 cl', 'bottiglia', 1)`
      )
      .run().lastInsertRowid
  )
  const car = Number(
    db
      .prepare(
        `INSERT INTO movimenti_confezionamento (materiale_id, tipo_movimento, quantita, causale, lotto_fornitore, fornitore) VALUES (?, 'carico', 5000, 'acquisto', 'VER-1', 'Verallia')`
      )
      .run(bott).lastInsertRowid
  )
  salvaLottiImballi(db, cotta, [car])
  // vendita
  const cliente = Number(
    db.prepare(`INSERT INTO clienti (nome) VALUES ('Bar Centrale Orosei')`).run().lastInsertRowid
  )
  const vendita = Number(
    db.prepare(`INSERT INTO vendite (cliente_id, data) VALUES (?, '2026-09-20')`).run(cliente)
      .lastInsertRowid
  )
  db.prepare(
    `INSERT INTO vendita_dettaglio (vendita_id, cotta_id, tipo_prodotto, quantita) VALUES (?, ?, 'bottiglia', 120)`
  ).run(vendita, cotta)
  return { campo, semina, cotta, lottoMalto, lottoFungicida }
}

test('a ritroso dalla cotta: malto → maltazione → orzo calibrato → calibratura → grezzo → raccolta → semina → campo e operazioni; imballi', () => {
  const db = creaDbTest()
  const f = filiera(db)
  const albero = traccia(db, { tipo: 'cotta', id: f.cotta }, 'indietro')
  const tutti = appiattisci(albero)
  const tipi = tutti.map((t) => t.nodo.tipo)
  for (const t of [
    'cotta',
    'lotto',
    'maltazione',
    'calibratura',
    'raccolta',
    'semina',
    'campo',
    'operazione',
    'imballo'
  ]) {
    assert.ok(tipi.includes(t as NodoTraccia['tipo']), `manca il nodo ${t}`)
  }
  const ordineMalto = [
    'cotta',
    'lotto',
    'maltazione',
    'lotto',
    'calibratura',
    'lotto',
    'raccolta',
    'semina'
  ]
  // il percorso del malto scende di un livello a ogni passo
  const percorso: string[] = []
  let corrente: NodoTraccia | undefined = albero[0]
  while (corrente && percorso.length < ordineMalto.length) {
    percorso.push(corrente.tipo)
    corrente = corrente.figli.find((x) => x.tipo !== 'gruppo' && x.titolo.indexOf('Cascade') < 0)
  }
  assert.deepEqual(percorso, ordineMalto)
  const campo = tutti.find((t) => t.nodo.tipo === 'campo')!.nodo
  assert.equal(campo.titolo, 'Campo 1A')
  const op = tutti.find((t) => t.nodo.tipo === 'operazione')!.nodo
  assert.match(op.titolo, /Trattamento/)
  assert.equal(dettaglio(op, 'Prodotto'), 'Fungicida X · lotto FG-1 · 2 L')
  const malt = tutti.find((t) => t.nodo.tipo === 'maltazione')!.nodo
  assert.equal(dettaglio(malt, 'Resa di maltazione'), '83,6%')
  assert.equal(dettaglio(malt, 'Germinazione · Dolcezza'), '8/10')
  const cal = tutti.find((t) => t.nodo.tipo === 'calibratura')!.nodo
  assert.equal(dettaglio(cal, 'Analisi orzo · Umidità'), '10 %')
  const imb = tutti.find((t) => t.nodo.tipo === 'imballo')!.nodo
  assert.match(imb.titolo, /Bottiglia 33 cl/)
  assert.match(imb.sottotitolo ?? '', /VER-1/)
  // la semente compare sotto la semina
  assert.ok(tutti.some((t) => t.nodo.tipo === 'lotto' && /SEM-77/.test(t.nodo.titolo)))
})

test('in avanti dal campo: semina → raccolta → lotti → calibratura → maltazione → malto → cotta → vendita al cliente', () => {
  const db = creaDbTest()
  const f = filiera(db)
  const tutti = appiattisci(traccia(db, { tipo: 'campo', id: f.campo }, 'avanti'))
  const tipi = tutti.map((t) => t.nodo.tipo)
  for (const t of [
    'campo',
    'semina',
    'raccolta',
    'lotto',
    'calibratura',
    'maltazione',
    'cotta',
    'vendita'
  ]) {
    assert.ok(tipi.includes(t as NodoTraccia['tipo']), `manca il nodo ${t}`)
  }
  const vendita = tutti.find((t) => t.nodo.tipo === 'vendita')!.nodo
  assert.match(vendita.titolo, /Bar Centrale Orosei/)
  assert.equal(dettaglio(vendita, 'Quantità'), '120 bottiglie')
})

test('in avanti da un lotto di fitofarmaco: dove e finito (operazione → semina → … → cotta)', () => {
  const db = creaDbTest()
  const f = filiera(db)
  const tipi = appiattisci(traccia(db, { tipo: 'lotto', id: f.lottoFungicida }, 'avanti')).map(
    (t) => t.nodo.tipo
  )
  assert.ok(tipi.includes('operazione'))
  assert.ok(tipi.includes('cotta'))
})

test('ricerca dei punti di partenza per codice e nome', () => {
  const db = creaDbTest()
  filiera(db)
  const p = cercaPartenze(db, '187')
  assert.ok(p.some((x) => x.tipo === 'lotto' && /187\/2026PTL/.test(x.etichetta)))
  assert.ok(cercaPartenze(db, 'L-2026-50').some((x) => x.tipo === 'cotta'))
  assert.ok(cercaPartenze(db, 'campo 1a').some((x) => x.tipo === 'campo'))
  assert.ok(cercaPartenze(db, '').length > 0)
})

test('il CSV contiene tutta la catena', () => {
  const db = creaDbTest()
  const f = filiera(db)
  const csv = alberoACsv(traccia(db, { tipo: 'cotta', id: f.cotta }, 'indietro'))
  assert.match(csv, /Cotta L-2026-50/)
  assert.match(csv, /Campo 1A/)
  assert.match(csv, /187\/2026PTL/)
})
