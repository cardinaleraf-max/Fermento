import https from 'https'
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const VERSION = 'v12.10.0'
const ELECTRON_ABI = 'v140'
const TARBALL_NAME = `better-sqlite3-${VERSION}-electron-${ELECTRON_ABI}-win32-x64.tar.gz`
const DOWNLOAD_URL = `https://github.com/WiseLibs/better-sqlite3/releases/download/${VERSION}/${TARBALL_NAME}`
const TMP_TARBALL = '/tmp/bsqlite-win.tar.gz'
const TMP_EXTRACT_DIR = '/tmp/bsqlite-win'
const SOURCE_BINARY = `${TMP_EXTRACT_DIR}/build/Release/better_sqlite3.node`
const DEST_BINARY = path.join(ROOT, 'node_modules/better-sqlite3/build/Release/better_sqlite3.node')

function log(msg) {
  console.log(`[prepare-win-binary] ${msg}`)
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    const follow = (u) => {
      https.get(u, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          follow(res.headers.location)
          return
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} scaricando ${u}`))
          return
        }
        res.pipe(file)
        file.on('finish', () => file.close(resolve))
        file.on('error', reject)
      }).on('error', reject)
    }
    follow(url)
  })
}

function verifyWindowsBinary(filePath) {
  const buf = Buffer.alloc(4)
  const fd = fs.openSync(filePath, 'r')
  fs.readSync(fd, buf, 0, 4, 0)
  fs.closeSync(fd)

  const b0 = buf[0], b1 = buf[1], b2 = buf[2], b3 = buf[3]

  // MZ = PE Windows
  if (b0 === 0x4D && b1 === 0x5A) return true

  // Mach-O (fat binary o 64-bit)
  if ((b0 === 0xCF && b1 === 0xFA && b2 === 0xED && b3 === 0xFE) ||
      (b0 === 0xFE && b1 === 0xED && b2 === 0xFA && b3 === 0xCF) ||
      (b0 === 0xCA && b1 === 0xFE && b2 === 0xBA && b3 === 0xBE)) {
    log('ERRORE: rilevato binario Mach-O (macOS). Build interrotta.')
    return false
  }

  // ELF (Linux)
  if (b0 === 0x7F && b1 === 0x45 && b2 === 0x4C && b3 === 0x46) {
    log('ERRORE: rilevato binario ELF (Linux). Build interrotta.')
    return false
  }

  log(`ERRORE: firma sconosciuta: ${buf.toString('hex')}. Build interrotta.`)
  return false
}

// ── main ──────────────────────────────────────────────────────────────────────

log(`Download ${TARBALL_NAME}...`)
await download(DOWNLOAD_URL, TMP_TARBALL)
log(`Download completato → ${TMP_TARBALL}`)

log(`Estrazione in ${TMP_EXTRACT_DIR}...`)
fs.rmSync(TMP_EXTRACT_DIR, { recursive: true, force: true })
fs.mkdirSync(TMP_EXTRACT_DIR, { recursive: true })
execSync(`tar -xzf ${TMP_TARBALL} -C ${TMP_EXTRACT_DIR}`)
log('Estrazione completata.')

log(`Copia binario Windows → ${DEST_BINARY}`)
fs.mkdirSync(path.dirname(DEST_BINARY), { recursive: true })
fs.copyFileSync(SOURCE_BINARY, DEST_BINARY)
log('Copia completata.')

log('Verifica firma PE (MZ)...')
if (!verifyWindowsBinary(DEST_BINARY)) {
  console.error('[prepare-win-binary] ERRORE: il binario better_sqlite3.node NON è un eseguibile Windows valido. Build interrotta.')
  process.exit(1)
}
log('Verifica OK: binario Windows valido (firma MZ).')
