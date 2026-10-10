import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { DEMO_DURATA_SESSIONE_MINUTI } from '../../../shared/demo'

// La sessione parte con l'avvio dell'app; la chiusura vera la gestisce il processo principale.
const avvio = Date.now()

function minutiRimasti(): number {
  return Math.max(0, Math.ceil(DEMO_DURATA_SESSIONE_MINUTI - (Date.now() - avvio) / 60000))
}

/** Etichetta "Versione demo" con i minuti rimasti della sessione. Solo nella build demo. */
export function DemoBadge({ className }: { className?: string }): React.JSX.Element {
  const [minuti, setMinuti] = useState(minutiRimasti)

  useEffect(() => {
    const timer = setInterval(() => setMinuti(minutiRimasti()), 15000)
    return () => clearInterval(timer)
  }, [])

  return (
    <span
      title="I dati di esempio si ripristinano a ogni avvio. Versione completa su fermento-software.it"
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-400',
        className
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
      Versione demo · {minuti} min
    </span>
  )
}
