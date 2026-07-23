import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { formattaChiave, estraiBase64url, bufferToBase64url, base64urlToBuffer } from '../src/main/chiave'

test('bufferToBase64url e base64urlToBuffer sono inversi (anche con byte che generano + e /)', () => {
  for (let i = 0; i < 500; i++) {
    const buf = randomBytes(1 + (i % 300))
    const b64url = bufferToBase64url(buf)
    // base64url non deve contenere +, /, =
    assert.equal(/[+/=]/.test(b64url), false, `alfabeto sporco: ${b64url}`)
    assert.deepEqual(base64urlToBuffer(b64url), buf)
  }
})

test('formattaChiave/estraiBase64url sono inversi anche quando il contenuto include - e _', () => {
  for (let i = 0; i < 500; i++) {
    const buf = randomBytes(1 + (i % 300))
    const b64url = bufferToBase64url(buf)
    const chiave = formattaChiave(b64url)
    assert.match(chiave, /^FRMTO-/)
    assert.equal(estraiBase64url(chiave), b64url, `round-trip rotto per: ${chiave}`)
  }
})
