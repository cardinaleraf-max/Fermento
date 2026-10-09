import { ipcMain } from 'electron'
import { db } from '../database'
import type { CampoPayload, SeminaPayload } from '../../shared/agricolo'
import { ErroreUtente } from './errori'
import {
  archiviaCampo,
  eliminaCampo,
  eliminaSemina,
  listaCampi,
  listaSemine,
  salvaCampo,
  salvaSemina
} from './servizi/campi'
import { lottiDisponibili } from './servizi/magazzino'
import {
  frazioniDefault,
  salvaImpostazioniAgricole,
  shelfLifeMaltoMesi,
  statoModulo,
  type ImpostazioniAgricolePayload
} from './servizi/config'

/**
 * Registra un canale con il pattern standard di Fermento (removeHandler +
 * handle + try/catch con console.error). Gli errori dovuti a dati inseriti
 * dall'utente tornano alla finestra come { ok: false, errore } con un
 * messaggio leggibile; gli errori imprevisti vengono loggati e rilanciati.
 */
function gestisci<A extends unknown[], R>(canale: string, fn: (...args: A) => R): void {
  ipcMain.removeHandler(canale)
  ipcMain.handle(canale, (_event, ...args: unknown[]) => {
    try {
      return fn(...(args as A))
    } catch (error) {
      if (error instanceof ErroreUtente) return { ok: false as const, errore: error.message }
      console.error(`[IPC ${canale}] errore:`, error)
      throw error
    }
  })
}

const ok = { ok: true as const }

export function registerAgricoloIpcHandlers(): void {
  // Stato e impostazioni del modulo
  gestisci('agri:stato', () => statoModulo(db))
  gestisci('agri:impostazioni', () => ({
    frazioni_default: frazioniDefault(db),
    shelf_life_malto_mesi: shelfLifeMaltoMesi(db)
  }))
  gestisci('agri:salva-impostazioni', (p: ImpostazioniAgricolePayload) => {
    salvaImpostazioniAgricole(db, p)
    return ok
  })

  // Lotti di magazzino selezionabili (per categoria)
  gestisci(
    'agri:lotti-disponibili',
    (categorie: string[], opzioni?: { stagione?: string | null; includi?: number[] }) =>
      lottiDisponibili(db, Array.isArray(categorie) ? categorie : [], opzioni ?? {})
  )

  // Campi
  gestisci('agri:campi-lista', (stagione: string | null) => listaCampi(db, stagione ?? null))
  gestisci('agri:campo-salva', (id: number | null, p: CampoPayload) => ({
    ok: true as const,
    id: salvaCampo(db, id ?? null, p)
  }))
  gestisci('agri:campo-archivia', (id: number, attivo: boolean) => {
    archiviaCampo(db, id, attivo)
    return ok
  })
  gestisci('agri:campo-elimina', (id: number) => {
    eliminaCampo(db, id)
    return ok
  })

  // Semine
  gestisci('agri:semine-lista', (filtro: { campo_id?: number | null; stagione?: string | null }) =>
    listaSemine(db, filtro ?? {})
  )
  gestisci('agri:semina-salva', (id: number | null, p: SeminaPayload) => ({
    ok: true as const,
    id: salvaSemina(db, id ?? null, p)
  }))
  gestisci('agri:semina-elimina', (id: number) => {
    eliminaSemina(db, id)
    return ok
  })

  console.log('[startup] IPC handlers registrati: agri:*')
}
