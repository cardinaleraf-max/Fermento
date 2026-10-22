/**
 * Catena dei modelli di Bira con ripiego automatico.
 *
 * Groq toglie o limita i modelli gratuiti senza preavviso (il 16/08/2026 ha
 * tolto llama-3.3-70b). Bira non deve dipendere da un solo modello:
 *  - modello sparito → escluso, si passa al successivo;
 *  - limite al minuto (429) → quel modello «riposa» e si passa al successivo
 *    (ogni modello ha un suo conteggio separato); se riposano tutti si aspetta
 *    il meno possibile avvisando l'utente;
 *  - catena intera sparita → si sceglie il miglior modello di chat rimasto
 *    dalla lista di Groq.
 */
import { ErroreProvider } from './groq'
import type { ChatClient, ChatRequest, ChatResponse } from './tipi'

export type VoceCatena = { id: string; extra: Partial<ChatRequest> }

export const CATENA_MODELLI: ReadonlyArray<VoceCatena> = [
  { id: 'openai/gpt-oss-120b', extra: { reasoning_effort: 'low' } },
  { id: 'qwen/qwen3.8-27b', extra: {} },
  { id: 'openai/gpt-oss-20b', extra: { reasoning_effort: 'low' } }
]

const ATTESA_LIMITE_DEFAULT_MS = 4000
const ATTESA_MAX_GIRO_MS = 30_000
const ATTESA_MAX_TOTALE_MS = 60_000
const RIPOSO_ERRORE_SERVER_MS = 15_000

const SCARTA_RISERVA = /whisper|guard|orpheus|tts|safeguard|prompt|embed/i
const PREFERENZE_RISERVA = [/gpt-oss-120b/i, /qwen/i, /gpt-oss/i, /llama/i, /kimi/i]

/** Il miglior modello di chat in una lista di Groq, o null. Pura. */
export function scegliModelloDiRiserva(ids: string[]): string | null {
  const chat = ids.filter((id) => !SCARTA_RISERVA.test(id))
  for (const pref of PREFERENZE_RISERVA) {
    const trovato = chat.find((id) => pref.test(id))
    if (trovato) return trovato
  }
  return null
}

type Opzioni = {
  attendi?: (ms: number, signal?: AbortSignal) => Promise<void>
  adesso?: () => number
  maxAttesaTotaleMs?: number
}

function attesaReale(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new Error('annullata'))
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', suAbort)
      resolve()
    }, ms)
    const suAbort = (): void => {
      clearTimeout(timer)
      reject(signal?.reason ?? new Error('annullata'))
    }
    signal?.addEventListener('abort', suAbort, { once: true })
  })
}

export class GestoreModelli {
  private readonly esclusiSet = new Set<string>()
  private readonly riposoFino = new Map<string, number>()
  /** Parametri tolti a un modello che li ha rifiutati. */
  private readonly senzaExtra = new Set<string>()
  private riserva: VoceCatena | null = null
  private riservaCercata = false
  private readonly attendi: NonNullable<Opzioni['attendi']>
  private readonly adesso: NonNullable<Opzioni['adesso']>
  private readonly maxAttesaTotaleMs: number

  constructor(
    private readonly client: ChatClient,
    opzioni: Opzioni = {}
  ) {
    this.attendi = opzioni.attendi ?? attesaReale
    this.adesso = opzioni.adesso ?? Date.now
    this.maxAttesaTotaleMs = opzioni.maxAttesaTotaleMs ?? ATTESA_MAX_TOTALE_MS
  }

  esclusi(): string[] {
    return [...this.esclusiSet]
  }

  private ultimo: string | null = null

  /** Il modello usato (o tentato) per l'ultima richiesta. */
  ultimoModello(): string | null {
    return this.ultimo
  }

  private candidati(): VoceCatena[] {
    const tutti = this.riserva ? [...CATENA_MODELLI, this.riserva] : [...CATENA_MODELLI]
    return tutti.filter((v) => !this.esclusiSet.has(v.id))
  }

  private async cercaRiserva(): Promise<boolean> {
    if (this.riservaCercata) return false
    this.riservaCercata = true
    let ids: string[]
    try {
      ids = await this.client.listaModelli()
    } catch (e) {
      if (e instanceof ErroreProvider && e.tipo === 'chiave_non_valida') throw e
      return false
    }
    const id = scegliModelloDiRiserva(ids.filter((i) => !this.esclusiSet.has(i)))
    if (!id) return false
    this.riserva = { id, extra: {} }
    return true
  }

  /**
   * Una risposta dal primo modello disponibile della catena.
   * `suAttesa` viene chiamata (in secondi) prima di ogni pausa imposta dai limiti.
   */
  async chat(
    body: Omit<ChatRequest, 'model'>,
    signal?: AbortSignal,
    suAttesa?: (secondi: number) => void,
    opzioni: { maxAttesaTotaleMs?: number; salta?: string } = {}
  ): Promise<{ risposta: ChatResponse; modello: string }> {
    const maxAttesa = opzioni.maxAttesaTotaleMs ?? this.maxAttesaTotaleMs
    let attesaTotale = 0
    let tentativiRete = 0
    for (;;) {
      const tutti = this.candidati()
      // «salta»: evita il modello che ha appena sbagliato, se ce n'è un altro.
      const altri = opzioni.salta ? tutti.filter((c) => c.id !== opzioni.salta) : tutti
      const candidati = altri.length > 0 ? altri : tutti
      if (candidati.length === 0) {
        if (await this.cercaRiserva()) continue
        throw new ErroreProvider(
          'modello_non_disponibile',
          'Nessun modello di Groq disponibile per Bira in questo momento.'
        )
      }

      const ora = this.adesso()
      const pronti = candidati.filter((c) => (this.riposoFino.get(c.id) ?? 0) <= ora)
      if (pronti.length === 0) {
        const prossimo = Math.min(...candidati.map((c) => this.riposoFino.get(c.id) ?? ora))
        const attesa = Math.min(Math.max(prossimo - ora, 500), ATTESA_MAX_GIRO_MS)
        if (attesaTotale + attesa > maxAttesa) {
          throw new ErroreProvider(
            'limite',
            'Il servizio gratuito di Bira è momentaneamente al limite: riprova tra un minuto.'
          )
        }
        suAttesa?.(Math.ceil(attesa / 1000))
        await this.attendi(attesa, signal)
        attesaTotale += attesa
        continue
      }

      const voce = pronti[0]
      this.ultimo = voce.id
      const extra = this.senzaExtra.has(voce.id) ? {} : voce.extra
      try {
        const risposta = await this.client.chat({ ...body, ...extra, model: voce.id }, signal)
        return { risposta, modello: voce.id }
      } catch (e) {
        if (!(e instanceof ErroreProvider)) throw e
        if (e.tipo === 'modello_non_disponibile') {
          this.esclusiSet.add(voce.id)
          continue
        }
        if (e.tipo === 'limite') {
          this.riposoFino.set(voce.id, this.adesso() + (e.attesaMs ?? ATTESA_LIMITE_DEFAULT_MS))
          continue
        }
        if (e.tipo === 'rete' && tentativiRete < 1) {
          tentativiRete++
          await this.attendi(1000, signal)
          continue
        }
        if (
          e.tipo === 'altro' &&
          e.status === 400 &&
          /reasoning/i.test(e.message) &&
          Object.keys(extra).length > 0
        ) {
          this.senzaExtra.add(voce.id)
          continue
        }
        if (e.tipo === 'altro' && (e.status ?? 0) >= 500) {
          this.riposoFino.set(voce.id, this.adesso() + RIPOSO_ERRORE_SERVER_MS)
          continue
        }
        throw e
      }
    }
  }
}

export type StatoBira = {
  stato: 'pronto' | 'chiave_non_valida' | 'non_raggiungibile' | 'nessun_modello'
  modello: string | null
  messaggio: string
}

/** Prova vera: una mini domanda al primo modello disponibile. */
export async function verificaBira(gestore: GestoreModelli): Promise<StatoBira> {
  try {
    const { modello } = await gestore.chat(
      { messages: [{ role: 'user', content: 'Rispondi solo: ok' }], max_tokens: 64 },
      undefined,
      undefined,
      { maxAttesaTotaleMs: 0 }
    )
    return { stato: 'pronto', modello, messaggio: 'Bira è pronto.' }
  } catch (e) {
    if (!(e instanceof ErroreProvider)) {
      return { stato: 'non_raggiungibile', modello: null, messaggio: 'Bira non risponde.' }
    }
    switch (e.tipo) {
      case 'chiave_non_valida':
        return {
          stato: 'chiave_non_valida',
          modello: null,
          messaggio: 'La chiave non è valida: controlla di averla copiata per intero.'
        }
      case 'limite':
        return {
          stato: 'pronto',
          modello: null,
          messaggio: 'Bira è pronto (in questo momento il servizio gratuito è molto richiesto).'
        }
      case 'modello_non_disponibile':
        return {
          stato: 'nessun_modello',
          modello: null,
          messaggio: 'Groq non offre al momento un modello adatto a Bira. Contatta Fermento.'
        }
      case 'rete':
        return {
          stato: 'non_raggiungibile',
          modello: null,
          messaggio: 'Bira non riesce a collegarsi: controlla la connessione a internet.'
        }
      default:
        return {
          stato: 'non_raggiungibile',
          modello: null,
          messaggio: 'Il servizio di Bira ha dato un errore: riprova tra poco.'
        }
    }
  }
}
