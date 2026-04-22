import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, Sparkles, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Sezione } from './Layout'

const SEZIONI_VALIDE = new Set<Sezione>([
  'dashboard',
  'magazzino-mp',
  'magazzino-conf',
  'produzione',
  'prodotto-finito',
  'clienti',
  'vendite',
  'report',
  'avvisi',
  'impostazioni'
])

const SEZIONE_LABEL: Record<Sezione, string> = {
  dashboard: 'Dashboard',
  'magazzino-mp': 'Magazzino materie prime',
  'magazzino-conf': 'Magazzino confezionamento',
  produzione: 'Produzione',
  'prodotto-finito': 'Prodotto finito',
  clienti: 'Clienti',
  vendite: 'Vendite',
  report: 'Report',
  avvisi: 'Avvisi',
  impostazioni: 'Impostazioni'
}

type Proposta = {
  id: number
  sezione: Sezione
  motivo: string | null
}

type Props = {
  onNaviga: (sezione: Sezione) => void
}

export function ProposteNavigazione({ onNaviga }: Props): React.JSX.Element | null {
  const [proposta, setProposta] = useState<Proposta | null>(null)

  useEffect(() => {
    let next = 1
    const off = window.api.ai.onNaviga(({ sezione, motivo }) => {
      if (!sezione || !SEZIONI_VALIDE.has(sezione as Sezione)) return
      setProposta({ id: next++, sezione: sezione as Sezione, motivo })
    })
    return off
  }, [])

  useEffect(() => {
    if (!proposta) return
    // Auto-chiusura dopo 12s se l'utente non agisce.
    const t = setTimeout(() => setProposta(null), 12_000)
    return () => clearTimeout(t)
  }, [proposta])

  const accetta = useCallback(() => {
    if (!proposta) return
    onNaviga(proposta.sezione)
    setProposta(null)
  }, [onNaviga, proposta])

  const rifiuta = useCallback(() => setProposta(null), [])

  if (!proposta) return null

  const label = SEZIONE_LABEL[proposta.sezione] ?? proposta.sezione

  return (
    <div
      className="fixed bottom-4 right-4 z-[60] w-[min(340px,calc(100vw-2rem))] rounded-xl p-3 shadow-2xl"
      style={{
        background: '#0C0C14',
        border: '1px solid rgba(232,160,32,0.3)',
        boxShadow: '0 20px 50px -10px rgba(0,0,0,0.65), 0 0 0 1px rgba(232,160,32,0.1)',
        animation: 'propIn 0.2s ease-out'
      }}
      role="dialog"
      aria-live="polite"
    >
      <div className="mb-2 flex items-start gap-2">
        <div
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
          style={{
            background:
              'radial-gradient(circle at 30% 30%, rgba(232,160,32,0.55), rgba(232,160,32,0.15) 70%)'
          }}
        >
          <Sparkles className="h-3.5 w-3.5 text-amber-100" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-[0.15em] text-amber-300/75">
            Bira suggerisce
          </div>
          <div className="mt-0.5 text-sm font-medium text-white/90">Aprire: {label}</div>
          {proposta.motivo && (
            <div className="mt-0.5 text-xs text-white/55">{proposta.motivo}</div>
          )}
        </div>
        <button
          type="button"
          onClick={rifiuta}
          className="shrink-0 rounded p-1 text-white/35 hover:bg-white/[0.05] hover:text-white/70"
          aria-label="Chiudi suggerimento"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex items-center justify-end gap-1.5">
        <Button type="button" size="sm" variant="ghost" onClick={rifiuta} className="h-7 px-2 text-xs text-white/60">
          No grazie
        </Button>
        <Button type="button" size="sm" onClick={accetta} className="h-7 px-3 text-xs">
          Apri
          <ArrowRight className="ml-1 h-3 w-3" />
        </Button>
      </div>
      <style>{`
        @keyframes propIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  )
}
