import { test } from 'node:test'
import assert from 'node:assert/strict'
import { creaDbTest } from './helpers'
import { lotto, materia } from './fixture'
import { motivoBloccoEliminazioneLotto, motivoBloccoEliminazioneMateria, registraConsumi, scaricaPerMateria } from '../../src/main/agricolo/servizi/magazzino'
import { salvaCampo, salvaSemina } from '../../src/main/agricolo/servizi/campi'
import { salvaOperazione } from '../../src/main/agricolo/servizi/operazioni'
import { salvaRaccolta } from '../../src/main/agricolo/servizi/lavorazioni'

const Database = require('better-sqlite3') as typeof import('better-sqlite3')

test('un lotto acquistato e mai usato si puo eliminare (comportamento di oggi invariato)', () => {
  const db = creaDbTest()
  const m = materia(db, 'Malto Pils', 'malto', 'kg')
  const l = lotto(db, m, 'MP-1', 25)
  assert.equal(motivoBloccoEliminazioneLotto(db, l), null)
})

test('un lotto creato da una raccolta non si elimina dal magazzino', () => {
  const db = creaDbTest()
  const campo = salvaCampo(db, null, { nome: 'C', superficie_ha: 1, localita: null, rif_catastale: null, note: null })
  const semina = salvaSemina(db, null, {
    campo_id: campo, stagione: '2025/2026', coltura: 'orzo', varieta: null, data: '2025-11-01',
    superficie_ha: 1, semente_testo: null, semente: null, note: null
  })
  const grezzo = materia(db, 'Orzo grezzo', 'orzo_grezzo', 'q')
  const rac = salvaRaccolta(db, null, {
    semina_id: semina, data: '2026-06-20', stagione: '2025/2026', materia_prima_id: grezzo, quantita: 10, codice: 'R1', data_scadenza: null, note: null
  })
  const l = (db.prepare(`SELECT id FROM lotti_materie_prime WHERE origine_id = ? AND origine_tipo = 'raccolta'`).get(rac) as { id: number }).id
  assert.match(motivoBloccoEliminazioneLotto(db, l) ?? '', /raccolta/i)
  assert.match(motivoBloccoEliminazioneMateria(db, grezzo) ?? '', /raccolt/i)
})

test('un lotto di input usato in un operazione di campo (anche se il residuo e stato riportato a mano) non si elimina', () => {
  const db = creaDbTest()
  const campo = salvaCampo(db, null, { nome: 'C', superficie_ha: 1, localita: null, rif_catastale: null, note: null })
  const semina = salvaSemina(db, null, {
    campo_id: campo, stagione: '2025/2026', coltura: 'orzo', varieta: null, data: '2025-11-01',
    superficie_ha: 1, semente_testo: null, semente: null, note: null
  })
  const npk = materia(db, 'NPK', 'concime', 'q')
  const l = lotto(db, npk, 'N1', 10)
  salvaOperazione(db, null, { semina_id: semina, tipo: 'concimazione', data: '2026-02-01', prodotto: { materia_prima_id: npk, quantita: 2, lotto_id: null }, motivo: null, operatore: null, note: null })
  db.prepare(`UPDATE lotti_materie_prime SET quantita_residua = quantita_iniziale WHERE id = ?`).run(l)
  assert.match(motivoBloccoEliminazioneLotto(db, l) ?? '', /filiera|operazione/i)
  assert.match(motivoBloccoEliminazioneMateria(db, npk) ?? '', /operazion/i)
  // registraConsumi/scaricaPerMateria importati per coerenza con il modulo
  assert.equal(typeof registraConsumi, 'function')
  assert.equal(typeof scaricaPerMateria, 'function')
})

test('database ripristinato da un backup vecchio (senza tabelle e colonne agricole): nessun errore', () => {
  const db = new Database(':memory:')
  db.exec(`CREATE TABLE lotti_materie_prime (id INTEGER PRIMARY KEY, materia_prima_id INTEGER, quantita_iniziale REAL, quantita_residua REAL);
           CREATE TABLE materie_prime (id INTEGER PRIMARY KEY, nome TEXT);`)
  db.exec(`INSERT INTO materie_prime (id, nome) VALUES (1, 'Malto'); INSERT INTO lotti_materie_prime (id, materia_prima_id, quantita_iniziale, quantita_residua) VALUES (1, 1, 10, 10);`)
  assert.equal(motivoBloccoEliminazioneLotto(db, 1), null)
  assert.equal(motivoBloccoEliminazioneMateria(db, 1), null)
})
