import { generateKeyPairSync } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const dir = join(homedir(), '.fermento-licensing')
const privatePath = join(dir, 'private.pem')
const publicPath = join(dir, 'public.pem')

if (existsSync(privatePath) || existsSync(publicPath)) {
  console.error('ERRORE: Le chiavi esistono già in ' + dir)
  console.error('Le chiavi RSA non si rigenerano mai. Usa quelle esistenti.')
  process.exit(1)
}

mkdirSync(dir, { recursive: true })

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
})

writeFileSync(privatePath, privateKey, { mode: 0o600 })
writeFileSync(publicPath, publicKey)

console.log('\nChiavi generate con successo in ' + dir)
console.log('\n=== CHIAVE PUBBLICA (copia in src/main/licenza.ts) ===\n')
console.log(publicKey)
