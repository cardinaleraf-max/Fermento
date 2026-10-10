import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applicaSchema } from '../../src/main/database'
import { colonne, creaDbTest, nomiTabelle } from './helpers'

const Database = require('better-sqlite3') as typeof import('better-sqlite3')

const TABELLE_AGRICOLE = [
  'agri_campi',
  'agri_semine',
  'agri_operazioni',
  'agri_consumi',
  'agri_lavorazioni',
  'agri_lavorazione_input',
  'agri_lavorazione_output',
  'agri_gruppi_parametri',
  'agri_parametri',
  'agri_valori_parametri',
  'agri_date_gruppi',
  'confezionamento_lotti_imballi'
]

test('lo schema crea tutte le tabelle del modulo agricolo', () => {
  const db = creaDbTest()
  const tabelle = nomiTabelle(db)
  for (const t of TABELLE_AGRICOLE) assert.ok(tabelle.includes(t), `manca ${t}`)
})

test('le colonne nuove esistono una sola volta anche dopo due migrazioni', () => {
  const db = creaDbTest()
  applicaSchema(db)
  const attese: Record<string, string[]> = {
    lotti_materie_prime: ['origine_tipo', 'origine_id', 'stagione', 'calibro'],
    materie_prime: ['numero_registrazione', 'principio_attivo', 'tempo_carenza_giorni'],
    movimenti_confezionamento: ['lotto_fornitore', 'fornitore']
  }
  for (const [tabella, nomi] of Object.entries(attese)) {
    const presenti = colonne(db, tabella)
    for (const n of nomi) {
      assert.equal(presenti.filter((c) => c === n).length, 1, `${tabella}.${n}`)
    }
  }
})

test('un lotto gia esistente prima della migrazione diventa origine acquisto e non cambia', () => {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  // schema "vecchio" della tabella lotti (come nel DB di Luca prima del modulo)
  db.exec(
    `CREATE TABLE lotti_materie_prime (id INTEGER PRIMARY KEY, materia_prima_id INTEGER, fornitore_id INTEGER, lotto_fornitore TEXT, data_carico DATE, data_scadenza DATE, quantita_iniziale REAL, quantita_residua REAL, note TEXT, creato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP, aggiornato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`
  )
  db.prepare(
    `INSERT INTO lotti_materie_prime (materia_prima_id, lotto_fornitore, data_carico, data_scadenza, quantita_iniziale, quantita_residua) VALUES (1, 'L-OLD', '2026-01-10', '2027-01-10', 25, 12.5)`
  ).run()
  applicaSchema(db)
  applicaSchema(db)
  const lotto = db.prepare(`SELECT * FROM lotti_materie_prime`).get() as Record<string, unknown>
  assert.equal(lotto.origine_tipo, 'acquisto')
  assert.equal(lotto.origine_id, null)
  assert.equal(lotto.lotto_fornitore, 'L-OLD')
  assert.equal(lotto.quantita_residua, 12.5)
  assert.equal(lotto.quantita_iniziale, 25)
})

test('configurazioni del modulo: spento di default, stagione valida, frazioni predefinite', () => {
  const db = creaDbTest()
  const get = (k: string): { valore: string; categoria: string } =>
    db.prepare(`SELECT valore, categoria FROM configurazioni WHERE chiave = ?`).get(k) as {
      valore: string
      categoria: string
    }
  assert.deepEqual(get('modulo_agricolo_attivo'), { valore: '0', categoria: 'moduli' })
  assert.match(get('agri_stagione_corrente').valore, /^\d{4}\/\d{4}$/)
  assert.equal(get('agri_stagione_corrente').categoria, 'agricolo')
  assert.equal(get('agri_shelf_life_malto_mesi').valore, '12')
  const frazioni = JSON.parse(get('agri_frazioni_default').valore) as Array<{
    nome: string
    scarto: boolean
  }>
  assert.deepEqual(frazioni, [
    { nome: '<3 mm', scarto: true },
    { nome: '3-4 mm', scarto: false },
    { nome: '4-5 mm', scarto: false },
    { nome: '>5 mm', scarto: false }
  ])
})

test('una configurazione modificata dall utente non viene sovrascritta dalla migrazione', () => {
  const db = creaDbTest()
  db.prepare(`UPDATE configurazioni SET valore = '1' WHERE chiave = 'modulo_agricolo_attivo'`).run()
  db.prepare(
    `UPDATE configurazioni SET valore = '2030/2031' WHERE chiave = 'agri_stagione_corrente'`
  ).run()
  applicaSchema(db)
  const v = (k: string): string =>
    (db.prepare(`SELECT valore FROM configurazioni WHERE chiave = ?`).get(k) as { valore: string })
      .valore
  assert.equal(v('modulo_agricolo_attivo'), '1')
  assert.equal(v('agri_stagione_corrente'), '2030/2031')
})

test('parametri di fase predefiniti: 6 gruppi e 40 parametri nell ordine del processo', () => {
  const db = creaDbTest()
  const gruppi = db
    .prepare(`SELECT fase, nome, con_data FROM agri_gruppi_parametri ORDER BY fase, ordine`)
    .all() as Array<{ fase: string; nome: string; con_data: number }>
  assert.deepEqual(
    gruppi.map((g) => `${g.fase}/${g.nome}`),
    [
      'calibratura/Analisi orzo',
      'maltazione/Preparazione',
      'maltazione/Macerazione',
      'maltazione/Germinazione',
      'maltazione/Essiccazione',
      'maltazione/Test di laboratorio'
    ]
  )
  assert.equal(gruppi.find((g) => g.nome === 'Test di laboratorio')?.con_data, 1)
  const conteggi = db
    .prepare(
      `SELECT g.nome, COUNT(p.id) AS n FROM agri_gruppi_parametri g LEFT JOIN agri_parametri p ON p.gruppo_id = g.id GROUP BY g.id ORDER BY g.fase, g.ordine`
    )
    .all() as Array<{ nome: string; n: number }>
  assert.deepEqual(
    conteggi.map((c) => c.n),
    [2, 2, 11, 10, 5, 10]
  )
  const tipi = db
    .prepare(
      `SELECT nome, tipo, unita FROM agri_parametri WHERE nome IN ('Punta radichetta', 'Dolcezza', 'Aspetto visivo', 'Umidità')`
    )
    .all() as Array<{ nome: string; tipo: string; unita: string | null }>
  const perNome = Object.fromEntries(tipi.map((t) => [t.nome, t]))
  assert.equal(perNome['Punta radichetta'].tipo, 'si_no')
  assert.equal(perNome['Dolcezza'].tipo, 'scala')
  assert.equal(perNome['Aspetto visivo'].tipo, 'testo')
  assert.equal(perNome['Umidità'].unita, '%')
})

test('i parametri predefiniti non tornano se l utente li ha cancellati', () => {
  const db = creaDbTest()
  db.exec(`DELETE FROM agri_parametri; DELETE FROM agri_gruppi_parametri;`)
  applicaSchema(db)
  const n = (db.prepare(`SELECT COUNT(*) AS c FROM agri_gruppi_parametri`).get() as { c: number }).c
  assert.equal(n, 0)
})
