import { test } from 'node:test'
import assert from 'node:assert/strict'
import { codiceMacchina } from '../src/main/impronta'

test('codiceMacchina ha formato MACC-XXXXX-XXXXX-XXXXX-XXXXX', () => {
  const c = codiceMacchina()
  assert.match(c, /^MACC-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/)
})

test('codiceMacchina e\' stabile tra chiamate', () => {
  assert.equal(codiceMacchina(), codiceMacchina())
})
