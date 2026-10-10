import { test } from 'node:test'
import assert from 'node:assert/strict'
import type BetterSqlite3 from 'better-sqlite3'
import { creaDbTest } from './helpers'
import {
  collegamentiMovimento,
  lottiImballiCotta,
  materialiImballoConfezionamento,
  salvaLottiImballi
} from '../../src/main/agricolo/servizi/imballi'
import { ErroreUtente } from '../../src/main/agricolo/errori'

const Database = require('better-sqlite3') as typeof import('better-sqlite3')
type Db = BetterSqlite3.Database

function materiale(db: Db, nome: string, categoria: string): number {
  return Number(
    db
      .prepare(`INSERT INTO materiali_confezionamento (nome, categoria, attivo) VALUES (?, ?, 1)`)
      .run(nome, categoria).lastInsertRowid
  )
}

function carico(
  db: Db,
  materialeId: number,
  q: number,
  lotto: string | null,
  fornitore: string | null,
  data = '2026-09-01 10:00:00'
): number {
  return Number(
    db
      .prepare(
        `INSERT INTO movimenti_confezionamento (materiale_id, tipo_movimento, quantita, data, causale, lotto_fornitore, fornitore)
         VALUES (?, 'carico', ?, ?, 'acquisto', ?, ?)`
      )
      .run(materialeId, q, data, lotto, fornitore).lastInsertRowid
  )
}

function cotta(db: Db, numero = 'L-2026-40'): number {
  const birra = Number(db.prepare(`INSERT INTO birre (nome) VALUES ('Pils')`).run().lastInsertRowid)
  return Number(
    db
      .prepare(
        `INSERT INTO cotte (numero_lotto, birra_id, data_inizio, litri_teorici) VALUES (?, ?, '2026-09-10', 500)`
      )
      .run(numero, birra).lastInsertRowid
  )
}

test('materiali da proporre al confezionamento: bottiglia e tappo come li sceglie il confezionamento, piu i fusti', () => {
  const db = creaDbTest()
  const bott = materiale(db, 'Bottiglia 33 cl', 'bottiglia')
  materiale(db, 'Bottiglia 75 cl', 'bottiglia')
  const tappo = materiale(db, 'Tappo corona', 'tappo')
  const fusto = materiale(db, 'Fusto 20 L', 'fusto')
  materiale(db, 'Etichetta Pils', 'etichetta')
  carico(db, bott, 5000, 'VER-123', 'Verallia', '2026-08-01 10:00:00')
  carico(db, bott, 3000, 'VER-456', 'Verallia', '2026-09-01 10:00:00')
  const c = cotta(db)
  const m = materialiImballoConfezionamento(db, c, { bottiglie: true, fusti: [fusto] })
  assert.deepEqual(
    m.map((x) => x.materiale_id),
    [bott, tappo, fusto]
  )
  assert.deepEqual(
    m[0].carichi.map((x) => x.lotto_fornitore),
    ['VER-456', 'VER-123']
  )
  assert.equal(m[0].carichi[0].fornitore, 'Verallia')
  assert.deepEqual(materialiImballoConfezionamento(db, c, { bottiglie: false, fusti: [] }), [])
})

test('collega i lotti imballi a una cotta, li rilegge, sostituisce l insieme', () => {
  const db = creaDbTest()
  const bott = materiale(db, 'Bottiglia 33 cl', 'bottiglia')
  const tappo = materiale(db, 'Tappo corona', 'tappo')
  const cb = carico(db, bott, 5000, 'VER-123', 'Verallia')
  const ct = carico(db, tappo, 10000, 'TAP-9', 'Pelliconi')
  const c = cotta(db)
  salvaLottiImballi(db, c, [cb, ct, cb])
  const righe = lottiImballiCotta(db, c)
  assert.deepEqual(
    righe.map((r) => [r.materiale_nome, r.lotto_fornitore, r.fornitore]),
    [
      ['Bottiglia 33 cl', 'VER-123', 'Verallia'],
      ['Tappo corona', 'TAP-9', 'Pelliconi']
    ]
  )
  salvaLottiImballi(db, c, [ct])
  assert.deepEqual(
    lottiImballiCotta(db, c).map((r) => r.movimento_id),
    [ct]
  )
  salvaLottiImballi(db, c, [])
  assert.deepEqual(lottiImballiCotta(db, c), [])
})

test('solo movimenti di carico si possono collegare', () => {
  const db = creaDbTest()
  const bott = materiale(db, 'Bottiglia 33 cl', 'bottiglia')
  const scarico = Number(
    db
      .prepare(
        `INSERT INTO movimenti_confezionamento (materiale_id, tipo_movimento, quantita, causale) VALUES (?, 'scarico', 10, 'produzione')`
      )
      .run(bott).lastInsertRowid
  )
  const c = cotta(db)
  assert.throws(() => salvaLottiImballi(db, c, [scarico]), ErroreUtente)
  assert.throws(() => salvaLottiImballi(db, c, [999]), ErroreUtente)
  assert.throws(() => salvaLottiImballi(db, 999, []), ErroreUtente)
})

test('un carico collegato a una cotta lo dice (per bloccarne l eliminazione)', () => {
  const db = creaDbTest()
  const bott = materiale(db, 'Bottiglia 33 cl', 'bottiglia')
  const cb = carico(db, bott, 5000, 'VER-123', 'Verallia')
  const libero = carico(db, bott, 100, null, null)
  const c = cotta(db, 'L-2026-41')
  salvaLottiImballi(db, c, [cb])
  assert.match(collegamentiMovimento(db, cb) ?? '', /L-2026-41/)
  assert.equal(collegamentiMovimento(db, libero), null)
})

test('database ripristinato da un backup vecchio (senza la tabella): nessun errore, nessun collegamento', () => {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE cotte (id INTEGER PRIMARY KEY, numero_lotto TEXT)`)
  assert.deepEqual(lottiImballiCotta(db, 1), [])
  assert.equal(collegamentiMovimento(db, 1), null)
})
