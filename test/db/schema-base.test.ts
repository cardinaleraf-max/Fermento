import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applicaSchema } from '../../src/main/database'
import { creaDbTest, nomiTabelle } from './helpers'

test('applicaSchema crea le tabelle base di Fermento', () => {
  const db = creaDbTest()
  const tabelle = nomiTabelle(db)
  for (const t of ['configurazioni', 'materie_prime', 'lotti_materie_prime', 'cotte', 'cotta_materie_prime', 'confezionamento', 'movimenti_confezionamento', 'vendite', 'licenza', 'movimenti_fusti_rendere']) {
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
