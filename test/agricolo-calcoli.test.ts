import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stagioneDaData } from '../src/main/agricolo/calcoli'

test('stagioneDaData: da luglio parte la stagione nuova', () => {
  assert.equal(stagioneDaData('2026-10-09'), '2026/2027')
  assert.equal(stagioneDaData('2026-07-01'), '2026/2027')
  assert.equal(stagioneDaData('2026-06-30'), '2025/2026')
  assert.equal(stagioneDaData('2027-01-15'), '2026/2027')
})
