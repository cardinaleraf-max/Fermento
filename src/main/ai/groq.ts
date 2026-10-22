/**
 * Client per Groq (https://console.groq.com/) tramite la sua API
 * OpenAI-compatibile (/openai/v1/chat/completions).
 *
 * Traduce da/verso il formato interno di Bira (tipi.ts) e fa UNA sola
 * richiesta: i nuovi tentativi e il cambio di modello li decide la catena
 * dei modelli (modelli.ts) in base al tipo di errore.
 *
 * Privacy: tutto ciò che arriva qui esce dal PC. I dati dei clienti vengono
 * sostituiti da codici prima (privacy.ts), non qui.
 */

import type {
  ChatClient,
  ChatMessage,
  ChatRequest,
  ChatResponse,
  ChatToolCall,
  ChatToolDef,
  ChatUsage
} from './tipi'

export const GROQ_BASE_URL = 'https://api.groq.com/openai/v1'
const TIMEOUT_DEFAULT_MS = 90_000

export type TipoErroreProvider =
  | 'chiave_non_valida'
  | 'modello_non_disponibile'
  | 'limite'
  | 'troppo_grande'
  | 'rete'
  | 'altro'

export class ErroreProvider extends Error {
  constructor(
    readonly tipo: TipoErroreProvider,
    messaggio: string,
    readonly attesaMs: number | null = null,
    readonly status: number | null = null
  ) {
    super(messaggio)
    this.name = 'ErroreProvider'
  }
}

// --- Formato OpenAI-compatibile ------------------------------------------------

type OpenAiToolCall = {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

type OpenAiMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: OpenAiToolCall[]
  tool_call_id?: string
  name?: string
}

type OpenAiChatRequest = {
  model: string
  messages: OpenAiMessage[]
  tools?: ChatToolDef[]
  temperature?: number
  max_tokens?: number
  reasoning_effort?: 'low' | 'medium' | 'high'
  stream: false
  response_format?: { type: 'json_object' }
}

type OpenAiChatResponse = {
  model: string
  choices: Array<{ message: OpenAiMessage; finish_reason: string }>
  usage?: ChatUsage
}

// --- Classificazione degli errori ---------------------------------------------

function parseRetryAfterMs(retryAfter: string | null): number | null {
  const raw = (retryAfter ?? '').trim()
  if (!raw) return null
  const secondi = Number(raw)
  if (Number.isFinite(secondi) && secondi >= 0) return Math.ceil(secondi * 1000)
  const quando = Date.parse(raw)
  if (Number.isFinite(quando)) return Math.max(0, quando - Date.now())
  return null
}

function parseTryAgainMs(testo: string): number | null {
  const m = testo.match(/try again in\s+(?:(\d+)m)?([\d.]+)\s*(ms|s)/i)
  if (!m) return null
  const minuti = m[1] ? Number(m[1]) : 0
  const valore = Number(m[2])
  if (!Number.isFinite(valore)) return null
  const ms = m[3].toLowerCase() === 'ms' ? valore : valore * 1000
  return Math.ceil(minuti * 60_000 + ms)
}

/** Traduce una risposta HTTP di errore di Groq in un errore con tipo. Pura. */
export function classificaErrore(
  status: number,
  corpo: string,
  retryAfter: string | null
): ErroreProvider {
  const breve = corpo.slice(0, 300)
  if (status === 401 || status === 403) {
    return new ErroreProvider('chiave_non_valida', 'Chiave Groq non valida', null, status)
  }
  if (
    status === 404 ||
    /model_not_found|model_decommissioned|does not exist|decommissioned/i.test(corpo)
  ) {
    return new ErroreProvider(
      'modello_non_disponibile',
      `Modello non disponibile: ${breve}`,
      null,
      status
    )
  }
  if (status === 413) {
    return new ErroreProvider('troppo_grande', `Richiesta troppo grande: ${breve}`, null, status)
  }
  if (status === 429) {
    const attesa = parseRetryAfterMs(retryAfter) ?? parseTryAgainMs(corpo)
    return new ErroreProvider('limite', `Limite del servizio raggiunto: ${breve}`, attesa, status)
  }
  return new ErroreProvider('altro', `Groq ha risposto ${status}: ${breve}`, null, status)
}

// --- Traduzioni di formato -------------------------------------------------------

/**
 * Messaggi interni → OpenAI. Gli argomenti degli strumenti diventano stringa
 * JSON; ai risultati senza id si assegna quello dell'ultima chiamata con lo
 * stesso nome.
 */
function versoOpenAi(messages: ChatMessage[]): OpenAiMessage[] {
  const out: OpenAiMessage[] = []
  let idPerNome = new Map<string, string>()
  for (const m of messages) {
    if (m.role === 'assistant') {
      const toolCalls = (m.tool_calls ?? []).map((tc, i) => ({
        id: tc.id || `call_${out.length}_${i}`,
        type: 'function' as const,
        function: { name: tc.function.name, arguments: JSON.stringify(tc.function.arguments ?? {}) }
      }))
      if (toolCalls.length > 0)
        idPerNome = new Map(toolCalls.map((tc) => [tc.function.name, tc.id]))
      out.push({
        role: 'assistant',
        content: m.content || '',
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined
      })
    } else if (m.role === 'tool') {
      const id = m.tool_call_id || (m.tool_name ? idPerNome.get(m.tool_name) : undefined)
      out.push({
        role: 'tool',
        content: m.content || '',
        tool_call_id: id ?? `call_sconosciuta_${out.length}`,
        name: m.tool_name
      })
    } else {
      out.push({ role: m.role, content: m.content || '' })
    }
  }
  return out
}

function daOpenAi(richiesta: ChatRequest, res: OpenAiChatResponse): ChatResponse {
  const scelta = res.choices?.[0]
  const msg = scelta?.message ?? { role: 'assistant', content: '' }
  const toolCalls: ChatToolCall[] = (msg.tool_calls ?? []).map((tc) => {
    let args: Record<string, unknown> = {}
    try {
      const parsed = JSON.parse(tc.function?.arguments || '{}')
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) args = parsed
    } catch {
      // argomenti illeggibili: oggetto vuoto
    }
    return { id: tc.id, function: { name: tc.function?.name ?? '', arguments: args } }
  })
  return {
    model: res.model || richiesta.model,
    message: {
      role: 'assistant',
      content: msg.content ?? '',
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined
    },
    finish_reason: scelta?.finish_reason,
    usage: res.usage
  }
}

// --- Chiamate ----------------------------------------------------------------------

function baseUrlPulito(url: string): string {
  return (url || '').trim().replace(/\/+$/, '') || GROQ_BASE_URL
}

async function richiesta(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs)
  const suAbort = (): void => controller.abort(signal?.reason ?? new Error('annullata'))
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason)
    else signal.addEventListener('abort', suAbort, { once: true })
  }
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (e) {
    // Annullata dall'utente: si propaga così com'è.
    if (signal?.aborted) throw e
    const motivo = e instanceof Error ? e.message : String(e)
    throw new ErroreProvider('rete', `Impossibile contattare Groq: ${motivo}`)
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', suAbort)
  }
}

function intestazioni(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey.trim()}`, 'Content-Type': 'application/json' }
}

export async function chatGroq(
  baseUrl: string,
  apiKey: string,
  body: ChatRequest,
  signal?: AbortSignal,
  timeoutMs: number = TIMEOUT_DEFAULT_MS
): Promise<ChatResponse> {
  if (!apiKey.trim()) throw new ErroreProvider('chiave_non_valida', 'Chiave Groq non configurata')
  const corpo: OpenAiChatRequest = {
    model: body.model,
    messages: versoOpenAi(body.messages),
    tools: body.tools && body.tools.length > 0 ? body.tools : undefined,
    temperature: body.temperature,
    max_tokens: body.max_tokens,
    reasoning_effort: body.reasoning_effort,
    stream: false,
    response_format: body.json ? { type: 'json_object' } : undefined
  }
  const res = await richiesta(
    `${baseUrlPulito(baseUrl)}/chat/completions`,
    { method: 'POST', headers: intestazioni(apiKey), body: JSON.stringify(corpo) },
    timeoutMs,
    signal
  )
  if (!res.ok) {
    const testo = await res.text().catch(() => '')
    throw classificaErrore(res.status, testo, res.headers.get('retry-after'))
  }
  return daOpenAi(body, (await res.json()) as OpenAiChatResponse)
}

export async function modelliGroq(baseUrl: string, apiKey: string): Promise<string[]> {
  if (!apiKey.trim()) throw new ErroreProvider('chiave_non_valida', 'Chiave Groq non configurata')
  const res = await richiesta(
    `${baseUrlPulito(baseUrl)}/models`,
    { method: 'GET', headers: intestazioni(apiKey) },
    15_000
  )
  if (!res.ok) {
    const testo = await res.text().catch(() => '')
    throw classificaErrore(res.status, testo, res.headers.get('retry-after'))
  }
  const dati = (await res.json()) as { data?: Array<{ id: string }> }
  return (dati.data ?? []).map((m) => m.id).sort()
}

export function creaClientGroq(apiKey: string, baseUrl: string = GROQ_BASE_URL): ChatClient {
  return {
    chat: (body, signal) => chatGroq(baseUrl, apiKey, body, signal),
    listaModelli: () => modelliGroq(baseUrl, apiKey)
  }
}
