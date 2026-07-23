// Post-build: protegge il codice prima di electron-builder.
// Offusca main, preload e renderer con javascript-obfuscator.
//
// NB: NON si usa piu' bytenode/bytecode V8. Il bytecode V8 non e' portabile
// tra sistemi operativi: compilato su Mac veniva rifiutato da Windows
// ("cachedDataRejected"), bloccando l'app all'avvio. L'offuscamento e'
// invece cross-platform e si genera dal Mac anche per il pacchetto Windows.
import JavaScriptObfuscator from 'javascript-obfuscator'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const OPZIONI = {
  compact: true,
  identifierNamesGenerator: 'hexadecimal',
  stringArray: true,
  stringArrayThreshold: 0.5,
  stringArrayEncoding: ['base64'],
  // controlFlowFlattening e deadCodeInjection restano spenti:
  // degradano le prestazioni della UI senza vero guadagno di protezione
  controlFlowFlattening: false,
  deadCodeInjection: false,
  selfDefending: false,
  renameGlobals: false
}

function offusca(filePath) {
  const code = fs.readFileSync(filePath, 'utf8')
  const result = JavaScriptObfuscator.obfuscate(code, OPZIONI)
  fs.writeFileSync(filePath, result.getObfuscatedCode())
  console.log('[blinda] offuscato', path.relative(root, filePath))
}

// main + preload (bundle singolo ciascuno prodotti da electron-vite)
for (const rel of ['out/main/index.js', 'out/preload/index.js']) {
  const p = path.join(root, rel)
  if (!fs.existsSync(p)) throw new Error(`[blinda] file mancante: ${rel}`)
  offusca(p)
}

// renderer: tutti i bundle JS
const assetsDir = path.join(root, 'out', 'renderer', 'assets')
for (const file of fs.readdirSync(assetsDir)) {
  if (!file.endsWith('.js')) continue
  offusca(path.join(assetsDir, file))
}

console.log('[blinda] completato')
