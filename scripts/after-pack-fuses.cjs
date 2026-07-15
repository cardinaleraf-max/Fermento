// Hook electron-builder: brucia i fuses nell'eseguibile distribuito.
// Chiude modalita' Node, flag di debug da riga di comando e caricamento fuori asar.
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses')
const path = require('path')
const fs = require('fs')

exports.default = async function afterPack(context) {
  const { electronPlatformName, appOutDir, packager } = context
  let executable
  if (electronPlatformName === 'win32') {
    const nomi = ['fermento.exe', `${packager.appInfo.productFilename}.exe`]
    const trovato = nomi.find((n) => fs.existsSync(path.join(appOutDir, n)))
    if (!trovato) {
      throw new Error(`[fuses] eseguibile non trovato in ${appOutDir} (cercati: ${nomi.join(', ')})`)
    }
    executable = path.join(appOutDir, trovato)
  } else if (electronPlatformName === 'darwin') {
    executable = path.join(
      appOutDir,
      `${packager.appInfo.productFilename}.app`,
      'Contents',
      'MacOS',
      packager.appInfo.productFilename
    )
  } else {
    executable = path.join(appOutDir, 'fermento')
  }

  await flipFuses(executable, {
    version: FuseVersion.V1,
    [FuseV1Options.RunAsNode]: false,
    [FuseV1Options.EnableNodeCliInspectArguments]: false,
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
    [FuseV1Options.OnlyLoadAppFromAsar]: true,
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: electronPlatformName !== 'linux'
  })
  console.log('[fuses] bruciati su', executable)
}
