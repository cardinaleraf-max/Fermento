import fs from 'node:fs'
import path from 'node:path'
import { app, dialog, type BrowserWindow } from 'electron'
import { getDatabaseFilePath } from './database'
import { DEMO_AVVISO_ANTICIPO_MINUTI, DEMO_DURATA_SESSIONE_MINUTI } from '../shared/demo'

/**
 * Versione dimostrativa (build con DEMO_BUILD=1). Nella build normale
 * __DEMO_MODE__ è false e queste funzioni non vengono mai chiamate.
 *
 * Regole della demo: dati di esempio ripristinati a ogni avvio, sessione a
 * tempo, niente licenza, niente backup, niente aggiornamenti automatici,
 * assistente Bira spento.
 */

export const NON_DISPONIBILE_IN_DEMO = 'Non disponibile nella versione demo'

/** Cartella dati separata: la demo non tocca mai un'installazione vera di Fermento. */
export function usaCartellaDemo(): void {
  // Un --user-data-dir esplicito (test automatici) ha la precedenza.
  if (app.commandLine.hasSwitch('user-data-dir')) return
  app.setPath('userData', path.join(app.getPath('appData'), 'Fermento Demo'))
}

/** Rimette il database di esempio incluso nel pacchetto (resources/demo). */
export function ripristinaDatiDemo(): void {
  const dbPath = getDatabaseFilePath()
  const seedPath = app.isPackaged
    ? path.join(process.resourcesPath, 'demo', 'fermento-demo-seed.db')
    : path.join(app.getAppPath(), 'resources', 'demo', 'fermento-demo-seed.db')
  try {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
    for (const f of [dbPath, `${dbPath}-wal`, `${dbPath}-shm`, `${dbPath}-journal`]) {
      if (fs.existsSync(f)) fs.unlinkSync(f)
    }
    if (fs.existsSync(seedPath)) fs.copyFileSync(seedPath, dbPath)
    else console.error('[demo] database di esempio mancante:', seedPath)
  } catch (e) {
    console.error('[demo] ripristino dati di esempio non riuscito:', e)
  }
}

/** Blocca un canale nella demo (true = bloccato). */
export function vietatoInDemo(canale: string): boolean {
  if (!__DEMO_MODE__) return false
  console.warn(`[demo] canale bloccato: ${canale}`)
  return true
}

/** Impostazioni che nella demo non si salvano (assistente AI e backup). */
export function chiaveBloccataInDemo(chiave: string): boolean {
  return __DEMO_MODE__ && (chiave.startsWith('ai_') || chiave.startsWith('backup_'))
}

/** Avviso qualche minuto prima della fine, poi chiusura dell'app. */
export function avviaTimeoutDemo(finestra: BrowserWindow): void {
  setTimeout(
    () => {
      if (finestra.isDestroyed()) return
      dialog
        .showMessageBox(finestra, {
          type: 'info',
          title: 'Versione demo',
          message: `La sessione demo terminerà tra ${DEMO_AVVISO_ANTICIPO_MINUTI} minuti.`,
          detail: 'Riaprendo Fermento Demo si riparte con i dati di esempio.',
          buttons: ['OK']
        })
        .catch((e) => console.error('[demo] avviso fine sessione non riuscito:', e))
    },
    (DEMO_DURATA_SESSIONE_MINUTI - DEMO_AVVISO_ANTICIPO_MINUTI) * 60 * 1000
  )

  setTimeout(
    async () => {
      try {
        if (!finestra.isDestroyed()) {
          await dialog.showMessageBox(finestra, {
            type: 'info',
            title: 'Sessione demo terminata',
            message: 'La sessione demo è terminata.',
            detail: 'Riapri Fermento Demo per ricominciare con i dati di esempio.',
            buttons: ['Chiudi']
          })
        }
      } catch (e) {
        console.error('[demo] messaggio di chiusura non riuscito:', e)
      } finally {
        app.quit()
      }
    },
    DEMO_DURATA_SESSIONE_MINUTI * 60 * 1000
  )
}
