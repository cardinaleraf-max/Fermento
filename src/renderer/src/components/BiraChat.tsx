import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  CircleStop,
  Cloud,
  HardDrive,
  Loader2,
  Plus,
  Send,
  Sparkles,
  Wrench,
  X
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type RuoloMessaggio = 'user' | 'assistant'

type ToolEvento = {
  nome: string
  argomenti: Record<string, unknown>
  ok: boolean | null
  anteprima: string | null
}

type Messaggio = {
  id: string
  ruolo: RuoloMessaggio
  contenuto: string
  toolCalls: ToolEvento[]
  errore?: string | null
  inCorso?: boolean
  modello?: string | null
}

type AiHealth = Awaited<ReturnType<typeof window.api.ai.health>>

const PROMPT_LOCALI = [
  'Cosa va in scadenza nei prossimi 60 giorni?',
  'Quali clienti non comprano da pi\u00f9 di 20 giorni?',
  'Come carico una nuova materia prima?',
  'Come avvio una nuova cotta?',
  'Riassumimi la situazione del birrificio'
]

const PROMPT_CLOUD = [
  'Riassumimi la situazione del birrificio',
  'Quali sono le birre pi\u00f9 vendute negli ultimi 90 giorni?',
  'Come si confeziona una cotta?',
  'Dove imposto il provider AI?',
  'Giacenza attuale di prodotto finito per ogni birra'
]

function generaId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function ToolCallView({ tool }: { tool: ToolEvento }): React.JSX.Element {
  const [aperto, setAperto] = useState(false)
  const stato = tool.ok === null ? 'in corso' : tool.ok ? 'ok' : 'errore'
  const colore =
    tool.ok === null
      ? 'text-white/40'
      : tool.ok
        ? 'text-emerald-400/80'
        : 'text-red-400/80'

  return (
    <div className="rounded-md border border-white/[0.06] bg-white/[0.02]">
      <button
        type="button"
        onClick={() => setAperto((v) => !v)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] text-white/55 hover:text-white/80"
      >
        {aperto ? (
          <ChevronDown className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" />
        )}
        <Wrench className="h-3 w-3 shrink-0" />
        <span className="truncate font-mono text-[11px]">{tool.nome}</span>
        <span className={cn('ml-auto text-[10px] uppercase tracking-wider', colore)}>
          {stato}
        </span>
      </button>
      {aperto && (
        <div className="space-y-1.5 border-t border-white/[0.06] p-2.5 text-[11px]">
          {Object.keys(tool.argomenti).length > 0 && (
            <div>
              <div className="mb-0.5 text-[10px] uppercase tracking-wider text-white/30">
                Argomenti
              </div>
              <pre className="overflow-x-auto whitespace-pre-wrap break-words text-white/55">
                {JSON.stringify(tool.argomenti, null, 2)}
              </pre>
            </div>
          )}
          {tool.anteprima && (
            <div>
              <div className="mb-0.5 text-[10px] uppercase tracking-wider text-white/30">
                {tool.ok === false ? 'Errore' : 'Anteprima risultato'}
              </div>
              <pre className="overflow-x-auto whitespace-pre-wrap break-words text-white/55">
                {tool.anteprima}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MessaggioView({ msg }: { msg: Messaggio }): React.JSX.Element {
  if (msg.ruolo === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-amber-400/10 px-3.5 py-2 text-sm text-amber-50/90">
          <div className="whitespace-pre-wrap break-words">{msg.contenuto}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] space-y-2">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-white/30">
          <Sparkles className="h-3 w-3 text-amber-400/60" />
          <span>Bira</span>
          {msg.modello && <span className="truncate text-white/20">· {msg.modello}</span>}
        </div>

        {msg.toolCalls.length > 0 && (
          <div className="space-y-1">
            {msg.toolCalls.map((t, idx) => (
              <ToolCallView key={`${t.nome}-${idx}`} tool={t} />
            ))}
          </div>
        )}

        {msg.contenuto && (
          <div className="rounded-2xl rounded-bl-sm bg-white/[0.04] px-3.5 py-2 text-sm text-white/85">
            <div className="whitespace-pre-wrap break-words">{msg.contenuto}</div>
          </div>
        )}

        {msg.inCorso && !msg.contenuto && (
          <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-white/[0.04] px-3.5 py-2 text-sm text-white/50">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>Sto pensando…</span>
          </div>
        )}

        {msg.errore && (
          <div className="flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <div className="whitespace-pre-wrap break-words">{msg.errore}</div>
          </div>
        )}
      </div>
    </div>
  )
}

export type BiraChatProps = {
  /** Se presente, mostra il bottone di chiusura chiamando questa callback. */
  onClose?: () => void
}

export function BiraChat({ onClose }: BiraChatProps): React.JSX.Element {
  const [messaggi, setMessaggi] = useState<Messaggio[]>([])
  const [input, setInput] = useState('')
  const [health, setHealth] = useState<AiHealth | null>(null)
  const [healthLoading, setHealthLoading] = useState(true)
  const [conversazioneAttiva, setConversazioneAttiva] = useState<string | null>(null)

  const messaggiRef = useRef<Messaggio[]>([])
  messaggiRef.current = messaggi

  const containerRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  const verificaHealth = useCallback(async () => {
    setHealthLoading(true)
    try {
      setHealth(await window.api.ai.health())
    } catch (e) {
      setHealth({
        abilitato: true,
        provider: 'ollama',
        url: '',
        modello: '',
        remoto: false,
        raggiungibile: false,
        errore: e instanceof Error ? e.message : 'Errore'
      })
    } finally {
      setHealthLoading(false)
    }
  }, [])

  useEffect(() => {
    void verificaHealth()
  }, [verificaHealth])

  useEffect(() => {
    const off = window.api.ai.onEvento(({ conversazioneId, evento }) => {
      setMessaggi((prev) => {
        const idx = prev.findIndex((m) => m.id === conversazioneId && m.ruolo === 'assistant')
        if (idx === -1) return prev
        const next = [...prev]
        const cur = { ...next[idx] }
        switch (evento.tipo) {
          case 'inizio':
            cur.modello = evento.modello
            break
          case 'tool_call':
            cur.toolCalls = [
              ...cur.toolCalls,
              {
                nome: evento.nome,
                argomenti: evento.argomenti,
                ok: null,
                anteprima: null
              }
            ]
            break
          case 'tool_risultato': {
            const calls = [...cur.toolCalls]
            for (let i = calls.length - 1; i >= 0; i--) {
              if (calls[i].nome === evento.nome && calls[i].ok === null) {
                calls[i] = { ...calls[i], ok: evento.ok, anteprima: evento.anteprima }
                break
              }
            }
            cur.toolCalls = calls
            break
          }
          case 'risposta':
            cur.contenuto = evento.testo
            break
          case 'errore':
            cur.errore = evento.messaggio
            break
          case 'fine':
            cur.inCorso = false
            break
        }
        next[idx] = cur
        return next
      })
      if (evento.tipo === 'fine') {
        setConversazioneAttiva((curId) => (curId === conversazioneId ? null : curId))
      }
    })
    return off
  }, [])

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [messaggi])

  const inviaMessaggio = useCallback(
    (testoPersonalizzato?: string) => {
      const testo = (testoPersonalizzato ?? input).trim()
      if (!testo || conversazioneAttiva) return

      const nuovoUser: Messaggio = {
        id: generaId(),
        ruolo: 'user',
        contenuto: testo,
        toolCalls: []
      }
      const conversazioneId = generaId()
      const nuovoAssistant: Messaggio = {
        id: conversazioneId,
        ruolo: 'assistant',
        contenuto: '',
        toolCalls: [],
        inCorso: true
      }
      const cronologiaPrec = messaggiRef.current
        .filter((m) => !m.inCorso && (m.contenuto || m.ruolo === 'user'))
        .map((m) => ({
          ruolo: m.ruolo,
          contenuto: m.contenuto
        }))
      const cronologia = [...cronologiaPrec, { ruolo: 'user' as const, contenuto: testo }]

      setMessaggi((prev) => [...prev, nuovoUser, nuovoAssistant])
      setInput('')
      setConversazioneAttiva(conversazioneId)

      window.api.ai.chat({ conversazioneId, cronologia })
      setTimeout(() => inputRef.current?.focus(), 0)
    },
    [conversazioneAttiva, input]
  )

  const annulla = useCallback(() => {
    if (conversazioneAttiva) window.api.ai.annulla(conversazioneAttiva)
  }, [conversazioneAttiva])

  const nuovaConversazione = useCallback(() => {
    if (conversazioneAttiva) annulla()
    setMessaggi([])
    setInput('')
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [annulla, conversazioneAttiva])

  const statoHeader = useMemo(() => {
    if (healthLoading) return { testo: 'Verifica…', colore: 'text-white/40' }
    if (!health) return { testo: 'Stato sconosciuto', colore: 'text-white/40' }
    if (!health.abilitato) return { testo: 'Disabilitato', colore: 'text-white/40' }
    const nomeProvider = health.provider === 'groq' ? 'Groq' : 'Ollama'
    if (!health.raggiungibile)
      return { testo: `${nomeProvider} non raggiungibile`, colore: 'text-red-400/80' }
    return {
      testo: `Online · ${health.modello || 'modello sconosciuto'}`,
      colore: 'text-emerald-400/80'
    }
  }, [health, healthLoading])

  const badgeProvider = useMemo(() => {
    if (!health) return null
    if (health.remoto) {
      return {
        icona: Cloud,
        testo: 'Cloud',
        colore: 'border-amber-400/40 bg-amber-400/10 text-amber-200/90',
        tooltip:
          'Modalit\u00e0 cloud: domande e risultati transitano sui server Groq (USA). I tool sensibili (clienti, ricette, materie prime) sono disattivati.'
      }
    }
    return {
      icona: HardDrive,
      testo: 'Locale',
      colore: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300/90',
      tooltip: 'Modalit\u00e0 locale: nessun dato esce dal PC.'
    }
  }, [health])

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#0C0C14]">
      <div
        className="flex items-center justify-between gap-2 px-3.5 py-2.5"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-400/15">
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white/90">Bira</div>
            <div className={cn('truncate text-[10px]', statoHeader.colore)}>
              {statoHeader.testo}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {badgeProvider && (
            <span
              title={badgeProvider.tooltip}
              className={cn(
                'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider',
                badgeProvider.colore
              )}
            >
              <badgeProvider.icona className="h-2.5 w-2.5" />
              {badgeProvider.testo}
            </span>
          )}
          <button
            type="button"
            onClick={nuovaConversazione}
            disabled={messaggi.length === 0}
            className="rounded-md p-1.5 text-white/40 transition-colors hover:bg-white/[0.05] hover:text-white/80 disabled:cursor-not-allowed disabled:opacity-30"
            title="Nuova chat"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-white/40 transition-colors hover:bg-white/[0.05] hover:text-white/80"
              title="Chiudi"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {health && !health.raggiungibile && health.abilitato && (
        <div className="flex items-start gap-1.5 border-b border-amber-500/20 bg-amber-500/[0.08] px-3 py-2 text-[11px] text-amber-100/85">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          <div>
            <div className="font-medium">
              {health.provider === 'groq'
                ? 'Groq non raggiungibile'
                : `Ollama non raggiungibile${health.url ? ` su ${health.url}` : ''}`}
            </div>
            <div className="mt-0.5 text-amber-100/70">
              {health.provider === 'groq'
                ? 'Verifica API key e connessione internet dalle Impostazioni.'
                : "Avvia Ollama oppure passa a Groq dalle Impostazioni \u2192 Assistente AI."}
            </div>
          </div>
        </div>
      )}

      {health?.remoto && health.raggiungibile && (
        <div className="flex items-start gap-1.5 border-b border-amber-400/15 bg-amber-400/[0.04] px-3 py-1.5 text-[10px] text-amber-100/75">
          <Cloud className="mt-0.5 h-3 w-3 shrink-0" />
          <div>
            Modalit&agrave; cloud: clienti, ricette, nomi materie prime non vengono inviati.
          </div>
        </div>
      )}

      <div ref={containerRef} className="flex-1 overflow-y-auto px-3.5 py-3">
        {messaggi.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="rounded-full bg-amber-400/10 p-2.5">
              <Sparkles className="h-5 w-5 text-amber-400/80" />
            </div>
            <div className="max-w-xs space-y-1">
              <h3 className="text-sm font-semibold text-white/85">Ciao, sono Bira</h3>
              <p className="text-[11px] text-white/50">
                {health?.remoto
                  ? 'Posso rispondere su cotte, vendite e produzione. In modalit\u00e0 cloud non vedo clienti, ricette, nomi materie prime.'
                  : 'Posso rispondere a domande sui tuoi dati: materie prime, cotte, vendite, clienti, avvisi. Tutto resta sul tuo PC.'}
              </p>
            </div>
            <div className="flex w-full flex-col gap-1">
              {(health?.remoto ? PROMPT_CLOUD : PROMPT_LOCALI).slice(0, 4).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => inviaMessaggio(p)}
                  disabled={!!conversazioneAttiva || (health ? !health.raggiungibile : false)}
                  className="rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5 text-left text-[11px] text-white/65 transition-colors hover:border-amber-400/30 hover:bg-amber-400/5 hover:text-amber-100/90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {messaggi.map((m) => (
              <MessaggioView key={m.id} msg={m} />
            ))}
          </div>
        )}
      </div>

      <div
        className="p-2.5"
        style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="flex items-end gap-1.5">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                inviaMessaggio()
              }
            }}
            rows={1}
            placeholder="Scrivi qui… (Invio per inviare)"
            className="min-h-[36px] max-h-[120px] flex-1 resize-none rounded-md border border-white/[0.06] bg-white/[0.03] px-2.5 py-2 text-xs text-white/85 placeholder:text-white/30 focus:border-amber-400/30 focus:outline-none"
            disabled={!!conversazioneAttiva}
          />
          {conversazioneAttiva ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={annulla}
              className="shrink-0 border-red-500/30 text-red-200 hover:bg-red-500/10"
            >
              <CircleStop className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => inviaMessaggio()}
              disabled={!input.trim() || (health ? !health.raggiungibile : false)}
              className="shrink-0"
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
