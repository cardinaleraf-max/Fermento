import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { ConsigliIntelligenti } from '@/components/ConsigliIntelligenti'

type AvvisoRiga = Awaited<ReturnType<typeof window.api.avvisi.lista>>[number]

type FiltroTipo = 'tutti' | string

const TIPI_FILTRO: { value: FiltroTipo; label: string }[] = [
  { value: 'tutti', label: 'Tutti' },
  { value: 'scorta_bassa', label: 'Scorta bassa' },
  { value: 'scadenza_vicina', label: 'Scadenza vicina (MP)' },
  { value: 'scadenza_prodotto_finito', label: 'Scadenza prodotto finito' },
  { value: 'cliente_inattivo', label: 'Cliente inattivo' },
  { value: 'cotta_non_producibile', label: 'Cotta non producibile' }
]

function labelTipo(tipo: string): string {
  const f = TIPI_FILTRO.find((t) => t.value === tipo)
  return f ? f.label : tipo
}

function badgePrioritaClass(p: string): string {
  switch (p) {
    case 'alta':
      return 'border-red-500/25 bg-red-500/15 text-red-400'
    case 'media':
      return 'border-orange-500/25 bg-orange-500/15 text-orange-400'
    case 'bassa':
    default:
      return 'border-amber-500/25 bg-amber-500/15 text-amber-400'
  }
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

export default function Avvisi(): React.JSX.Element {
  const [righe, setRighe] = useState<AvvisoRiga[]>([])
  const [filtroTipo, setFiltroTipo] = useState<FiltroTipo>('tutti')
  const [caricamento, setCaricamento] = useState(true)
  const [rigeneraInCorso, setRigeneraInCorso] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)

  const carica = useCallback(async () => {
    setCaricamento(true)
    setErrore(null)
    try {
      const lista = await window.api.avvisi.lista()
      setRighe(lista)
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Impossibile caricare gli avvisi')
      setRighe([])
    } finally {
      setCaricamento(false)
    }
  }, [])

  useEffect(() => {
    void carica()
  }, [carica])

  const filtrate = useMemo(() => {
    if (filtroTipo === 'tutti') return righe
    return righe.filter((r) => r.tipo === filtroTipo)
  }, [righe, filtroTipo])

  const rigenera = async () => {
    setRigeneraInCorso(true)
    setErrore(null)
    try {
      await window.api.avvisi.genera()
      await carica()
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Rigenerazione avvisi fallita')
    } finally {
      setRigeneraInCorso(false)
    }
  }

  const segnaLetto = async (id: number) => {
    try {
      await window.api.avvisi.segnaLetto(id)
      await carica()
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Operazione non riuscita')
    }
  }

  const segnaRisolto = async (id: number) => {
    try {
      await window.api.avvisi.segnaRisolto(id)
      await carica()
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Operazione non riuscita')
    }
  }

  return (
    <div className="space-y-6">
      <ConsigliIntelligenti />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <Label htmlFor="filtro-avvisi-tipo">Tipo</Label>
          <select
            id="filtro-avvisi-tipo"
            className="flex h-9 w-full max-w-xs rounded-md border border-input px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value as FiltroTipo)}
          >
            {TIPI_FILTRO.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <Button type="button" variant="outline" disabled={rigeneraInCorso} onClick={() => void rigenera()}>
          <RefreshCw className={cn('mr-2 h-4 w-4', rigeneraInCorso && 'animate-spin')} />
          Rigenera avvisi
        </Button>
      </div>

      {errore && (
        <p className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400" role="alert">
          {errore}
        </p>
      )}

      <div className="overflow-x-auto rounded-md border border-border bg-card">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/40 text-left text-muted-foreground">
              <th className="p-3 font-medium">Priorità</th>
              <th className="p-3 font-medium">Tipo</th>
              <th className="p-3 font-medium">Messaggio</th>
              <th className="p-3 font-medium">Data</th>
              <th className="p-3 font-medium">Letto</th>
              <th className="p-3 font-medium">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {caricamento && (
              <tr>
                <td colSpan={6} className="p-6 text-muted-foreground">
                  Caricamento…
                </td>
              </tr>
            )}
            {!caricamento && filtrate.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-muted-foreground">
                  Nessun avviso
                </td>
              </tr>
            )}
            {!caricamento &&
              filtrate.map((a) => (
                <tr key={a.id} className="border-b border-border/50 last:border-0">
                  <td className="p-3 align-top">
                    <Badge className={cn('font-medium', badgePrioritaClass(a.priorita))}>
                      {a.priorita}
                    </Badge>
                  </td>
                  <td className="p-3 align-top text-foreground/80">{labelTipo(a.tipo)}</td>
                  <td className="p-3 align-top text-foreground/80">{a.messaggio}</td>
                  <td className="p-3 align-top whitespace-nowrap text-muted-foreground">
                    {formattaData(a.data_generazione)}
                  </td>
                  <td className="p-3 align-top text-muted-foreground">{a.letto ? 'Sì' : 'No'}</td>
                  <td className="p-3 align-top">
                    <div className="flex flex-wrap gap-2">
                      {a.letto ? null : (
                        <Button type="button" variant="default" size="sm" onClick={() => void segnaLetto(a.id)}>
                          Segna letto
                        </Button>
                      )}
                      <Button type="button" variant="outline" size="sm" onClick={() => void segnaRisolto(a.id)}>
                        Risolto
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
