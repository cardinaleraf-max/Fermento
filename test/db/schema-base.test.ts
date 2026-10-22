import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applicaSchema } from '../../src/main/database'
import { creaDbTest, nomiTabelle } from './helpers'

test('applicaSchema crea le tabelle base di Fermento', () => {
  const db = creaDbTest()
  const tabelle = nomiTabelle(db)
  for (const t of [
    'configurazioni',
    'materie_prime',
    'lotti_materie_prime',
    'cotte',
    'cotta_materie_prime',
    'confezionamento',
    'movimenti_confezionamento',
    'vendite',
    'licenza',
    'movimenti_fusti_rendere'
  ]) {
    assert.ok(tabelle.includes(t), `manca la tabella ${t}`)
  }
})

test('applicaSchema eseguita due volte non lancia e non duplica le configurazioni', () => {
  const db = creaDbTest()
  const prima = (db.prepare(`SELECT COUNT(*) AS c FROM configurazioni`).get() as { c: number }).c
  applicaSchema(db)
  const dopo = (db.prepare(`SELECT COUNT(*) AS c FROM configurazioni`).get() as { c: number }).c
  assert.equal(dopo, prima)
})

const valoreConfig = (db: ReturnType<typeof creaDbTest>, chiave: string): string =>
  (db.prepare(`SELECT valore FROM configurazioni WHERE chiave = ?`).get(chiave) as { valore: string })
    .valore

test('installazione nuova chiusa dopo la password: il nome non diventa «Birrificio Lookdown» e la configurazione iniziale resta da fare', () => {
  const db = creaDbTest()
  db.prepare(`INSERT INTO utente (id, nome, password_hash) VALUES (1, 'Titolare', 'hash')`).run()
  applicaSchema(db)
  assert.equal(valoreConfig(db, 'nome_birrificio'), '')
  assert.equal(valoreConfig(db, 'onboarding_completato'), '0')
})

test('DB esistente con dati di lavoro e password: configurazione iniziale segnata come fatta, nome non toccato', () => {
  const db = creaDbTest()
  db.prepare(`INSERT INTO utente (id, nome, password_hash) VALUES (1, 'Titolare', 'hash')`).run()
  db.prepare(`INSERT INTO clienti (nome) VALUES ('Pub di prova')`).run()
  applicaSchema(db)
  assert.equal(valoreConfig(db, 'onboarding_completato'), '1')
  assert.equal(valoreConfig(db, 'nome_birrificio'), '')
})
