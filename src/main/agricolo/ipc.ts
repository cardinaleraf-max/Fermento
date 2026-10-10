import { ipcMain } from 'electron'
import { db } from '../database'
import type {
  CalibraturaPayload,
  CampoPayload,
  FaseLavorazione,
  GruppoPayload,
  MaltazioneAvviaPayload,
  MaltazioneChiudiPayload,
  OperazionePayload,
  ParametroPayload,
  RaccoltaPayload,
  SeminaPayload,
  StatoLavorazione
} from '../../shared/agricolo'
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
import { eliminaOperazione, listaOperazioni, salvaOperazione } from './servizi/operazioni'
import {
  lottiImballiCotta,
  materialiImballoConfezionamento,
  salvaLottiImballi
} from './servizi/imballi'
import {
  avviaMaltazione,
  chiudiMaltazione,
  dettaglioLavorazione,
  eliminaLavorazione,
  listaLavorazioni,
  maltazioniInCorso,
  riapriMaltazione,
  salvaCalibratura,
  salvaRaccolta,
  scadenzaMaltoProposta,
  verificaCarenza
} from './servizi/lavorazioni'
import {
  configParametri,
  eliminaGruppo,
  eliminaParametro,
  salvaGruppo,
  salvaParametro,
  salvaValori,
  sposta
} from './servizi/parametri'
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
function gestisci<A extends unknown[], R>(
  canale: string,
  fn: (...args: A) => R,
  opzioni: { lettura?: boolean } = {}
): void {
  ipcMain.removeHandler(canale)
  ipcMain.handle(canale, (_event, ...args: unknown[]) => {
    try {
      return fn(...(args as A))
    } catch (error) {
      // Nei canali di sola lettura anche l'errore "utente" diventa un errore vero:
      // chi legge si aspetta il dato, non un esito { ok: false }.
      if (error instanceof ErroreUtente && !opzioni.lettura)
        return { ok: false as const, errore: error.message }
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

  // Operazioni di campo
  gestisci(
    'agri:operazioni-lista',
    (f: {
      stagione?: string | null
      campo_id?: number | null
      semina_id?: number | null
      tipo?: string | null
    }) => listaOperazioni(db, f ?? {})
  )
  gestisci('agri:operazione-salva', (id: number | null, p: OperazionePayload) => ({
    ok: true as const,
    id: salvaOperazione(db, id ?? null, p)
  }))
  gestisci('agri:operazione-elimina', (id: number) => {
    eliminaOperazione(db, id)
    return ok
  })

  // Parametri di fase configurabili
  gestisci('agri:parametri-config', (fase: FaseLavorazione) => configParametri(db, fase))
  gestisci('agri:gruppo-salva', (id: number | null, p: GruppoPayload) => ({
    ok: true as const,
    id: salvaGruppo(db, id ?? null, p)
  }))
  gestisci('agri:gruppo-elimina', (id: number) => ({
    ok: true as const,
    esito: eliminaGruppo(db, id)
  }))
  gestisci('agri:parametro-salva', (id: number | null, p: ParametroPayload) => ({
    ok: true as const,
    id: salvaParametro(db, id ?? null, p)
  }))
  gestisci('agri:parametro-elimina', (id: number) => ({
    ok: true as const,
    esito: eliminaParametro(db, id)
  }))
  gestisci(
    'agri:parametri-sposta',
    (cosa: 'gruppo' | 'parametro', id: number, direzione: 'su' | 'giu') => {
      sposta(db, cosa, id, direzione)
      return ok
    }
  )
  gestisci(
    'agri:salva-parametri',
    (lavorazioneId: number, valori: Record<number, string>, date: Record<number, string>) => {
      salvaValori(db, lavorazioneId, valori ?? {}, date ?? {})
      return ok
    }
  )

  // Lavorazioni (raccolta, analisi e calibratura, maltazione)
  gestisci(
    'agri:lavorazioni-lista',
    (f: { tipo: FaseLavorazione; stagione?: string | null; stato?: StatoLavorazione | null }) =>
      listaLavorazioni(db, f)
  )
  gestisci('agri:lavorazione-dettaglio', (id: number) => dettaglioLavorazione(db, id), {
    lettura: true
  })
  gestisci('agri:lavorazione-elimina', (id: number) => {
    eliminaLavorazione(db, id)
    return ok
  })
  gestisci('agri:verifica-carenza', (seminaId: number, data: string) =>
    verificaCarenza(db, seminaId, data)
  )
  gestisci('agri:raccolta-salva', (id: number | null, p: RaccoltaPayload) => ({
    ok: true as const,
    id: salvaRaccolta(db, id ?? null, p)
  }))
  gestisci('agri:calibratura-salva', (id: number | null, p: CalibraturaPayload) => ({
    ok: true as const,
    id: salvaCalibratura(db, id ?? null, p)
  }))

  gestisci('agri:maltazione-avvia', (id: number | null, p: MaltazioneAvviaPayload) => ({
    ok: true as const,
    id: avviaMaltazione(db, id ?? null, p)
  }))
  gestisci('agri:maltazione-chiudi', (id: number, p: MaltazioneChiudiPayload) => ({
    ok: true as const,
    id: chiudiMaltazione(db, id, p)
  }))
  gestisci('agri:maltazione-riapri', (id: number) => {
    riapriMaltazione(db, id)
    return ok
  })
  gestisci('agri:maltazioni-in-corso', () => maltazioniInCorso(db))
  gestisci('agri:scadenza-malto', (dataUscita: string) => scadenzaMaltoProposta(db, dataUscita))

  console.log('[startup] IPC handlers registrati: agri:*')
}

/**
 * Lotti dei materiali di confezionamento (HACCP): valgono per tutti i
 * birrifici, non solo per il modulo agricolo. Facoltativi.
 */
export function registerImballiIpcHandlers(): void {
  gestisci(
    'prod:imballi-confezionamento',
    (cottaId: number, opzioni: { bottiglie: boolean; fusti: number[] }) =>
      materialiImballoConfezionamento(db, cottaId, opzioni ?? { bottiglie: true, fusti: [] }),
    { lettura: true }
  )
  gestisci('prod:lotti-imballi', (cottaId: number) => lottiImballiCotta(db, cottaId), {
    lettura: true
  })
  gestisci('prod:salva-lotti-imballi', (cottaId: number, movimentoIds: number[]) => {
    salvaLottiImballi(db, cottaId, movimentoIds ?? [])
    return ok
  })
  console.log('[startup] IPC handlers registrati: prod:*-imballi')
}
