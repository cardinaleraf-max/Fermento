import { createSign, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { bufferToBase64url, formattaChiave } from '../src/main/chiave'

const args = process.argv.slice(2)
if (args.length < 2) {
  console.error('Uso: npm run genera-licenza -- "Nome Birrificio" <mai|annuale|YYYY-MM-DD> ["MACC-..."]')
  process.exit(1)
}

const intestatario = args[0]
const scadenzaArg = args[1].toLowerCase()
const macchina = args[2]?.trim() || undefined

let scadenza: string | null
if (scadenzaArg === 'mai') {
  scadenza = null
} else if (scadenzaArg === 'annuale') {
  const d = new Date()
  d.setFullYear(d.getFullYear() + 1)
  scadenza = d.toISOString().split('T')[0]
} else {
  scadenza = args[1]
}

if (macchina && !/^MACC-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/.test(macchina)) {
  console.error('ERRORE: codice macchina non valido. Atteso formato MACC-XXXXX-XXXXX-XXXXX-XXXXX')
  process.exit(1)
}

const privatePath = join(homedir(), '.fermento-licensing', 'private.pem')
let privateKey: string
try {
  privateKey = readFileSync(privatePath, 'utf-8')
} catch {
  console.error('ERRORE: Chiave privata non trovata in ' + privatePath)
  console.error('Esegui prima: npm run genera-chiavi')
  process.exit(1)
}

const payloadObj: Record<string, unknown> = {
  intestatario,
  scadenza,
  emessa_il: new Date().toISOString(),
  id: randomUUID()
}
if (macchina) payloadObj.macchina = macchina

const payload = JSON.stringify(payloadObj)
const sign = createSign('RSA-SHA256')
sign.update(payload)
const firma = sign.sign(privateKey, 'base64')

const raw = JSON.stringify({ payload, firma })
const chiave = formattaChiave(bufferToBase64url(Buffer.from(raw)))

console.log('\n=== CHIAVE LICENZA ===')
console.log(chiave)
console.log('\nIntestata a:', intestatario)
console.log('Scadenza:', scadenza ?? 'Mai (perpetua)')
console.log('Legata al PC:', macchina ?? 'NO (gira su qualsiasi computer)')
