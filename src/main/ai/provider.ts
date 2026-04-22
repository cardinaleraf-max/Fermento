/**
 * Layer di astrazione sui provider LLM supportati da Fermento.
 *
 * L'orchestratore (agent.ts) non parla direttamente con Ollama o con
 * Groq: parla con un `ChatClient` creato dalla factory qui sotto.
 * Aggiungere un nuovo provider significa creare un nuovo file client
 * e registrarlo qui.
 *
 * Scelte di privacy:
 *  - 'ollama' (locale): nessun dato esce dal PC.
 *  - 'groq'   (cloud): i dati transitano sui server Groq negli USA.
 *    Il filtro dei tool sensibili avviene a monte in tools.ts usando
 *    `cloud_safe`. Il client in se' non conosce questa distinzione.
 */

import {
  chatOllama,
  listOllamaModels,
  pingOllama,
  type OllamaChatRequest,
  type OllamaChatResponse
} from './ollama'
import { chatGroq, DEFAULT_GROQ_BASE_URL, listGroqModels, pingGroq } from './groq'

export type ProviderTipo = 'ollama' | 'groq'

export const PROVIDER_TIPI: ProviderTipo[] = ['ollama', 'groq']

/** Configurazione runtime pronta per istanziare un client. */
export type ProviderConfig = {
  tipo: ProviderTipo
  baseUrl: string
  apiKey: string
  timeoutMs: number
}

export type ChatClient = {
  readonly tipo: ProviderTipo
  /** True se il provider invia dati fuori dal PC. */
  readonly remoto: boolean
  ping: () => Promise<{ ok: boolean; errore?: string }>
  listaModelli: () => Promise<string[]>
  chat: (
    body: OllamaChatRequest,
    signal?: AbortSignal
  ) => Promise<OllamaChatResponse>
}

export function normalizzaProvider(v: string | undefined): ProviderTipo {
  const s = (v || '').trim().toLowerCase()
  return (PROVIDER_TIPI as string[]).includes(s) ? (s as ProviderTipo) : 'ollama'
}

export function urlDefaultPerProvider(tipo: ProviderTipo): string {
  switch (tipo) {
    case 'groq':
      return DEFAULT_GROQ_BASE_URL
    case 'ollama':
    default:
      return 'http://localhost:11434'
  }
}

export function creaClient(cfg: ProviderConfig): ChatClient {
  if (cfg.tipo === 'groq') {
    return {
      tipo: 'groq',
      remoto: true,
      ping: () => pingGroq(cfg.baseUrl, cfg.apiKey),
      listaModelli: () => listGroqModels(cfg.baseUrl, cfg.apiKey),
      chat: (body, signal) => chatGroq(cfg.baseUrl, cfg.apiKey, body, signal, cfg.timeoutMs)
    }
  }
  return {
    tipo: 'ollama',
    remoto: false,
    ping: () => pingOllama(cfg.baseUrl),
    listaModelli: () => listOllamaModels(cfg.baseUrl),
    chat: (body, signal) => chatOllama(cfg.baseUrl, body, signal, cfg.timeoutMs)
  }
}
