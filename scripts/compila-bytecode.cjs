// Eseguito DENTRO Electron in modalita' Node (ELECTRON_RUN_AS_NODE=1),
// cosi' il bytecode e' generato dalla stessa V8 del pacchetto distribuito.
const bytenode = require('bytenode')
const path = require('path')

const entry = path.join(__dirname, '..', 'out', 'main', 'index.js')
const out = path.join(__dirname, '..', 'out', 'main', 'index.jsc')

bytenode
  .compileFile({ filename: entry, output: out, compileAsModule: true })
  .then(() => {
    console.log('[blinda] bytecode generato:', out)
    process.exit(0)
  })
  .catch((err) => {
    console.error('[blinda] compilazione bytecode fallita:', err)
    process.exit(1)
  })
