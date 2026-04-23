/**
 * Client per Groq (https://console.groq.com/) usando la loro API
 * OpenAI-compatible (endpoint /openai/v1/chat/completions).
 *
 * Internamente traduciamo da/verso il formato messaggi "Ollama-like"
 * usato dall'agente, cosi' l'orchestratore (agent.ts) non deve sapere
 * chi c'e' dietro.
 *
 * Nota privacy: Groq e' un servizio cloud negli USA. Dichiarano zero
 * retention e zero training sul tier gratuito. In ogni caso tutto cio'
 * che viene inviato a questo client esce dal PC e transita sui loro
 * server. La responsabilita' di filtrare dati sensibili (ricette, PII
 * clienti, nomi materie prime) e' dell'orchestratore, non del client.
 */

import type {
  OllamaChatRequest,
  OllamaChatResponse,
  OllamaMessage,
  OllamaToolCall,
  OllamaToolDef
} from './ollama'

const DEFAULT_GROQ_BASE_URL = 'https://api.groq.com/openai/v1'
const DEFAULT_TIMEOUT_MS = 600_000
const MAX_RATE_LIMIT_RETRIES = 2

// --- Tipi del formato OpenAI-compatible (quello parlato da Groq) ----------

type OpenAiToolCall = {
  id: string
  type: 'function'
  function: { name: string; arguments: string } // arguments e' JSON come stringa
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
  tools?: OllamaToolDef[] // stesso shape di OpenAI: { type:'function', function:{name,description,parameters} }
  temperature?: number
  stream?: false
  response_format?: { type: 'json_object' | 'text' }
}

type OpenAiChatResponse = {
  id: string
  model: string
  choices: Array<{
    index: number
    message: OpenAiMessage
    finish_reason: string
  }>
}

type OpenAiModelsResponse = {
  data: Array<{ id: string; object: 'model' }>
}

// --- Fetch con timeout e abort esterno (copia leggera da ollama.ts) --------

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs)
  const onExternalAbort = (): void => controller.abort(signal?.reason ?? new Error('canceled'))
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason)
    else signal.addEventListener('abort', onExternalAbort, { once: true })
  }
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
    if (signal) signal.removeEventListener('abort', onExternalAbort)
  }
}

function normalizeBaseUrl(url: string): string {
  const trimmed = (url || '').trim().replace(/\/+$/, '')
  return trimmed || DEFAULT_GROQ_BASE_URL
}

function parseRetryAfterMs(retryAfter: string | null): number | null {
  if (!retryAfter) return null
  const raw = retryAfter.trim()
  if (!raw) return null
  const seconds = Number(raw)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000)
  const asDate = Date.parse(raw)
  if (Number.isFinite(asDate)) {
    const delta = asDate - Date.now()
    return delta > 0 ? delta : 0
  }
  return null
}

function parseTryAgainMessageMs(text: string): number | null {
  const m = text.match(/try again in\s+([\d.]+)\s*s/i)
  if (!m) return null
  const seconds = Number(m[1])
  if (!Number.isFinite(seconds) || seconds < 0) return null
  return Math.ceil(seconds * 1000)
}

async function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return
  if (signal?.aborted) throw signal.reason ?? new Error('canceled')
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      reject(signal?.reason ?? new Error('canceled'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

// --- Traduzioni di formato ---------------------------------------------------

/**
 * Converte messaggi Ollama-like nel formato OpenAI-compatible.
 * Le chiamate tool di Ollama hanno arguments come oggetto; OpenAI vuole
 * stringa JSON. I messaggi di ruolo 'tool' hanno bisogno di tool_call_id:
 * lo ricostruiamo a partire dall'ultimo assistant message con tool_calls
 * che contiene un tool con quel nome (se non e' gia' presente).
 */
function toOpenAiMessages(messages: OllamaMessage[]): OpenAiMessage[] {
  const out: OpenAiMessage[] = []
  // name -> id dell'ultima tool call vista (per risolvere i tool_call_id mancanti)
  let pendingByName = new Map<string, string>()

  for (const m of messages) {
    if (m.role === 'assistant') {
      const toolCalls = (m.tool_calls ?? []).map((tc, i) => {
        // Se l'id non e' presente ne generiamo uno deterministico.
        const id = tc.id || `call_${out.length}_${i}`
        return {
          id,
          type: 'function' as const,
          function: {
            name: tc.function.name,
            arguments: JSON.stringify(tc.function.arguments ?? {})
          }
        }
      })
      if (toolCalls.length > 0) {
        pendingByName = new Map(toolCalls.map((tc) => [tc.function.name, tc.id]))
      }
      out.push({
        role: 'assistant',
        content: m.content || '',
        tool_calls: toolCalls.length > 0 ? toolCalls : undefined
      })
      continue
    }

    if (m.role === 'tool') {
      const id = m.tool_call_id || (m.tool_name ? pendingByName.get(m.tool_name) : undefined)
      out.push({
        role: 'tool',
        content: m.content || '',
        tool_call_id: id ?? `call_unknown_${out.length}`,
        name: m.tool_name
      })
      continue
    }

    out.push({ role: m.role, content: m.content || '' })
  }
  return out
}

/**
 * Converte la risposta OpenAI-compatible nel formato "Ollama-like"
 * richiesto dall'agent. In particolare fa il parse di arguments da
 * stringa JSON a oggetto.
 */
function fromOpenAiResponse(
  req: OllamaChatRequest,
  res: OpenAiChatResponse
): OllamaChatResponse {
  const choice = res.choices?.[0]
  const msg = choice?.message ?? { role: 'assistant', content: '' }

  const toolCalls: OllamaToolCall[] = (msg.tool_calls ?? []).map((tc) => {
    let args: Record<string, unknown> = {}
    if (typeof tc.function?.arguments === 'string') {
      try {
        const parsed = JSON.parse(tc.function.arguments)
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          args = parsed as Record<string, unknown>
        }
      } catch {
        // arguments non parseabile: lasciamo oggetto vuoto
      }
    }
    return {
      id: tc.id,
      function: { name: tc.function?.name ?? '', arguments: args }
    }
  })

  return {
    model: res.model || req.model,
    created_at: new Date().toISOString(),
    message: {
      role: 'assistant',
      content: msg.content ?? '',
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined
    },
    done: true,
    done_reason: choice?.finish_reason
  }
}

// --- API pubbliche -----------------------------------------------------------

function authHeader(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey.trim()}` }
}

export async function pingGroq(
  baseUrl: string,
  apiKey: string
): Promise<{ ok: boolean; errore?: string }> {
  if (!apiKey || !apiKey.trim()) {
    return { ok: false, errore: 'API key Groq non configurata (Impostazioni → Assistente AI)' }
  }
  try {
    const res = await fetchWithTimeout(
      `${normalizeBaseUrl(baseUrl)}/models`,
      { method: 'GET', headers: authHeader(apiKey) },
      10_000
    )
    if (res.status === 401) return { ok: false, errore: 'API key Groq non valida (401)' }
    if (!res.ok) return { ok: false, errore: `Groq ha risposto con status ${res.status}` }
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, errore: `Impossibile contattare Groq: ${msg}` }
  }
}

export async function listGroqModels(baseUrl: string, apiKey: string): Promise<string[]> {
  if (!apiKey || !apiKey.trim()) throw new Error('API key Groq non configurata')
  const res = await fetchWithTimeout(
    `${normalizeBaseUrl(baseUrl)}/models`,
    { method: 'GET', headers: authHeader(apiKey) },
    10_000
  )
  if (!res.ok) throw new Error(`Groq /models status ${res.status}`)
  const data = (await res.json()) as OpenAiModelsResponse
  return (data.data ?? []).map((m) => m.id).sort()
}

export async function chatGroq(
  baseUrl: string,
  apiKey: string,
  body: OllamaChatRequest,
  signal?: AbortSignal,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<OllamaChatResponse> {
  if (!apiKey || !apiKey.trim()) throw new Error('API key Groq non configurata')

  const openAiBody: OpenAiChatRequest = {
    model: body.model,
    messages: toOpenAiMessages(body.messages),
    tools: body.tools,
    temperature: body.options?.temperature,
    stream: false,
    response_format: body.format === 'json' ? { type: 'json_object' } : undefined
  }
  const url = `${normalizeBaseUrl(baseUrl)}/chat/completions`
  for (let attempt = 0; ; attempt++) {
    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeader(apiKey)
        },
        body: JSON.stringify(openAiBody)
      },
      timeoutMs,
      signal
    )

    if (res.ok) {
      const data = (await res.json()) as OpenAiChatResponse
      return fromOpenAiResponse(body, data)
    }

    const text = await res.text().catch(() => '')
    if (res.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
      const retryAfterMs =
        parseRetryAfterMs(res.headers.get('retry-after')) ??
        parseTryAgainMessageMs(text) ??
        4000
      await sleepWithAbort(Math.min(Math.max(retryAfterMs, 250), 20_000), signal)
      continue
    }
    throw new Error(`Groq /chat/completions status ${res.status}: ${text.slice(0, 300)}`)
  }
}

export { DEFAULT_GROQ_BASE_URL }
