import { useCallback, useState } from 'react'
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Boxes,
  ChevronDown,
  Cloud,
  FlaskConical,
  Loader2,
  Package,
  PercentCircle,
  RefreshCw,
  ShoppingCart,
  Sparkles,
  Users,
  Wrench
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Raccomandazione = Extract<
  Awaited<ReturnType<typeof window.api.ai.avvisiIntelligenti>>,
  { ok: true }
>['raccomandazioni'][number]

type RaccOk = Extract<
  Awaited<ReturnType<typeof window.api.ai.avvisiIntelligenti>>,
  { ok: true }
>

const PRIORITA_META: Record<
  Raccomandazione['priorita'],
  { label: string; classe: string; ordine: number; iconClasse: string; Icon: typeof AlertTriangle }
> = {
  critica: {
    label: 'CRITICA',
    classe: 'border-red-500/40 bg-red-500/10 text-red-200',
    ordine: 0,
    iconClasse: 'text-red-400',
    Icon: AlertTriangle
  },
  alta: {
    label: 'ALTA',
    classe: 'border-orange-500/40 bg-orange-500/10 text-orange-200',
    ordine: 1,
    iconClasse: 'text-orange-400',
    Icon: ArrowUp
  },
  media: {
    label: 'MEDIA',
    classe: 'border-amber-500/40 bg-amber-500/10 text-amber-200',
    ordine: 2,
    iconClasse: 'text-amber-400',
    Icon: ArrowDown
  },
  bassa: {
    label: 'BASSA',
    classe: 'border-sky-500/30 bg-sky-500/10 text-sky-200',
    ordine: 3,
    iconClasse: 'text-sky-400',
    Icon: ArrowDown
  }
}

const AZIONE_META: Record<Raccomandazione['azioni'][number]['tipo'], { label: string; Icon: typeof Wrench }> = {
  riordina: { label: 'Riordina', Icon: Package },
  produci: { label: 'Produci', Icon: FlaskConical },
  promo: { label: 'Promo', Icon: PercentCircle },
  sconta: { label: 'Sconto', Icon: PercentCircle },
  vendi: { label: 'Vendi', Icon: ShoppingCart },
  revisiona: { label: 'Revisiona', Icon: Wrench },
  altro: { label: 'Azione', Icon: Sparkles }
}

const TIPO_META: Record<Raccomandazione['riferimenti'][number]['tipo'], { label: string; Icon: typeof Boxes }> = {
  mp: { label: 'MP', Icon: Package },
  birra: { label: 'Birra', Icon: FlaskConical },
  conf: { label: 'Conf.', Icon: Boxes },
  cliente: { label: 'Cliente', Icon: Users }
}

function formattaData(s: string): string {
  try {
    const d = new Date(s)
    if (Number.isNaN(d.getTime())) return s
    return d.toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return s
  }
}

type Props = {
  onNavigaA?: (sezione: string) => void
}

export function ConsigliIntelligenti({ onNavigaA }: Props): React.JSX.Element {
  const [stato, setStato] = useState<RaccOk | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [caricamento, setCaricamento] = useState(false)
  const [aperta, setAperta] = useState<number | null>(null)

  const analizza = useCallback(async () => {
    setCaricamento(true)
    setErrore(null)
    try {
      const r = await window.api.ai.avvisiIntelligenti()
      if (r.ok) {
        setStato(r)
      } else {
        setErrore(r.errore)
        setStato(null)
      }
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore sconosciuto')
      setStato(null)
    } finally {
      setCaricamento(false)
    }
  }, [])

  const nav = useCallback(
    (sezione: string) => {
      if (onNavigaA) onNavigaA(sezione)
    },
    [onNavigaA]
  )

  const raccomandazioni = stato?.raccomandazioni ?? []

  return (
    <section
      className="rounded-lg border"
      style={{
        background:
          'linear-gradient(180deg, rgba(232,160,32,0.05) 0%, rgba(232,160,32,0.01) 100%)',
        borderColor: 'rgba(232,160,32,0.2)'
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full"
            style={{
              background:
                'radial-gradient(circle at 30% 30%, rgba(232,160,32,0.55), rgba(232,160,32,0.15) 70%)'
            }}
          >
            <Sparkles className="h-4 w-4 text-amber-100" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-amber-100">Consigli di Bira</h2>
            <p className="text-[11px] text-white/45">
              Analisi AI: priorita&apos;, raggruppamenti e azioni suggerite
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {stato && (
            <div className="flex items-center gap-1.5 text-[10px] text-white/40">
              {stato.remoto && (
                <span
                  title="Generato in cloud (Groq). Nomi di MP, ricette e clienti non vengono inviati."
                  className="inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-amber-200/90"
                >
                  <Cloud className="h-2.5 w-2.5" />
                  Cloud
                </span>
              )}
              <span>{formattaData(stato.generato_il)}</span>
              <span className="text-white/25">·</span>
              <span>{stato.segnali_analizzati} segnali</span>
            </div>
          )}
          <Button type="button" variant="outline" size="sm" onClick={() => void analizza()} disabled={caricamento}>
            {caricamento ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Analisi in corso…
              </>
            ) : (
              <>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                {stato ? 'Rianalizza' : 'Analizza con Bira'}
              </>
            )}
          </Button>
        </div>
      </div>

      {errore && (
        <div className="mx-4 mb-3 flex items-start gap-1.5 rounded-md border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            <div className="font-medium">Impossibile generare i consigli</div>
            <div className="mt-0.5 text-red-200/75">{errore}</div>
          </div>
        </div>
      )}

      {!stato && !errore && !caricamento && (
        <div className="px-4 pb-4 pt-1 text-xs text-white/45">
          Clicca <span className="font-medium text-white/70">Analizza con Bira</span> per ottenere raccomandazioni
          basate sullo stato attuale del birrificio.
        </div>
      )}

      {caricamento && !stato && (
        <div className="flex items-center gap-2 px-4 pb-4 pt-1 text-xs text-white/55">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
          Bira sta analizzando lo stato del birrificio…
        </div>
      )}

      {stato && raccomandazioni.length === 0 && (
        <div className="px-4 pb-4 pt-1 text-xs text-white/55">
          Nessuna raccomandazione: al momento non ci sono segnali rilevanti da segnalare.
        </div>
      )}

      {raccomandazioni.length > 0 && (
        <ul className="space-y-2 px-4 pb-4">
          {raccomandazioni.map((r, idx) => {
            const meta = PRIORITA_META[r.priorita]
            const aperto = aperta === idx
            const MetaIcon = meta.Icon
            return (
              <li
                key={idx}
                className="overflow-hidden rounded-md border bg-white/[0.02]"
                style={{ borderColor: 'rgba(255,255,255,0.08)' }}
              >
                <button
                  type="button"
                  onClick={() => setAperta(aperto ? null : idx)}
                  className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-white/[0.03]"
                >
                  <div
                    className={cn(
                      'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border',
                      meta.classe
                    )}
                  >
                    <MetaIcon className={cn('h-3.5 w-3.5', meta.iconClasse)} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={cn(
                          'rounded-full border px-1.5 py-0.5 text-[9px] font-semibold tracking-wider',
                          meta.classe
                        )}
                      >
                        {meta.label}
                      </span>
                      {r.riferimenti.slice(0, 4).map((rf, i) => {
                        const t = TIPO_META[rf.tipo]
                        return (
                          <span
                            key={`${rf.tipo}-${rf.id}-${i}`}
                            className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[10px] text-white/65"
                          >
                            <t.Icon className="h-2.5 w-2.5" />
                            <span className="max-w-[140px] truncate">{rf.nome}</span>
                          </span>
                        )
                      })}
                      {r.riferimenti.length > 4 && (
                        <span className="text-[10px] text-white/35">+{r.riferimenti.length - 4}</span>
                      )}
                    </div>
                    <div className="mt-1 text-sm font-medium text-white/90">{r.titolo}</div>
                  </div>
                  <ChevronDown
                    className={cn(
                      'mt-1 h-4 w-4 shrink-0 text-white/40 transition-transform',
                      aperto && 'rotate-180'
                    )}
                  />
                </button>
                {aperto && (
                  <div className="border-t border-white/[0.06] bg-white/[0.015] px-3 py-3 text-xs">
                    {r.descrizione && (
                      <p className="mb-3 whitespace-pre-wrap text-white/75">{r.descrizione}</p>
                    )}
                    {r.azioni.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="text-[10px] uppercase tracking-wider text-white/35">
                          Azioni suggerite
                        </div>
                        {r.azioni.map((az, i) => {
                          const am = AZIONE_META[az.tipo]
                          const sezione = defaultSezionePerAzione(az.tipo, r.riferimenti)
                          return (
                            <div
                              key={i}
                              className="flex items-start gap-2 rounded-md border border-white/[0.06] bg-white/[0.02] px-2.5 py-1.5"
                            >
                              <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-400/10">
                                <am.Icon className="h-3 w-3 text-amber-300" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-[10px] uppercase tracking-wider text-amber-200/70">
                                  {am.label}
                                </div>
                                <div className="text-white/80">{az.testo}</div>
                              </div>
                              {sezione && onNavigaA && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => nav(sezione)}
                                  className="h-7 shrink-0 px-2 text-[11px] text-white/60 hover:text-amber-200"
                                >
                                  Vai
                                </Button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                    {r.segnali_ids.length > 0 && (
                      <div className="mt-3 text-[10px] text-white/35">
                        Basato sugli avvisi #{r.segnali_ids.join(', #')}
                      </div>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function defaultSezionePerAzione(
  tipo: Raccomandazione['azioni'][number]['tipo'],
  riferimenti: Raccomandazione['riferimenti']
): string | null {
  switch (tipo) {
    case 'riordina': {
      if (riferimenti.some((r) => r.tipo === 'mp')) return 'magazzino-mp'
      if (riferimenti.some((r) => r.tipo === 'conf')) return 'magazzino-conf'
      return 'magazzino-mp'
    }
    case 'produci':
      return 'produzione'
    case 'promo':
    case 'sconta':
    case 'vendi':
      return 'vendite'
    case 'revisiona':
      return 'impostazioni'
    default:
      return null
  }
}
