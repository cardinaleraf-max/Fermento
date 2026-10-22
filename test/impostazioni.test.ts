import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  categoriaVisibile,
  ordinaCategorie,
  titoloCategoria
} from '../src/renderer/src/lib/impostazioni'

test('categorie nascoste ai clienti: sistema, doppioni, Bira, moduli e agricolo', () => {
  for (const c of ['sistema', 'generale', 'backup', 'assistente_ai', 'moduli', 'agricolo']) {
    assert.equal(categoriaVisibile(c), false, c)
  }
  for (const c of ['produzione', 'magazzino', 'avvisi', 'vendite', 'nuova']) {
    assert.equal(categoriaVisibile(c), true, c)
  }
})

test('titoli leggibili e ordine fisso, le sconosciute in fondo in ordine alfabetico', () => {
  assert.equal(titoloCategoria('produzione'), 'Produzione')
  assert.equal(titoloCategoria('magazzino'), 'Magazzino confezionamento')
  assert.equal(titoloCategoria('xyz'), 'Xyz')
  assert.deepEqual(
    ordinaCategorie(['vendite', 'zeta', 'avvisi', 'alfa', 'magazzino', 'produzione']),
    ['produzione', 'magazzino', 'avvisi', 'vendite', 'alfa', 'zeta']
  )
})
