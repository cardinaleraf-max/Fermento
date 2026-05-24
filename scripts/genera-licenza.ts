import { createSign, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const args = process.argv.slice(2)
if (args.length < 2) {
  console.error('Uso: npm run genera-licenza -- "Nome Birrificio" "YYYY-MM-DD" oppure "mai"')
  process.exit(1)
}

const intestatario = args[0]
const scadenzaArg = args[1]
const scadenza = scadenzaArg.toLowerCase() === 'mai' ? null : scadenzaArg

const privatePath = join(homedir(), '.fermento-licensing', 'private.pem')
let privateKey: string
try {
  privateKey = readFileSync(privatePath, 'utf-8')
} catch {
  console.error('ERRORE: Chiave privata non trovata in ' + privatePath)
  console.error('Esegui prima: npm run genera-chiavi')
  process.exit(1)
}

const payload = JSON.stringify({
  intestatario,
  scadenza,
  emessa_il: new Date().toISOString(),
  id: randomUUID()
})

const sign = createSign('RSA-SHA256')
sign.update(payload)
const firma = sign.sign(privateKey, 'base64')

const raw = JSON.stringify({ payload, firma })
const base64url = Buffer.from(raw)
  .toString('base64')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/, '')

// Formatta in gruppi di 5 separati da trattini, prefisso FRMTO
const chars = base64url.replace(/[^A-Za-z0-9_-]/g, '')
const gruppi: string[] = []
for (let i = 0; i < chars.length; i += 5) {
  gruppi.push(chars.slice(i, i + 5))
}
const chiave = 'FRMTO-' + gruppi.join('-')

console.log('\n=== CHIAVE LICENZA ===')
console.log(chiave)
console.log('\nIntestata a:', intestatario)
console.log('Scadenza:', scadenza ?? 'Mai')
