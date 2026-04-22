/**
 * Client minimale per le API Ollama (http://localhost:11434).
 * Documentazione: https://github.com/ollama/ollama/blob/main/docs/api.md
 *
 * Usiamo solo l'endpoint /api/chat con tools (function calling) e
 * /api/tags per scoprire i modelli installati.
 */

export type OllamaRole = 'system' | 'user' | 'assistant' | 'tool'

export type OllamaToolCall = {
  /**
   * ID del tool call. Ollama non lo richiede, OpenAI/Groq si'.
   * Quando presente viene propagato dal client per associare il risultato
   * del tool alla chiamata originale.
   */
  id?: string
  function: {
    name: string
    arguments: Record<string, unknown>
  }
}

export type OllamaMessage = {
  role: OllamaRole
  content: string
  tool_calls?: OllamaToolCall[]
  /** Solo per role='tool', usato da Ollama per legare risultato a chiamata. */
  tool_name?: string
  /** Solo per role='tool', usato da OpenAI/Groq per legare risultato a chiamata. */
  tool_call_id?: string
}

export type OllamaToolDef = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, unknown>
      required?: string[]
    }
  }
}

export type OllamaChatRequest = {
  model: string
  messages: OllamaMessage[]
  tools?: OllamaToolDef[]
  stream?: false
  /**
   * Se 'json' forza l'output ad essere JSON valido. Su Ollama mappa
   * nativamente; su Groq viene tradotto in response_format json_object.
   */
  format?: 'json'
  options?: {
    temperature?: number
    num_ctx?: number
  }
}

export type OllamaChatResponse = {
  model: string
  created_at: string
  message: OllamaMessage
  done: boolean
  done_reason?: string
  total_duration?: number
  prompt_eval_count?: number
  eval_count?: number
}

export type OllamaTagsResponse = {
  models: Array<{
    name: string
    model: string
    modified_at: string
    size: number
    details?: { parameter_size?: string; family?: string }
  }>
}

// Default volutamente alto: su hardware modesto (CPU, no GPU) il primo turno con
// caricamento modello + tool-calling puo' richiedere parecchi minuti. Meglio
// affidarsi all'AbortController utente per fermare richieste davvero appese.
const DEFAULT_TIMEOUT_MS = 600_000

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs)
  // Inoltra il segnale esterno (cancellazione utente) all'AbortController locale.
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
  return trimmed || 'http://localhost:11434'
}

export async function pingOllama(baseUrl: string): Promise<{ ok: boolean; errore?: string }> {
  try {
    const res = await fetchWithTimeout(
      `${normalizeBaseUrl(baseUrl)}/api/tags`,
      { method: 'GET' },
      5_000
    )
    if (!res.ok) return { ok: false, errore: `Ollama ha risposto con status ${res.status}` }
    return { ok: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, errore: `Impossibile contattare Ollama: ${msg}` }
  }
}

export async function listOllamaModels(baseUrl: string): Promise<string[]> {
  const res = await fetchWithTimeout(
    `${normalizeBaseUrl(baseUrl)}/api/tags`,
    { method: 'GET' },
    5_000
  )
  if (!res.ok) throw new Error(`Ollama /api/tags status ${res.status}`)
  const data = (await res.json()) as OllamaTagsResponse
  return (data.models ?? []).map((m) => m.name).sort()
}

export async function chatOllama(
  baseUrl: string,
  body: OllamaChatRequest,
  signal?: AbortSignal,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<OllamaChatResponse> {
  const res = await fetchWithTimeout(
    `${normalizeBaseUrl(baseUrl)}/api/chat`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, stream: false, format: body.format })
    },
    timeoutMs,
    signal
  )
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Ollama /api/chat status ${res.status}: ${text.slice(0, 200)}`)
  }
  return (await res.json()) as OllamaChatResponse
}
