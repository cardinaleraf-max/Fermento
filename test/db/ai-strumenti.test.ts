import { test } from 'node:test'
import assert from 'node:assert/strict'
import { executeTool, getToolDefinitions, getToolNames } from '../../src/main/ai/tools'
import { creaDbTest } from './helpers'
import { seminaDatiBira, TITOLARE, VALORI_VIETATI, CLIENTE_PUB, FORNITORE } from './ai-fixture'

/** Argomenti minimi per gli strumenti che ne richiedono. */
const ARGOMENTI: Record<string, Record<string, unknown>> = {
  ricetta_birra: { birra: 'bion' },
  dettaglio_cotta: { numero_lotto: 'L-2026-01' },
  vendite_cliente: { cliente: CLIENTE_PUB.nome },
  cerca_documentazione: { query: 'come avvio una cotta' },
  naviga_a_schermata: { sezione: 'produzione' },
  vendite_per_birra: { giorni: 365 },
  top_clienti: { giorni: 365 }
}

function esegui(
  db: ReturnType<typeof creaDbTest>,
  nome: string,
  args: Record<string, unknown> = ARGOMENTI[nome] ?? {}
): unknown {
  const r = executeTool(db, nome, args, { moduloAgricolo: false })
  assert.ok(r.ok, `${nome}: ${r.ok ? '' : r.errore}`)
  return r.ok ? r.result : null
}

test('ogni strumento di produzione risponde e non restituisce mai contatti, note o segreti', () => {
  const db = creaDbTest()
  seminaDatiBira(db)
  const nomi = getToolNames({ moduloAgricolo: false })
  assert.ok(nomi.length >= 24, `strumenti: ${nomi.length}`)
  for (const nome of nomi) {
    const json = JSON.stringify(esegui(db, nome))
    const vietatiQui = VALORI_VIETATI.filter((v) => v !== CLIENTE_PUB.nome && v !== FORNITORE.nome)
    for (const v of vietatiQui) assert.ok(!json.includes(v), `${nome} restituisce «${v}»`)
  }
})

test('gli strumenti un tempo bloccati ora rispondono (scadenze, sotto soglia, cotte producibili, avvisi)', () => {
  const db = creaDbTest()
  seminaDatiBira(db)
  const scad = JSON.stringify(esegui(db, 'materie_prime_in_scadenza', { giorni: 60 }))
  assert.match(scad, /Luppolo Cascade/)
  assert.match(JSON.stringify(esegui(db, 'materie_prime_sotto_soglia')), /Luppolo Cascade/)
  assert.match(JSON.stringify(esegui(db, 'cotte_producibili')), /Bionda/)
  assert.match(JSON.stringify(esegui(db, 'avvisi_attivi')), /sotto la soglia/)
})

test('configurazione: niente chiavi segrete, titolare, backup o stato interno', () => {
  const db = creaDbTest()
  seminaDatiBira(db)
  for (const chiave of [
    'ai_groq_api_key',
    'nome_titolare',
    'backup_percorso',
    'onboarding_completato'
  ]) {
    assert.deepEqual(esegui(db, 'configurazione', { chiave }), { trovata: false }, chiave)
  }
  const elenco = JSON.stringify(esegui(db, 'configurazione', {}))
  assert.match(elenco, /cotta_litri/)
  assert.ok(!elenco.includes(TITOLARE))
  assert.ok(!elenco.includes('ai_groq'))
})

test('ricetta_birra: ingredienti e quantità della ricetta attiva', () => {
  const db = creaDbTest()
  seminaDatiBira(db)
  const r = esegui(db, 'ricetta_birra') as {
    birra: string
    ingredienti: Array<{ materia: string; quantita: number; unita: string }>
  }
  assert.equal(r.birra, 'Bionda')
  assert.deepEqual(
    r.ingredienti.find((i) => i.materia === 'Malto Pilsner'),
    { materia: 'Malto Pilsner', quantita: 45, unita: 'kg' }
  )
})

test('dettaglio_cotta: ingredienti usati con i lotti e confezionamento', () => {
  const db = creaDbTest()
  seminaDatiBira(db)
  const r = esegui(db, 'dettaglio_cotta') as {
    ingredienti: Array<{ materia: string; lotto: string; quantita: number }>
    confezionamento: { bottiglie: number }
  }
  const pils = r.ingredienti.find((i) => i.materia === 'Malto Pilsner')
  assert.equal(pils?.lotto, 'MP-2026-02')
  assert.equal(pils?.quantita, 50)
  assert.equal(r.confezionamento.bottiglie, 600)
})

test('vendite_cliente: cosa ha preso un cliente, per birra', () => {
  const db = creaDbTest()
  seminaDatiBira(db)
  const r = esegui(db, 'vendite_cliente') as {
    per_birra: Array<{ birra: string; bottiglie: number; fusti: number }>
  }
  assert.deepEqual(r.per_birra, [{ birra: 'Bionda', bottiglie: 120, fusti: 3 }])
})

test('giacenze_materie_prime e storico_cotte', () => {
  const db = creaDbTest()
  seminaDatiBira(db)
  const g = JSON.stringify(esegui(db, 'giacenze_materie_prime', { nome: 'cascade' }))
  assert.match(g, /CA-2026-01/)
  assert.match(g, /4\.8/)
  const s = esegui(db, 'storico_cotte') as { cotte: unknown[] }
  assert.equal(s.cotte.length, 2)
})

test('le definizioni degli strumenti restano compatte (pochi token a ogni domanda)', () => {
  const caratteri = JSON.stringify(getToolDefinitions({ moduloAgricolo: false })).length
  assert.ok(caratteri < 7000, `definizioni: ${caratteri} caratteri`)
})
