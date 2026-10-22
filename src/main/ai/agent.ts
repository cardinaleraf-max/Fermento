/**
 * Collegamento tra le schermate e Bira (canali ai:*).
 * La logica sta in bira.ts (domande), modelli.ts (catena dei modelli) e
 * privacy.ts (i dati dei clienti non escono).
 */
import { ipcMain, type WebContents } from 'electron'
import type BetterSqlite3 from 'better-sqlite3'
import { generaAvvisiIntelligenti } from './avvisi_intelligenti'
import { eseguiTurno, leggiChiave, type ChatTurnoMessaggio, type EventoAgente } from './bira'
import { creaClientGroq } from './groq'
import { GestoreModelli, verificaBira, type StatoBira } from './modelli'

export { ensureAiConfigRows } from './bira'
export type { ChatTurnoMessaggio, EventoAgente } from './bira'

type Db = BetterSqlite3.Database

export type ChatRichiesta = { conversazioneId: string; cronologia: ChatTurnoMessaggio[] }

export type SaluteBira = {
  stato: StatoBira['stato'] | 'da_configurare' | 'demo'
  modello: string | null
  messaggio: string
}

const NON_IN_DEMO = 'Nella versione demo Bira non è disponibile.'
const DA_CONFIGURARE = 'Bira non è ancora attivo: inserisci la chiave in Impostazioni → Bira.'
/** Uno stato «pronto» resta valido 10 minuti: niente domande di prova a ogni apertura. */
const VALIDITA_STATO_MS = 10 * 60 * 1000

/** Un gestore per chiave: conserva tra le domande i modelli esclusi o a riposo. */
let corrente: { chiave: string; gestore: GestoreModelli } | null = null
function gestorePer(chiave: string): GestoreModelli {
  if (!corrente || corrente.chiave !== chiave) {
    corrente = { chiave, gestore: new GestoreModelli(creaClientGroq(chiave)) }
  }
  return corrente.gestore
}

let ultimoStato: { chiave: string; quando: number; salute: SaluteBira } | null = null

async function salute(db: Db, forza: boolean): Promise<SaluteBira> {
  if (__DEMO_MODE__) return { stato: 'demo', modello: null, messaggio: NON_IN_DEMO }
  const chiave = leggiChiave(db)
  if (!chiave) return { stato: 'da_configurare', modello: null, messaggio: DA_CONFIGURARE }
  if (
    !forza &&
    ultimoStato?.chiave === chiave &&
    Date.now() - ultimoStato.quando < VALIDITA_STATO_MS
  ) {
    return ultimoStato.salute
  }
  const s = await verificaBira(gestorePer(chiave))
  // Si ricordano solo gli esiti stabili: un problema di rete va ricontrollato.
  if (s.stato === 'pronto' || s.stato === 'chiave_non_valida') {
    ultimoStato = { chiave, quando: Date.now(), salute: s }
  } else {
    ultimoStato = null
  }
  return s
}

/** Data locale AAAA-MM-GG (toISOString darebbe il giorno prima tra mezzanotte e le 2). */
function oggiLocale(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function cronologiaValida(v: unknown): ChatTurnoMessaggio[] {
  if (!Array.isArray(v)) return []
  return v
    .filter(
      (m): m is ChatTurnoMessaggio =>
        !!m &&
        (m.ruolo === 'user' || m.ruolo === 'assistant') &&
        typeof m.contenuto === 'string' &&
        m.contenuto.trim() !== ''
    )
    .slice(-40)
}

const inCorso = new Map<string, AbortController>()

async function conversazione(db: Db, wc: WebContents, richiesta: ChatRichiesta): Promise<void> {
  const id = richiesta.conversazioneId
  const emit = (evento: EventoAgente): void => {
    if (!wc.isDestroyed()) wc.send('ai:evento', { conversazioneId: id, evento })
  }
  const chiave = __DEMO_MODE__ ? '' : leggiChiave(db)
  if (!chiave) {
    emit({ tipo: 'errore', messaggio: __DEMO_MODE__ ? NON_IN_DEMO : DA_CONFIGURARE })
    emit({ tipo: 'fine' })
    return
  }
  const controller = new AbortController()
  inCorso.set(id, controller)
  try {
    await eseguiTurno({
      db,
      gestore: gestorePer(chiave),
      cronologia: cronologiaValida(richiesta.cronologia),
      emit,
      oggi: oggiLocale(),
      signal: controller.signal,
      richiediNavigazione: (sezione, motivo) => {
        if (!wc.isDestroyed()) {
          wc.send('ai:naviga', { conversazioneId: id, sezione, motivo: motivo ?? null })
        }
      }
    })
  } finally {
    inCorso.delete(id)
  }
}

export function registerAiIpcHandlers(getDb: () => Db): void {
  ipcMain.removeHandler('ai:health')
  ipcMain.handle('ai:health', (_e, opzioni?: { forza?: boolean }) =>
    salute(getDb(), !!opzioni?.forza)
  )

  ipcMain.removeHandler('ai:avvisi-intelligenti')
  ipcMain.handle('ai:avvisi-intelligenti', async () => {
    if (__DEMO_MODE__) return { ok: false as const, errore: NON_IN_DEMO }
    const chiave = leggiChiave(getDb())
    if (!chiave) return { ok: false as const, errore: DA_CONFIGURARE }
    return generaAvvisiIntelligenti(getDb(), gestorePer(chiave))
  })

  ipcMain.removeAllListeners('ai:chat')
  ipcMain.on('ai:chat', (event, richiesta: ChatRichiesta) => {
    if (!richiesta?.conversazioneId) return
    void conversazione(getDb(), event.sender, richiesta)
  })

  ipcMain.removeAllListeners('ai:annulla')
  ipcMain.on('ai:annulla', (_event, conversazioneId: string) => {
    inCorso.get(conversazioneId)?.abort(new Error('annullata'))
  })

  console.log('[startup] IPC handlers registrati: ai:*')
}
