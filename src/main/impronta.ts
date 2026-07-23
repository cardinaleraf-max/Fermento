// Impronta hardware del PC → codice MACC-... da scrivere dentro la licenza.
// Nessuna dipendenza esterna. Deve funzionare in Electron packaged.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { hostname, networkInterfaces } from 'node:os'

function idHardwareGrezzo(): string {
  try {
    if (process.platform === 'darwin') {
      const out = execFileSync('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], {
        encoding: 'utf-8',
        timeout: 5000
      })
      const m = out.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/)
      if (m) return 'uuid:' + m[1]
    } else if (process.platform === 'win32') {
      const out = execFileSync(
        'reg',
        ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid', '/reg:64'],
        { encoding: 'utf-8', timeout: 5000 }
      )
      const m = out.match(/MachineGuid\s+REG_SZ\s+([A-Fa-f0-9-]+)/)
      if (m) return 'guid:' + m[1]
    }
  } catch {
    // fallback sotto
  }
  // Fallback stabile: hostname + primo MAC non-interno
  let mac = ''
  const ifs = networkInterfaces()
  for (const nome of Object.keys(ifs)) {
    for (const info of ifs[nome] ?? []) {
      if (!info.internal && info.mac && info.mac !== '00:00:00:00:00:00') {
        mac = info.mac
        break
      }
    }
    if (mac) break
  }
  return 'fallback:' + hostname() + '|' + mac
}

let cache: string | null = null

export function codiceMacchina(): string {
  if (cache) return cache
  const hash = createHash('sha256').update(idHardwareGrezzo()).digest('hex').toUpperCase()
  // Prendi 20 hex char (~80 bit), formatta a gruppi di 5.
  const troncato = hash.slice(0, 20)
  const gruppi = troncato.match(/.{1,5}/g) as string[]
  cache = 'MACC-' + gruppi.join('-')
  return cache
}
