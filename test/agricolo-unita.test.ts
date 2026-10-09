import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aKg, arrotonda, converti, daKg, fattoreKg } from '../src/main/agricolo/unita'

test('arrotonda elimina il rumore dei decimali (300 x 69% = 207)', () => {
  assert.equal(arrotonda(300 * 0.69), 207)
  assert.equal(arrotonda(0.1 + 0.2), 0.3)
  assert.equal(arrotonda(1.23456, 2), 1.23)
})

test('fattoreKg: kg, quintali e grammi; litri non convertibili', () => {
  assert.equal(fattoreKg('kg'), 1)
  assert.equal(fattoreKg('q'), 100)
  assert.equal(fattoreKg('g'), 0.001)
  assert.equal(fattoreKg('L'), null)
})

test('aKg e daKg convertono tra quintali e chili', () => {
  assert.equal(aKg(300, 'q'), 30000)
  assert.equal(aKg(1100, 'kg'), 1100)
  assert.equal(aKg(500, 'g'), 0.5)
  assert.equal(aKg(3, 'L'), null)
  assert.equal(daKg(1100, 'q'), 11)
  assert.equal(daKg(920, 'kg'), 920)
  assert.equal(daKg(5, 'L'), null)
})

test('converti: stessa unita sempre possibile, unita incompatibili danno null', () => {
  assert.equal(converti(300, 'q', 'kg'), 30000)
  assert.equal(converti(1100, 'kg', 'q'), 11)
  assert.equal(converti(5, 'L', 'L'), 5)
  assert.equal(converti(1, 'L', 'kg'), null)
  assert.equal(converti(1, 'kg', 'L'), null)
})
