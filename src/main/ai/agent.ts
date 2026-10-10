/**
 * Orchestratore dell'agente AI: gestisce il loop di tool-calling con
 * Ollama, esegue i tool sul database SQLite locale e produce eventi di
 * stato che il renderer mostra in chat.
 *
 * Tutti i tool sono in sola lettura: l'agente non puo' modificare il DB.
 */
import { ipcMain, type WebContents } from 'electron'
import type BetterSqlite3 from 'better-sqlite3'
import type { OllamaMessage } from './ollama'
import {
  creaClient,
  urlDefaultPerProvider,
  type ChatClient,
  type ProviderTipo
} from './provider'
import {
  executeTool,
  getToolDefinitions,
  getToolNames,
  getToolNamesBloccatiCloud
} from './tools'
import { generaAvvisiIntelligenti } from './avvisi_intelligenti'

const MAX_TOOL_ITERATIONS = 8
/** Limite di sicurezza sulla dimensione del JSON di ritorno di un tool. */
const MAX_TOOL_RESULT_CHARS = 12_000

// qwen2.5:3b: ~2GB su disco, ~2.5GB RAM, supporta tool calling, buon italiano.
// Scelto come default per funzionare anche su macchine modeste (8GB RAM).
// Su macchine con piu' risorse conviene passare a llama3.1:8b o qwen2.5:7b.
const DEFAULT_MODEL_OLLAMA = 'qwen2.5:3b'
// Groq ha modelli grossi gratis e velocissimi. llama-3.3-70b e' il top
// disponibile sul tier free, con tool calling affidabile e buon italiano.
const DEFAULT_MODEL_GROQ = 'llama-3.3-70b-versatile'
const DEFAULT_TEMPERATURE = 0.2
// Timeout per singola chiamata HTTP. Su CPU locale il primo turno
// (caricamento modello + prompt eval) puo' richiedere alcuni minuti;
// su cloud basterebbero 60 secondi ma teniamo largo per sicurezza.
const DEFAULT_TIMEOUT_SECONDI = 600

const SYSTEM_PROMPT_BASE = `Sei "Bira", l'assistente AI integrato nel gestionale Fermento per birrifici.
Rispondi sempre in italiano, in modo conciso e operativo.

Hai a disposizione strumenti (tool) che leggono in sola lettura il database del birrificio:
materie prime, lotti e scadenze, magazzino confezionamento, cotte, prodotto finito,
clienti, vendite (incluse le vendite in omaggio), avvisi e configurazioni.
Conosci anche le funzioni piu' recenti del gestionale:
- FUSTI A RENDERE ("fusti in giro"): fusti consegnati ai clienti che devono essere
  restituiti. Usa il tool 'fusti_a_rendere' per sapere quali clienti hanno fusti da
  restituire e quanti, per formato.
- ALTRI PRODOTTI: prodotti diversi dalla birra (es. gadget, merchandising) con una
  loro giacenza. Usa il tool 'altri_prodotti'.
- OMAGGI: vendite marcate come omaggio/assaggio. Usa il tool 'omaggi'.
- SCADENZA PERSONALIZZATA: al confezionamento di una cotta la data di scadenza e'
  precompilata dalla shelf life ma puo' essere modificata a mano.

Hai anche due tool speciali per l'help in-app:
- 'cerca_documentazione': cerca nella guida delle schermate di Fermento (usalo per rispondere a
  "come si fa X", "dove trovo Y", "dove imposto Z"). Non richiede dati dal DB.
- 'naviga_a_schermata': propone all'utente di aprire direttamente una schermata specifica.
  Usalo DOPO aver spiegato cosa fare, quando e' utile portare l'utente al punto giusto.
  L'utente potra' accettare o rifiutare la proposta.

REGOLE:
- Quando una domanda richiede dati reali, USA SEMPRE i tool di lettura dati. Non inventare numeri.
- Per domande di HELP/NAVIGAZIONE ("come si fa", "dove sta", "come apro"): usa PRIMA
  'cerca_documentazione' e poi, se ha senso, 'naviga_a_schermata'. Non inventare nomi di schermate.
- Chiama un tool alla volta, e basa le tue risposte SOLO sui dati/documenti restituiti.
- Quando hai abbastanza informazioni, smetti di chiamare tool e dai una risposta finale.
- Se i dati sono vuoti o assenti, dillo esplicitamente.
- Le quantita' di prodotto finito sono espresse in BOTTIGLIE singole (non cartoni) e in FUSTI per formato.
- Le date sono in formato YYYY-MM-DD.
- Gli importi monetari NON sono tracciati: non parlare di euro o ricavi.
- Non eseguire mai operazioni di scrittura sul DB: i tool di dati sono solo di lettura.
- Quando proponi azioni (es. ordini, riordini, promozioni), chiariscile come SUGGERIMENTI per l'utente.`

const NOTA_CLOUD = `
NOTA PRIVACY:
Per proteggere i dati piu' sensibili, alcuni dettagli NON sono disponibili tramite i tool:
i contatti dei clienti (email, telefono, partita IVA), i nomi delle materie prime e le ricette.
Puoi usare i NOMI dei clienti (es. per i fusti a rendere o i top clienti), ma se ti servono i loro
contatti o dettagli sulle materie prime/ricette, spiega che quei dati non sono accessibili
dall'assistente e vanno consultati nella schermata dedicata del gestionale.`

type ConfigGetter = (chiave: string) => string

/** Configurazione runtime dell'agente, letta dalla tabella `configurazioni`. */
type AgentConfig = {
  abilitato: boolean
  provider: ProviderTipo
  baseUrl: string
  apiKey: string
  modello: string
  temperatura: number
  maxIterazioni: number
  timeoutMs: number
  /** true = cloud: applichiamo filtri di sicurezza sui tool. */
  remoto: boolean
}

function leggiConfig(get: ConfigGetter): AgentConfig {
  // Provider unico: Groq (cloud). La scelta Ollama e' stata rimossa dalla UI
  // per rendere la configurazione a prova di errore: l'utente inserisce solo
  // la API key. L'endpoint e' fisso (non piu' modificabile) cosi' e'
  // impossibile incollare la key nel campo sbagliato.
  const provider: ProviderTipo = 'groq'
  const remoto = true

  const baseUrl = urlDefaultPerProvider('groq')
  const modello = (get('ai_groq_modello') || '').trim() || DEFAULT_MODEL_GROQ
  const apiKey = (get('ai_groq_api_key') || '').trim()

  // Abilitato = c'e' una API key. Nient'altro da configurare.
  const abilitato = apiKey.length > 0

  const tempRaw = (get('ai_temperatura') || '').trim()
  const tempNum = tempRaw === '' ? DEFAULT_TEMPERATURE : Number(tempRaw)
  const temperatura =
    Number.isFinite(tempNum) && tempNum >= 0 && tempNum <= 2 ? tempNum : DEFAULT_TEMPERATURE
  const iterRaw = (get('ai_max_iterazioni') || '').trim()
  const iterNum = iterRaw === '' ? MAX_TOOL_ITERATIONS : parseInt(iterRaw, 10)
  const maxIterazioni =
    Number.isFinite(iterNum) && iterNum >= 1 && iterNum <= 20 ? iterNum : MAX_TOOL_ITERATIONS
  const toRaw = (get('ai_timeout_secondi') || '').trim()
  const toNum = toRaw === '' ? DEFAULT_TIMEOUT_SECONDI : parseInt(toRaw, 10)
  const timeoutSec =
    Number.isFinite(toNum) && toNum >= 30 && toNum <= 3600 ? toNum : DEFAULT_TIMEOUT_SECONDI
  return {
    abilitato,
    provider,
    baseUrl,
    apiKey,
    modello,
    temperatura,
    maxIterazioni,
    timeoutMs: timeoutSec * 1000,
    remoto
  }
}

function costruisciClient(cfg: AgentConfig): ChatClient {
  return creaClient({
    tipo: cfg.provider,
    baseUrl: cfg.baseUrl,
    apiKey: cfg.apiKey,
    timeoutMs: cfg.timeoutMs
  })
}

export type ChatTurnoMessaggio =
  | { ruolo: 'user'; contenuto: string }
  | { ruolo: 'assistant'; contenuto: string }

export type ChatRichiesta = {
  conversazioneId: string
  cronologia: ChatTurnoMessaggio[]
}

export type EventoAgente =
  | { tipo: 'inizio'; modello: string }
  | { tipo: 'tool_call'; nome: string; argomenti: Record<string, unknown> }
  | { tipo: 'tool_risultato'; nome: string; ok: boolean; anteprima: string }
  | { tipo: 'risposta'; testo: string }
  | { tipo: 'errore'; messaggio: string }
  | { tipo: 'fine' }

function troncaJson(value: unknown, maxChars: number): string {
  let s: string
  try {
    s = JSON.stringify(value)
  } catch {
    s = String(value)
  }
  if (s.length <= maxChars) return s
  return s.slice(0, maxChars) + `\n... [output troncato, ${s.length - maxChars} caratteri omessi]`
}

function anteprimaTesto(value: unknown, maxChars = 280): string {
  const s = troncaJson(value, maxChars)
  return s.length > maxChars ? s.slice(0, maxChars) + '…' : s
}

/**
 * Mappa la cronologia "esterna" (solo user/assistant in italiano) in
 * messaggi Ollama, anteponendo il system prompt. In modalita' cloud
 * aggiunge una nota che spiega al modello che alcuni tool sono
 * disabilitati.
 */
function buildInitialMessages(
  cronologia: ChatTurnoMessaggio[],
  remoto: boolean
): OllamaMessage[] {
  const system = remoto ? `${SYSTEM_PROMPT_BASE}\n${NOTA_CLOUD}` : SYSTEM_PROMPT_BASE
  const out: OllamaMessage[] = [{ role: 'system', content: system }]
  for (const m of cronologia) {
    out.push({
      role: m.ruolo === 'user' ? 'user' : 'assistant',
      content: m.contenuto
    })
  }
  return out
}

/** Mappa per gestire la cancellazione delle conversazioni in corso. */
const inFlight = new Map<string, AbortController>()

/**
 * Esegue una conversazione: invia eventi al WebContents richiedente
 * fino al completamento. Risolve quando la risposta finale e' pronta.
 */
async function eseguiConversazione(
  db: BetterSqlite3.Database,
  webContents: WebContents,
  richiesta: ChatRichiesta
): Promise<void> {
  const config = leggiConfig((chiave) => leggiConfigurazione(db, chiave))

  const emit = (evento: EventoAgente): void => {
    if (webContents.isDestroyed()) return
    webContents.send('ai:evento', { conversazioneId: richiesta.conversazioneId, evento })
  }

  if (!config.abilitato) {
    emit({
      tipo: 'errore',
      messaggio: 'Assistente AI disabilitato. Attivalo dalle Impostazioni.'
    })
    emit({ tipo: 'fine' })
    return
  }

  const client = costruisciClient(config)
  const ping = await client.ping()
  if (!ping.ok) {
    const hint =
      config.provider === 'groq'
        ? 'Verifica API key e URL Groq nelle Impostazioni → Assistente AI.'
        : `Avvia Ollama (https://ollama.com) e verifica l'URL nelle Impostazioni (${config.baseUrl}).`
    emit({
      tipo: 'errore',
      messaggio: `${ping.errore ?? 'Provider AI non raggiungibile'}. ${hint}`
    })
    emit({ tipo: 'fine' })
    return
  }

  const controller = new AbortController()
  inFlight.set(richiesta.conversazioneId, controller)

  try {
    emit({ tipo: 'inizio', modello: config.modello })

    const messages = buildInitialMessages(richiesta.cronologia, config.remoto)
    const tools = getToolDefinitions({ soloCloudSafe: config.remoto })

    let testoFinale = ''
    let iterazioni = 0

    while (iterazioni < config.maxIterazioni) {
      iterazioni++
      const risposta = await client.chat(
        {
          model: config.modello,
          messages,
          tools,
          options: { temperature: config.temperatura }
        },
        controller.signal
      )

      const msg = risposta.message
      const toolCalls = msg.tool_calls ?? []

      if (toolCalls.length === 0) {
        testoFinale = (msg.content || '').trim()
        if (!testoFinale) {
          testoFinale =
            'Non ho prodotto una risposta utile. Riprova riformulando la domanda.'
        }
        emit({ tipo: 'risposta', testo: testoFinale })
        break
      }

      messages.push({
        role: 'assistant',
        content: msg.content || '',
        tool_calls: toolCalls
      })

      for (const call of toolCalls) {
        const nome = call.function?.name
        const argomenti =
          call.function?.arguments && typeof call.function.arguments === 'object'
            ? (call.function.arguments as Record<string, unknown>)
            : {}
        if (!nome) continue
        emit({ tipo: 'tool_call', nome, argomenti })
        const esito = executeTool(
          db,
          nome,
          argomenti,
          { soloCloudSafe: config.remoto },
          {
            richiediNavigazione: (sezione, motivo) => {
              if (webContents.isDestroyed()) return
              webContents.send('ai:naviga', {
                conversazioneId: richiesta.conversazioneId,
                sezione,
                motivo: motivo ?? null
              })
            }
          }
        )
        if (esito.ok) {
          const payload = troncaJson(esito.result, MAX_TOOL_RESULT_CHARS)
          emit({ tipo: 'tool_risultato', nome, ok: true, anteprima: anteprimaTesto(esito.result) })
          messages.push({
            role: 'tool',
            tool_name: nome,
            tool_call_id: call.id,
            content: payload
          })
        } else {
          emit({ tipo: 'tool_risultato', nome, ok: false, anteprima: esito.errore })
          messages.push({
            role: 'tool',
            tool_name: nome,
            tool_call_id: call.id,
            content: JSON.stringify({ errore: esito.errore })
          })
        }
      }
    }

    if (!testoFinale) {
      emit({
        tipo: 'errore',
        messaggio: `Numero massimo di iterazioni raggiunto (${config.maxIterazioni}). Riformula la domanda in modo piu' specifico.`
      })
    }
  } catch (e) {
    if (controller.signal.aborted) {
      emit({ tipo: 'errore', messaggio: 'Richiesta annullata.' })
    } else {
      const msg = e instanceof Error ? e.message : String(e)
      emit({ tipo: 'errore', messaggio: msg })
    }
  } finally {
    inFlight.delete(richiesta.conversazioneId)
    emit({ tipo: 'fine' })
  }
}

function leggiConfigurazione(db: BetterSqlite3.Database, chiave: string): string {
  try {
    const row = db
      .prepare(`SELECT valore FROM configurazioni WHERE chiave = ?`)
      .get(chiave) as { valore: string } | undefined
    return row?.valore ?? ''
  } catch {
    return ''
  }
}

/** Crea (idempotente) le righe di configurazione dell'agente AI. */
export function ensureAiConfigRows(db: BetterSqlite3.Database): void {
  const ins = db.prepare(
    `INSERT OR IGNORE INTO configurazioni (chiave, valore, tipo, etichetta, categoria) VALUES (?, ?, ?, ?, ?)`
  )
  // LEGACY: non più letto a runtime, derivato dallo stato provider
  ins.run('ai_abilitato', '1', 'bool', 'Assistente AI abilitato (0/1)', 'assistente_ai')
  ins.run(
    'ai_provider',
    'ollama',
    'string',
    "Provider AI: 'ollama' (locale, privato) oppure 'groq' (cloud, veloce)",
    'assistente_ai'
  )
  // --- Ollama (locale) ---
  ins.run(
    'ai_url',
    urlDefaultPerProvider('ollama'),
    'string',
    'URL del server Ollama (locale o di rete)',
    'assistente_ai'
  )
  ins.run(
    'ai_modello',
    DEFAULT_MODEL_OLLAMA,
    'string',
    'Modello Ollama (es. qwen2.5:3b, llama3.1:8b)',
    'assistente_ai'
  )
  // --- Groq (cloud) ---
  ins.run(
    'ai_groq_api_key',
    '',
    'password',
    'API key Groq (console.groq.com/keys)',
    'assistente_ai'
  )
  ins.run(
    'ai_groq_modello',
    DEFAULT_MODEL_GROQ,
    'string',
    'Modello Groq (es. llama-3.3-70b-versatile, qwen-2.5-32b)',
    'assistente_ai'
  )
  ins.run(
    'ai_groq_url',
    urlDefaultPerProvider('groq'),
    'string',
    'URL API Groq (di solito da non modificare)',
    'assistente_ai'
  )
  // --- Comuni ---
  ins.run(
    'ai_temperatura',
    String(DEFAULT_TEMPERATURE),
    'string',
    'Temperatura (0.0-2.0, default 0.2)',
    'assistente_ai'
  )
  ins.run(
    'ai_max_iterazioni',
    String(MAX_TOOL_ITERATIONS),
    'int',
    'Max iterazioni tool-call per richiesta',
    'assistente_ai'
  )
  ins.run(
    'ai_timeout_secondi',
    String(DEFAULT_TIMEOUT_SECONDI),
    'int',
    'Timeout per chiamata al provider AI (secondi, 30-3600)',
    'assistente_ai'
  )

  // Rete di sicurezza retrocompatibilita': in passato la config esponeva sia il
  // campo URL sia la API key, ed era facile incollare la key (che inizia con
  // 'gsk_') nel campo URL. Se troviamo una key valida in 'ai_groq_url' e la
  // vera API key e' vuota, la spostiamo automaticamente cosi' Bira continua a
  // funzionare dopo l'aggiornamento senza che l'utente debba riconfigurare.
  try {
    const leggi = (chiave: string): string => {
      const row = db.prepare(`SELECT valore FROM configurazioni WHERE chiave = ?`).get(chiave) as
        | { valore: string }
        | undefined
      return (row?.valore ?? '').trim()
    }
    const apiKey = leggi('ai_groq_api_key')
    const url = leggi('ai_groq_url')
    if (!apiKey && url.startsWith('gsk_')) {
      db.prepare(
        `UPDATE configurazioni SET valore = ?, aggiornato_il = CURRENT_TIMESTAMP WHERE chiave = 'ai_groq_api_key'`
      ).run(url)
      db.prepare(
        `UPDATE configurazioni SET valore = ?, aggiornato_il = CURRENT_TIMESTAMP WHERE chiave = 'ai_groq_url'`
      ).run('https://api.groq.com/openai/v1')
    }
  } catch {
    // best-effort: se la migrazione non e' applicabile ignoriamo
  }
}

export function registerAiIpcHandlers(getDb: () => BetterSqlite3.Database): void {
  ipcMain.removeHandler('ai:health')
  ipcMain.handle('ai:health', async () => {
    // Nella demo Bira è spento: la finestra mostra "non disponibile nella demo".
    if (__DEMO_MODE__) {
      return {
        abilitato: false,
        provider: 'groq' as const,
        url: '',
        modello: '',
        remoto: false,
        raggiungibile: false,
        errore: 'demo'
      }
    }
    const cfg = leggiConfig((c) => leggiConfigurazione(getDb(), c))
    if (!cfg.abilitato) {
      return {
        abilitato: false,
        provider: cfg.provider,
        url: cfg.baseUrl,
        modello: cfg.modello,
        remoto: cfg.remoto,
        raggiungibile: false,
        errore: 'Configura API key Groq in Impostazioni → Assistente AI'
      }
    }
    const client = costruisciClient(cfg)
    const ping = await client.ping()
    return {
      abilitato: cfg.abilitato,
      provider: cfg.provider,
      url: cfg.baseUrl,
      modello: cfg.modello,
      remoto: cfg.remoto,
      raggiungibile: ping.ok,
      errore: ping.errore ?? null
    }
  })

  ipcMain.removeHandler('ai:lista-modelli')
  ipcMain.handle('ai:lista-modelli', async () => {
    const cfg = leggiConfig((c) => leggiConfigurazione(getDb(), c))
    const client = costruisciClient(cfg)
    try {
      const modelli = await client.listaModelli()
      return { ok: true as const, modelli }
    } catch (e) {
      return {
        ok: false as const,
        errore: e instanceof Error ? e.message : String(e)
      }
    }
  })

  ipcMain.removeHandler('ai:lista-tool')
  ipcMain.handle('ai:lista-tool', () => {
    const cfg = leggiConfig((c) => leggiConfigurazione(getDb(), c))
    return {
      tutti: getToolNames(),
      disponibili: getToolNames({ soloCloudSafe: cfg.remoto }),
      bloccati_cloud: getToolNamesBloccatiCloud(),
      modalita_cloud: cfg.remoto
    }
  })

  ipcMain.removeHandler('ai:avvisi-intelligenti')
  ipcMain.handle('ai:avvisi-intelligenti', async () => {
    const cfg = leggiConfig((c) => leggiConfigurazione(getDb(), c))
    if (!cfg.abilitato) {
      return { ok: false as const, errore: 'Assistente AI disabilitato (Impostazioni).' }
    }
    const client = costruisciClient(cfg)
    const ping = await client.ping()
    if (!ping.ok) {
      return {
        ok: false as const,
        errore: ping.errore ?? 'Provider AI non raggiungibile'
      }
    }
    return generaAvvisiIntelligenti(getDb(), client, cfg.modello, {
      temperatura: cfg.temperatura,
      timeoutMs: cfg.timeoutMs
    })
  })

  // chat: fire-and-forget (gli eventi arrivano via 'ai:evento')
  ipcMain.removeAllListeners('ai:chat')
  ipcMain.on('ai:chat', (event, richiesta: ChatRichiesta) => {
    if (!richiesta?.conversazioneId) return
    void eseguiConversazione(getDb(), event.sender, richiesta)
  })

  ipcMain.removeAllListeners('ai:annulla')
  ipcMain.on('ai:annulla', (_event, conversazioneId: string) => {
    const c = inFlight.get(conversazioneId)
    if (c) c.abort(new Error('canceled'))
  })

  console.log('[startup] IPC handlers registrati: ai:*')
}
