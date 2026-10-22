import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compatta, tronca } from '../src/main/ai/compatta'

test('compatta: toglie vuoti e null, arrotonda i numeri, conserva zeri e false', () => {
  assert.deepEqual(
    compatta({
      a: null,
      b: '',
      c: [],
      d: 4.800000000001,
      e: 0,
      f: false,
      g: { h: null, i: [1, null, 2.33333] },
      j: {}
    }),
    { d: 4.8, e: 0, f: false, g: { i: [1, 2.333] } }
  )
})

test('tronca: lascia i testi corti e taglia quelli lunghi avvisando', () => {
  assert.equal(tronca('{"a":1}', 100), '{"a":1}')
  const t = tronca('x'.repeat(200), 50)
  assert.ok(t.startsWith('x'.repeat(50)))
  assert.match(t, /troncato/)
})
