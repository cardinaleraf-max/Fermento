/**
 * Bira: una domanda → strumenti sul database → risposta.
 *
 * Ogni turno:
 *  1. registro dei soggetti dal DB (clienti, fornitori, titolare, operatori);
 *  2. cronologia della chat ripulita: i nomi veri diventano codici;
 *  3. a ogni giro la GUARDIA controlla il pacchetto prima che esca;
 *  4. gli argomenti degli strumenti tornano coi nomi veri (solo sul PC),
 *     i risultati escono compattati e con i codici;
 *  5. la risposta torna coi nomi veri prima di arrivare allo schermo.
 *
 * Nessuna dipendenza da Electron: si testa con un modello finto.
 */
import type BetterSqlite3 from 'better-sqlite3'
import { moduloAttivo, stagioneCorrente } from '../agricolo/servizi/config'
import { compatta, tronca } from './compatta'
import { etichettaStrumento } from './etichette'
import { ErroreProvider } from './groq'
import type { GestoreModelli } from './modelli'
import {
  creaRegistroSoggetti,
  ErrorePrivacy,
  guardia,
  pseudonimizza,
  pseudonimizzaValori,
  ripristina,
  ripristinaValori
} from './privacy'
import { promptDiSistema } from './prompt'
import type { ChatMessage, ChatResponse, ChatToolCall } from './tipi'
import { executeTool, getToolDefinitions } from './tools'

type Db = BetterSqlite3.Database

const MAX_GIRI = 8
const MAX_RISULTATO = 6000
const TEMPERATURA = 0.2
/** Cronologia inviata: ultimi messaggi, quelli lunghi accorciati (meno token). */
const MAX_MESSAGGI_CRONOLOGIA = 10
const MAX_CARATTERI_MESSAGGIO_VECCHIO = 1500

export const CHIAVE_API = 'ai_groq_api_key'

export type ChatTurnoMessaggio = { ruolo: 'user' | 'assistant'; contenuto: string }

export type EventoAgente =
  | { tipo: 'inizio' }
  | { tipo: 'tool_call'; nome: string; etichetta: string; argomenti: Record<string, unknown> }
  | { tipo: 'tool_risultato'; nome: string; ok: boolean; anteprima: string }
  | { tipo: 'attesa'; secondi: number }
  | { tipo: 'risposta'; testo: string }
  | { tipo: 'errore'; messaggio: string }
  | { tipo: 'fine' }

export type DipendenzeTurno = {
  db: Db
  gestore: GestoreModelli
  cronologia: ChatTurnoMessaggio[]
  emit: (e: EventoAgente) => void
  /** Data di oggi AAAA-MM-GG (locale). */
  oggi: string
  signal?: AbortSignal
  richiediNavigazione?: (sezione: string, motivo?: string) => void
}

export function leggiChiave(db: Db): string {
  try {
    const r = db.prepare(`SELECT valore FROM configurazioni WHERE chiave = ?`).get(CHIAVE_API) as
      | { valore: string }
      | undefined
    return (r?.valore ?? '').trim()
  } catch {
    return ''
  }
}

function moduloAgricoloAcceso(db: Db): boolean {
  try {
    return moduloAttivo(db)
  } catch {
    return false
  }
}

/** I modelli scrivono a volte trattini tipografici non separabili (‑): si usano quelli normali. */
function normalizzaTrattini(testo: string): string {
  return testo.replace(/[\u2010\u2011]/g, '-')
}

/** Date AAAA-MM-GG sfuggite al modello → gg/mm/aaaa (i codici come 2026-020 non sono date). */
function dateItaliane(testo: string): string {
  return testo.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (m, a: string, mm: string, g: string) =>
    Number(mm) >= 1 && Number(mm) <= 12 && Number(g) >= 1 && Number(g) <= 31 ? `${g}/${mm}/${a}` : m
  )
}

function distanza(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [
    i,
    ...Array(b.length).fill(0)
  ])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
  }
  return d[a.length][b.length]
}

/** Dalla chiamata rifiutata da Groq a una chiamata valida, se il nome è riconoscibile. */
export function correggiChiamata(
  generazione: string | null,
  nomi: string[],
  giro: number
): ChatToolCall | null {
  if (!generazione) return null
  let g: { name?: unknown; arguments?: unknown }
  try {
    g = JSON.parse(generazione) as { name?: unknown; arguments?: unknown }
  } catch {
    return null
  }
  if (typeof g.name !== 'string') return null
  const richiesto = g.name.trim().toLowerCase()
  const migliore = nomi.map((n) => ({ n, d: distanza(richiesto, n) })).sort((a, b) => a.d - b.d)[0]
  if (!migliore || migliore.d > 2) return null
  let argomenti: Record<string, unknown> = {}
  if (g.arguments && typeof g.arguments === 'object' && !Array.isArray(g.arguments)) {
    argomenti = g.arguments as Record<string, unknown>
  } else if (typeof g.arguments === 'string') {
    try {
      const a = JSON.parse(g.arguments)
      if (a && typeof a === 'object' && !Array.isArray(a)) argomenti = a
    } catch {
      // argomenti illeggibili: oggetto vuoto
    }
  }
  return { id: `corretta_${giro}`, function: { name: migliore.n, arguments: argomenti } }
}

function stagione(db: Db, modulo: boolean): string | undefined {
  if (!modulo) return undefined
  try {
    return stagioneCorrente(db)
  } catch {
    return undefined
  }
}

function anteprima(testo: string, max = 280): string {
  return testo.length > max ? `${testo.slice(0, max)}…` : testo
}

/** Errore → frase per il birraio. */
export function messaggioErrore(e: unknown): string {
  if (e instanceof ErrorePrivacy) return e.message
  if (e instanceof ErroreProvider) {
    switch (e.tipo) {
      case 'chiave_non_valida':
        return 'La chiave di Bira non è valida: controllala in Impostazioni → Bira.'
      case 'rete':
        return 'Bira non riesce a collegarsi: controlla la connessione a internet.'
      case 'limite':
        return 'Il servizio gratuito di Bira è momentaneamente al limite: riprova tra un minuto.'
      case 'modello_non_disponibile':
        return 'In questo momento Groq non offre un modello adatto a Bira. Riprova più tardi o contatta Fermento.'
      case 'troppo_grande':
        return 'La conversazione è diventata troppo lunga: apri una nuova chat con il pulsante +.'
      default:
        return 'Il servizio di Bira ha dato un errore temporaneo: riprova tra poco.'
    }
  }
  console.error('[bira] errore imprevisto:', e)
  return 'Si è verificato un errore imprevisto: riprova.'
}

function cronologiaDaInviare(cronologia: ChatTurnoMessaggio[]): ChatTurnoMessaggio[] {
  const recenti = cronologia.slice(-MAX_MESSAGGI_CRONOLOGIA)
  return recenti.map((m, i) =>
    i < recenti.length - 1 && m.contenuto.length > MAX_CARATTERI_MESSAGGIO_VECCHIO
      ? { ...m, contenuto: `${m.contenuto.slice(0, MAX_CARATTERI_MESSAGGIO_VECCHIO)}…` }
      : m
  )
}

export async function eseguiTurno(d: DipendenzeTurno): Promise<void> {
  try {
    const modulo = moduloAgricoloAcceso(d.db)
    const reg = creaRegistroSoggetti(d.db)
    const messaggi: ChatMessage[] = [
      {
        role: 'system',
        content: promptDiSistema({
          oggi: d.oggi,
          moduloAgricolo: modulo,
          stagione: stagione(d.db, modulo)
        })
      },
      ...cronologiaDaInviare(d.cronologia).map((m) => ({
        role: m.ruolo === 'user' ? ('user' as const) : ('assistant' as const),
        content: pseudonimizza(reg, m.contenuto)
      }))
    ]
    const tools = getToolDefinitions({ moduloAgricolo: modulo })
    d.emit({ tipo: 'inizio' })

    const nomiStrumenti = tools.map((t) => t.function.name)
    /** Testo che il modello scrive insieme alle chiamate di strumenti: va mostrato. */
    const testiIntermedi: string[] = []
    let modelloDaSaltare: string | undefined
    for (let giro = 0; giro < MAX_GIRI; giro++) {
      const corpo = { messages: messaggi, tools, temperature: TEMPERATURA }
      guardia(reg, JSON.stringify(corpo))
      let risposta: ChatResponse
      try {
        const r = await d.gestore.chat(
          corpo,
          d.signal,
          (secondi) => d.emit({ tipo: 'attesa', secondi }),
          { salta: modelloDaSaltare }
        )
        risposta = r.risposta
        modelloDaSaltare = undefined
      } catch (e) {
        if (!(e instanceof ErroreProvider) || e.tipo !== 'strumento_sbagliato') throw e
        // Il modello ha chiamato uno strumento con un nome storpiato: se è
        // riconoscibile lo si corregge, altrimenti si riprova con un altro modello.
        const corretta = correggiChiamata(e.generazione, nomiStrumenti, giro)
        if (corretta) {
          risposta = {
            model: '',
            message: { role: 'assistant', content: '', tool_calls: [corretta] }
          }
        } else if (!modelloDaSaltare) {
          modelloDaSaltare = d.gestore.ultimoModello() ?? undefined
          giro--
          continue
        } else {
          throw e
        }
      }
      const chiamate = risposta.message.tool_calls ?? []
      if (chiamate.length === 0) {
        const finale = (risposta.message.content || '').trim()
        const parti = [...testiIntermedi.filter((t) => t !== finale), finale].filter(Boolean)
        const testo = dateItaliane(normalizzaTrattini(ripristina(reg, parti.join('\n\n'))))
        d.emit({
          tipo: 'risposta',
          testo: testo || 'Non ho trovato una risposta utile: prova a riformulare la domanda.'
        })
        return
      }
      const intermedio = (risposta.message.content || '').trim()
      if (intermedio) testiIntermedi.push(intermedio)
      messaggi.push({
        role: 'assistant',
        content: risposta.message.content || '',
        tool_calls: chiamate
      })
      for (const c of chiamate) {
        const nome = c.function?.name ?? ''
        const argomenti = ripristinaValori(reg, c.function?.arguments ?? {})
        d.emit({ tipo: 'tool_call', nome, etichetta: etichettaStrumento(nome), argomenti })
        const esito = executeTool(
          d.db,
          nome,
          argomenti,
          { moduloAgricolo: modulo },
          { richiediNavigazione: d.richiediNavigazione }
        )
        const contenuto = esito.ok
          ? tronca(JSON.stringify(pseudonimizzaValori(reg, compatta(esito.result))), MAX_RISULTATO)
          : JSON.stringify({ errore: pseudonimizza(reg, esito.errore) })
        d.emit({
          tipo: 'tool_risultato',
          nome,
          ok: esito.ok,
          anteprima: anteprima(esito.ok ? ripristina(reg, contenuto) : esito.errore)
        })
        messaggi.push({ role: 'tool', tool_name: nome, tool_call_id: c.id, content: contenuto })
      }
    }
    d.emit({
      tipo: 'errore',
      messaggio: 'La domanda richiedeva troppi passaggi: prova a dividerla in domande più semplici.'
    })
  } catch (e) {
    d.emit({
      tipo: 'errore',
      messaggio: d.signal?.aborted ? 'Richiesta annullata.' : messaggioErrore(e)
    })
  } finally {
    d.emit({ tipo: 'fine' })
  }
}

const IMPOSTAZIONI_OBSOLETE = [
  'ai_abilitato',
  'ai_provider',
  'ai_url',
  'ai_modello',
  'ai_groq_modello',
  'ai_groq_url',
  'ai_temperatura',
  'ai_max_iterazioni',
  'ai_timeout_secondi'
]

/**
 * Impostazioni di Bira: una sola riga, la chiave. Le vecchie impostazioni
 * (Ollama, modello fisso, URL, temperatura…) vengono tolte: il modello fisso
 * salvato era la causa del guasto di agosto 2026.
 */
export function ensureAiConfigRows(db: Db): void {
  const leggi = (chiave: string): string => {
    const r = db.prepare(`SELECT valore FROM configurazioni WHERE chiave = ?`).get(chiave) as
      | { valore: string }
      | undefined
    return (r?.valore ?? '').trim()
  }
  db.transaction(() => {
    db.prepare(
      `INSERT OR IGNORE INTO configurazioni (chiave, valore, tipo, etichetta, categoria)
       VALUES (?, '', 'password', 'Chiave di Bira', 'assistente_ai')`
    ).run(CHIAVE_API)
    // Rete di sicurezza: chiave incollata per errore nel vecchio campo URL.
    const url = leggi('ai_groq_url')
    if (!leggi(CHIAVE_API) && url.startsWith('gsk_')) {
      db.prepare(
        `UPDATE configurazioni SET valore = ?, aggiornato_il = CURRENT_TIMESTAMP WHERE chiave = ?`
      ).run(url, CHIAVE_API)
    }
    db.prepare(
      `UPDATE configurazioni SET etichetta = 'Chiave di Bira', tipo = 'password'
       WHERE chiave = ? AND (etichetta <> 'Chiave di Bira' OR tipo <> 'password')`
    ).run(CHIAVE_API)
    db.prepare(
      `DELETE FROM configurazioni WHERE chiave IN (${IMPOSTAZIONI_OBSOLETE.map(() => '?').join(',')})`
    ).run(...IMPOSTAZIONI_OBSOLETE)
  })()
}
