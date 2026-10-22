import { test } from 'node:test'
import assert from 'node:assert/strict'
import { executeTool, getToolDefinitions, getToolNames } from '../../src/main/ai/tools'
import { creaDbTest } from './helpers'
import { filiera } from './fixture-filiera'

const AGRICOLI = [
  'agri_campi_semine',
  'agri_operazioni',
  'agri_lavorazioni',
  'agri_magazzino_input',
  'tracciabilita'
]

function preparato(): ReturnType<typeof creaDbTest> {
  const db = creaDbTest()
  filiera(db)
  return db
}

function esegui(
  db: ReturnType<typeof creaDbTest>,
  nome: string,
  args: Record<string, unknown> = {}
): string {
  const r = executeTool(db, nome, args, { moduloAgricolo: true })
  assert.ok(r.ok, `${nome}: ${r.ok ? '' : r.errore}`)
  return JSON.stringify(r.ok ? r.result : null)
}

test('gli strumenti agricoli esistono solo a modulo acceso', () => {
  const acceso = getToolNames({ moduloAgricolo: true })
  const spento = getToolNames({ moduloAgricolo: false })
  for (const n of AGRICOLI) {
    assert.ok(acceso.includes(n), `manca ${n}`)
    assert.ok(!spento.includes(n), `${n} visibile a modulo spento`)
  }
  const db = preparato()
  const r = executeTool(db, 'agri_lavorazioni', { tipo: 'maltazione' }, { moduloAgricolo: false })
  assert.equal(r.ok, false)
})

test('campi e semine, senza riferimento catastale', () => {
  const j = esegui(preparato(), 'agri_campi_semine')
  assert.match(j, /Campo 1A/)
  assert.match(j, /Concerto/)
  assert.ok(!j.includes('Fg 12'), 'riferimento catastale uscito')
})

test('operazioni di campo con prodotto e fine del tempo di carenza', () => {
  const j = esegui(preparato(), 'agri_operazioni')
  assert.match(j, /trattamento/)
  assert.match(j, /Fungicida X/)
  assert.match(j, /2026-05-10/)
})

test('maltazioni: elenco e dettaglio con parametri, ingressi, uscite e rese', () => {
  const db = preparato()
  const elenco = esegui(db, 'agri_lavorazioni', { tipo: 'maltazione' })
  assert.match(elenco, /187\/2026PTL/)
  const dettaglio = JSON.parse(
    esegui(db, 'agri_lavorazioni', { tipo: 'maltazione', codice: '187/2026PTL' })
  ) as {
    parametri: Array<{ gruppo: string; parametro: string; valore: string }>
    rese: { resa_maltazione_percento: number }
  }
  assert.ok(
    dettaglio.parametri.some((p) => p.parametro === 'Dolcezza' && p.valore === '8'),
    'manca il parametro compilato'
  )
  assert.equal(dettaglio.rese.resa_maltazione_percento, 83.6)
})

test('raccolte e calibrature', () => {
  const db = preparato()
  assert.match(esegui(db, 'agri_lavorazioni', { tipo: 'raccolta' }), /1A\/2026/)
  assert.match(esegui(db, 'agri_lavorazioni', { tipo: 'calibratura' }), /3-4 mm/)
})

test('magazzino input agricoli con tempi di carenza', () => {
  const j = esegui(preparato(), 'agri_magazzino_input')
  assert.match(j, /Orzo da seme Concerto/)
  assert.match(j, /Fungicida X/)
  assert.match(j, /"carenza_giorni":30/)
})

test('tracciabilità dalla cotta (a ritroso) e dal lotto di raccolta (in avanti), senza catasto', () => {
  const db = preparato()
  const indietro = esegui(db, 'tracciabilita', { lotto: 'L-2026-50' })
  assert.match(indietro, /187\/2026PTL/)
  assert.match(indietro, /Campo 1A/)
  assert.ok(!indietro.includes('Fg 12'), 'riferimento catastale uscito')
  const avanti = esegui(db, 'tracciabilita', { lotto: '1A/2026', direzione: 'avanti' })
  assert.match(avanti, /L-2026-50/)
  assert.match(avanti, /Bar Centrale Orosei/)
  assert.match(esegui(db, 'tracciabilita', { lotto: 'non-esiste' }), /trovato":false/)
})

test('definizioni con il modulo acceso ancora compatte', () => {
  const caratteri = JSON.stringify(getToolDefinitions({ moduloAgricolo: true })).length
  assert.ok(caratteri < 9000, `definizioni: ${caratteri} caratteri`)
})

test('naviga_a_schermata: schermate agricole solo a modulo acceso, elencate solo allora', () => {
  const db = preparato()
  const proposte: string[] = []
  const ctx = { richiediNavigazione: (s: string): void => void proposte.push(s) }
  const acceso = executeTool(
    db,
    'naviga_a_schermata',
    { sezione: 'agri-maltazioni' },
    { moduloAgricolo: true },
    ctx
  )
  assert.ok(acceso.ok && (acceso.result as { ok: boolean }).ok)
  assert.deepEqual(proposte, ['agri-maltazioni'])
  const spento = executeTool(
    db,
    'naviga_a_schermata',
    { sezione: 'agri-maltazioni' },
    { moduloAgricolo: false },
    ctx
  )
  assert.ok(spento.ok && !(spento.result as { ok: boolean }).ok)
  const descr = (o: boolean): string =>
    JSON.stringify(
      getToolDefinitions({ moduloAgricolo: o }).find(
        (t) => t.function.name === 'naviga_a_schermata'
      )
    )
  assert.match(descr(true), /agri-maltazioni/)
  assert.doesNotMatch(descr(false), /agri-/)
})
