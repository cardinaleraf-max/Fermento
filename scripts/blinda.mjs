// Post-build: protegge il codice prima di electron-builder.
// 1. main -> bytecode V8 (bytenode) + loader minimo
// 2. renderer -> offuscamento moderato dei bundle JS
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const electronBin = require('electron')
execFileSync(electronBin, [path.join(root, 'scripts', 'compila-bytecode.cjs')], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  stdio: 'inherit'
})

const jscPath = path.join(root, 'out', 'main', 'index.jsc')
if (!fs.existsSync(jscPath) || fs.statSync(jscPath).size === 0) {
  throw new Error('[blinda] index.jsc mancante o vuoto')
}

fs.writeFileSync(
  path.join(root, 'out', 'main', 'index.js'),
  `'use strict';require('bytenode');module.exports=require('./index.jsc');\n`
)
console.log('[blinda] main sostituito con loader bytecode')

const JavaScriptObfuscator = require('javascript-obfuscator')
const assetsDir = path.join(root, 'out', 'renderer', 'assets')
for (const file of fs.readdirSync(assetsDir)) {
  if (!file.endsWith('.js')) continue
  const filePath = path.join(assetsDir, file)
  const code = fs.readFileSync(filePath, 'utf8')
  const result = JavaScriptObfuscator.obfuscate(code, {
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
  })
  fs.writeFileSync(filePath, result.getObfuscatedCode())
  console.log('[blinda] offuscato', file)
}
console.log('[blinda] completato')
