import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, createSign } from 'node:crypto'
import { verificaLicenza } from '../src/main/licenza'
import { bufferToBase64url, formattaChiave } from '../src/main/chiave'

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PUB = publicKey.export({ type: 'spki', format: 'pem' }).toString()

function generaChiaveTest(payloadObj: Record<string, unknown>): string {
  const payload = JSON.stringify(payloadObj)
  const sign = createSign('RSA-SHA256')
  sign.update(payload)
  const firma = sign.sign(privateKey, 'base64')
  const raw = JSON.stringify({ payload, firma })
  return formattaChiave(bufferToBase64url(Buffer.from(raw)))
}

const base = { intestatario: 'Birrificio Test', scadenza: null, emessa_il: '2026-07-23T00:00:00Z', id: 'x1' }

test('licenza con macchina che combacia → valida', () => {
  const chiave = generaChiaveTest({ ...base, macchina: 'MACC-AAAAA-BBBBB-CCCCC-DDDDD' })
  const r = verificaLicenza(chiave, 'MACC-AAAAA-BBBBB-CCCCC-DDDDD', PUB)
  assert.equal(r.valida, true)
})

test('licenza con macchina che NON combacia → invalida con errore chiaro', () => {
  const chiave = generaChiaveTest({ ...base, macchina: 'MACC-AAAAA-BBBBB-CCCCC-DDDDD' })
  const r = verificaLicenza(chiave, 'MACC-ZZZZZ-ZZZZZ-ZZZZZ-ZZZZZ', PUB)
  assert.equal(r.valida, false)
  if (!r.valida) assert.equal(r.errore, 'Licenza legata a un altro computer')
})

test('licenza SENZA macchina (vecchio stile) → valida (retrocompatibilità)', () => {
  const chiave = generaChiaveTest({ ...base })
  const r = verificaLicenza(chiave, 'MACC-QUALSIASI-CODICE-QUI-00', PUB)
  assert.equal(r.valida, true)
})

test('licenza scaduta → invalida', () => {
  const chiave = generaChiaveTest({ ...base, scadenza: '2000-01-01' })
  const r = verificaLicenza(chiave, undefined, PUB)
  assert.equal(r.valida, false)
  if (!r.valida) assert.equal(r.errore, 'Licenza scaduta')
})

test('scorciatoia fondatore RIMOSSA → non è più valida', () => {
  const r = verificaLicenza('FONDATORE-LUCA-LOOKDOWN')
  assert.equal(r.valida, false)
})

test('round-trip firma reale con payload lungo → valida (blinda il baco trattini)', () => {
  const lungo = { ...base, intestatario: 'Birrificio Con Un Nome Molto Lungo Per Forzare + e / nel base64 ' + 'x'.repeat(50), macchina: 'MACC-AAAAA-BBBBB-CCCCC-DDDDD' }
  const chiave = generaChiaveTest(lungo)
  const r = verificaLicenza(chiave, 'MACC-AAAAA-BBBBB-CCCCC-DDDDD', PUB)
  assert.equal(r.valida, true)
})
