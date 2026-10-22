/**
 * Tipi dei messaggi scambiati con il modello (formato interno di Bira).
 * Il client del fornitore (groq.ts) li traduce nel formato OpenAI-compatibile.
 */

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool'

export type ChatToolCall = {
  /** Id della chiamata: serve a legare il risultato dello strumento alla richiesta. */
  id?: string
  function: {
    name: string
    arguments: Record<string, unknown>
  }
}

export type ChatMessage = {
  role: ChatRole
  content: string
  tool_calls?: ChatToolCall[]
  /** Solo per role='tool': nome dello strumento che ha prodotto il risultato. */
  tool_name?: string
  /** Solo per role='tool': id della chiamata a cui risponde. */
  tool_call_id?: string
}

export type ChatToolDef = {
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

export type ChatRequest = {
  model: string
  messages: ChatMessage[]
  tools?: ChatToolDef[]
  /** Se true la risposta deve essere un oggetto JSON valido. */
  json?: boolean
  temperature?: number
  max_tokens?: number
  /** Solo per i modelli che ragionano (es. gpt-oss). */
  reasoning_effort?: 'low' | 'medium' | 'high'
}

export type ChatUsage = {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

export type ChatResponse = {
  model: string
  message: ChatMessage
  finish_reason?: string
  usage?: ChatUsage
}

/** Cliente verso il fornitore del modello: una domanda alla volta, nessun nuovo tentativo. */
export type ChatClient = {
  chat: (body: ChatRequest, signal?: AbortSignal) => Promise<ChatResponse>
  listaModelli: () => Promise<string[]>
}
