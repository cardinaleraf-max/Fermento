import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  Check,
  CircleStop,
  Hourglass,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  TriangleAlert,
  X
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAgricolo } from '@/components/agricolo/contesto'
import { TestoBira } from '@/components/TestoBira'
import { cn } from '@/lib/utils'

type RuoloMessaggio = 'user' | 'assistant'

type StrumentoUsato = {
  nome: string
  etichetta: string
  ok: boolean | null
  anteprima: string | null
}

type Messaggio = {
  id: string
  ruolo: RuoloMessaggio
  contenuto: string
  strumenti: StrumentoUsato[]
  errore?: string | null
  inCorso?: boolean
  /** Secondi di pausa chiesti dal servizio gratuito (null = nessuna pausa). */
  attesa?: number | null
}

type AiHealth = Awaited<ReturnType<typeof window.api.ai.health>>

const ESEMPI = [
  'Riassumimi la situazione del birrificio',
  'Cosa mi scade nei prossimi due mesi?',
  'Quante cotte posso fare con quello che ho in magazzino?',
  'Chi deve ancora restituirmi dei fusti?'
]

const ESEMPI_AGRICOLI = [
  'Com’è andata l’ultima maltazione?',
  'Quali trattamenti ho fatto sui campi in questa stagione?'
]

function generaId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

/** «Ho consultato: …» con lo stato di ogni strumento (dettagli nel suggerimento). */
function StrumentiUsati({ strumenti }: { strumenti: StrumentoUsato[] }): React.JSX.Element {
  const unici = strumenti.filter(
    (s, i) => strumenti.findIndex((x) => x.etichetta === s.etichetta) === i
  )
  return (
    <div className="flex flex-wrap items-center gap-1 text-[10px] text-ink/45">
      <span>Ho consultato:</span>
      {unici.map((s, i) => (
        <span
          key={`${s.nome}-${i}`}
          title={s.anteprima ?? undefined}
          className="inline-flex items-center gap-1 rounded-full border border-ink/[0.08] bg-ink/[0.03] px-1.5 py-0.5 text-ink/60"
        >
          {s.ok === null ? (
            <Loader2 className="h-2.5 w-2.5 animate-spin" />
          ) : s.ok ? (
            <Check className="h-2.5 w-2.5 text-emerald-400/80" />
          ) : (
            <TriangleAlert className="h-2.5 w-2.5 text-amber-400/80" />
          )}
          {s.etichetta}
        </span>
      ))}
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
      <div className="w-full max-w-[95%] space-y-1.5">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-ink/30">
          <Sparkles className="h-3 w-3 text-amber-400/60" />
          <span>Bira</span>
        </div>

        {msg.strumenti.length > 0 && <StrumentiUsati strumenti={msg.strumenti} />}

        {msg.contenuto && (
          <div className="rounded-2xl rounded-bl-sm bg-ink/[0.04] px-3.5 py-2 text-sm leading-relaxed text-ink/85">
            <TestoBira testo={msg.contenuto} />
          </div>
        )}

        {msg.inCorso && !msg.contenuto && (
          <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-ink/[0.04] px-3.5 py-2 text-sm text-ink/50">
            {msg.attesa ? (
              <>
                <Hourglass className="h-3.5 w-3.5 shrink-0" />
                <span>Il servizio gratuito chiede una breve pausa… (circa {msg.attesa} s)</span>
              </>
            ) : (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Sto controllando…</span>
              </>
            )}
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

/** Nella versione demo Bira è spento: al posto della chat un breve messaggio. */
function BiraDemo({ onClose }: BiraChatProps): React.JSX.Element {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--floating)]">
      <div
        className="flex items-center justify-between gap-2 px-3.5 py-2.5"
        style={{ borderBottom: '1px solid var(--line)' }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-400/15">
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
          </div>
          <div className="truncate text-sm font-semibold text-ink/90">Bira</div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-ink/40 transition-colors hover:bg-ink/[0.05] hover:text-ink/80"
            title="Chiudi"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="rounded-full bg-amber-400/10 p-2.5">
          <Sparkles className="h-5 w-5 text-amber-400/80" />
        </div>
        <div className="max-w-xs space-y-1">
          <h3 className="text-sm font-semibold text-ink/85">Bira, l&apos;assistente di Fermento</h3>
          <p className="text-[11px] text-ink/50">
            Nella versione completa risponde alle domande sui tuoi dati: scorte, cotte, vendite,
            clienti e avvisi. Nella demo non è disponibile.
          </p>
        </div>
      </div>
    </div>
  )
}

export function BiraChat({ onClose }: BiraChatProps): React.JSX.Element {
  const agricolo = useAgricolo()
  const [messaggi, setMessaggi] = useState<Messaggio[]>([])
  const [input, setInput] = useState('')
  const [health, setHealth] = useState<AiHealth | null>(null)
  const [healthLoading, setHealthLoading] = useState(true)
  const [conversazioneAttiva, setConversazioneAttiva] = useState<string | null>(null)

  const messaggiRef = useRef<Messaggio[]>([])
  useEffect(() => {
    messaggiRef.current = messaggi
  }, [messaggi])

  const containerRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)

  const verificaHealth = useCallback(async (forza = false) => {
    setHealthLoading(true)
    try {
      setHealth(await window.api.ai.health({ forza }))
    } catch {
      setHealth({
        stato: 'non_raggiungibile',
        modello: null,
        messaggio: 'Non riesco a verificare Bira in questo momento.'
      })
    } finally {
      setHealthLoading(false)
    }
  }, [])

  useEffect(() => {
    if (__DEMO_MODE__) return
    let attivo = true
    window.api.ai
      .health()
      .then((h) => attivo && setHealth(h))
      .catch(
        () =>
          attivo &&
          setHealth({
            stato: 'non_raggiungibile',
            modello: null,
            messaggio: 'Non riesco a verificare Bira in questo momento.'
          })
      )
      .finally(() => attivo && setHealthLoading(false))
    return () => {
      attivo = false
    }
  }, [])

  useEffect(() => {
    const off = window.api.ai.onEvento(({ conversazioneId, evento }) => {
      setMessaggi((prev) => {
        const idx = prev.findIndex((m) => m.id === conversazioneId && m.ruolo === 'assistant')
        if (idx === -1) return prev
        const next = [...prev]
        const cur = { ...next[idx] }
        switch (evento.tipo) {
          case 'tool_call':
            cur.attesa = null
            cur.strumenti = [
              ...cur.strumenti,
              { nome: evento.nome, etichetta: evento.etichetta, ok: null, anteprima: null }
            ]
            break
          case 'tool_risultato': {
            const s = [...cur.strumenti]
            for (let i = s.length - 1; i >= 0; i--) {
              if (s[i].nome === evento.nome && s[i].ok === null) {
                s[i] = { ...s[i], ok: evento.ok, anteprima: evento.anteprima }
                break
              }
            }
            cur.strumenti = s
            break
          }
          case 'attesa':
            cur.attesa = evento.secondi
            break
          case 'risposta':
            cur.attesa = null
            cur.contenuto = evento.testo
            break
          case 'errore':
            cur.attesa = null
            cur.errore = evento.messaggio
            break
          case 'fine':
            cur.inCorso = false
            cur.attesa = null
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
        strumenti: []
      }
      const conversazioneId = generaId()
      const nuovoAssistant: Messaggio = {
        id: conversazioneId,
        ruolo: 'assistant',
        contenuto: '',
        strumenti: [],
        inCorso: true
      }
      const cronologiaPrec = messaggiRef.current
        .filter((m) => !m.inCorso && m.contenuto)
        .map((m) => ({ ruolo: m.ruolo, contenuto: m.contenuto }))
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
    if (healthLoading) return { testo: 'Verifica…', colore: 'text-ink/40' }
    switch (health?.stato) {
      case 'pronto':
        return { testo: 'Pronto', colore: 'text-emerald-400/80' }
      case 'da_configurare':
        return { testo: 'Da attivare', colore: 'text-amber-400/70' }
      case 'chiave_non_valida':
        return { testo: 'Chiave non valida', colore: 'text-red-400/80' }
      case 'nessun_modello':
        return { testo: 'Non disponibile', colore: 'text-red-400/80' }
      case 'non_raggiungibile':
        return { testo: 'Non raggiungibile', colore: 'text-red-400/80' }
      default:
        return { testo: '', colore: 'text-ink/40' }
    }
  }, [health, healthLoading])

  /** Senza chiave (o con chiave sbagliata) non ha senso inviare domande. */
  const bloccato = health?.stato === 'da_configurare' || health?.stato === 'chiave_non_valida'
  const problema = health && health.stato !== 'pronto' && health.stato !== 'demo' ? health : null
  const esempi = agricolo.attivo ? [...ESEMPI.slice(0, 3), ...ESEMPI_AGRICOLI] : ESEMPI

  if (__DEMO_MODE__) return <BiraDemo onClose={onClose} />

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[var(--floating)]">
      <div
        className="flex items-center justify-between gap-2 px-3.5 py-2.5"
        style={{ borderBottom: '1px solid var(--line)' }}
      >
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-400/15">
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-ink/90">Bira</div>
            <div className={cn('truncate text-[10px]', statoHeader.colore)}>
              {statoHeader.testo}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={nuovaConversazione}
            disabled={messaggi.length === 0}
            className="rounded-md p-1.5 text-ink/40 transition-colors hover:bg-ink/[0.05] hover:text-ink/80 disabled:cursor-not-allowed disabled:opacity-30"
            title="Nuova chat"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-ink/40 transition-colors hover:bg-ink/[0.05] hover:text-ink/80"
              title="Chiudi"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {problema && !healthLoading && (
        <div className="flex items-start gap-1.5 border-b border-amber-500/20 bg-amber-500/[0.08] px-3 py-2 text-[11px] text-amber-100/85">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="font-medium">
              {problema.stato === 'da_configurare'
                ? 'Bira non è ancora attivo'
                : 'Bira ha un problema'}
            </div>
            <div className="mt-0.5 text-amber-100/70">{problema.messaggio}</div>
          </div>
          {problema.stato !== 'da_configurare' && (
            <button
              type="button"
              onClick={() => void verificaHealth(true)}
              className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-amber-100/80 hover:bg-amber-400/10"
              title="Riprova"
            >
              <RefreshCw className="h-3 w-3" /> Riprova
            </button>
          )}
        </div>
      )}

      <div ref={containerRef} className="flex-1 overflow-y-auto px-3.5 py-3">
        {messaggi.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="rounded-full bg-amber-400/10 p-2.5">
              <Sparkles className="h-5 w-5 text-amber-400/80" />
            </div>
            <div className="max-w-xs space-y-1">
              <h3 className="text-sm font-semibold text-ink/85">Ciao, sono Bira</h3>
              <p className="text-[11px] text-ink/50">
                Rispondo sui tuoi dati: magazzino, ricette, cotte, vendite e avvisi
                {agricolo.attivo ? ', e tutta la filiera agricola' : ''}. Chiedimi anche come si fa
                qualcosa in Fermento.
              </p>
            </div>
            <div className="flex w-full flex-col gap-1">
              {esempi.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => inviaMessaggio(p)}
                  disabled={!!conversazioneAttiva || bloccato}
                  className="rounded-md border border-ink/[0.06] bg-ink/[0.02] px-2.5 py-1.5 text-left text-[11px] text-ink/65 transition-colors hover:border-amber-400/30 hover:bg-amber-400/5 hover:text-amber-100/90 disabled:cursor-not-allowed disabled:opacity-40"
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

      <div className="p-2.5" style={{ borderTop: '1px solid var(--line)' }}>
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
            className="min-h-[36px] max-h-[120px] flex-1 resize-none rounded-md border border-ink/[0.06] bg-ink/[0.03] px-2.5 py-2 text-xs text-ink/85 placeholder:text-ink/30 focus:border-amber-400/30 focus:outline-none"
            disabled={!!conversazioneAttiva}
          />
          {conversazioneAttiva ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={annulla}
              className="shrink-0 border-red-500/30 text-red-200 hover:bg-red-500/10"
              title="Ferma"
            >
              <CircleStop className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => inviaMessaggio()}
              disabled={!input.trim() || bloccato}
              className="shrink-0"
              title="Invia"
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <div className="mt-1.5 flex items-center gap-1 text-[10px] text-ink/35">
          <Lock className="h-2.5 w-2.5 shrink-0" />
          <span>I dati dei tuoi clienti restano sul PC: Bira li vede solo come codici.</span>
        </div>
      </div>
    </div>
  )
}
