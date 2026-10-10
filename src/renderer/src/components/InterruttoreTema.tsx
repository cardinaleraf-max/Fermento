import { Moon, Sun } from 'lucide-react'
import { cn } from '@/lib/utils'
import { impostaTema, useTema, type Tema } from '@/lib/tema'

const OPZIONI: { valore: Tema; nome: string; icona: typeof Sun }[] = [
  { valore: 'scuro', nome: 'Tema scuro', icona: Moon },
  { valore: 'chiaro', nome: 'Tema chiaro', icona: Sun }
]

/** Scelta del tema dello schermo (luna/sole): cambia subito e resta salvata su questo computer. */
export function InterruttoreTema({ className }: { className?: string }): React.JSX.Element {
  const tema = useTema()
  return (
    <div
      role="group"
      aria-label="Tema dello schermo"
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 rounded-full border border-ink/[0.08] bg-ink/[0.03] p-0.5',
        className
      )}
    >
      {OPZIONI.map(({ valore, nome, icona: Icona }) => {
        const attivo = tema === valore
        return (
          <button
            key={valore}
            type="button"
            aria-label={nome}
            aria-pressed={attivo}
            title={attivo ? `${nome} (attivo)` : `Passa al ${nome.toLowerCase()}`}
            onClick={() => impostaTema(valore)}
            className={cn(
              'inline-flex h-6 w-7 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
              attivo ? 'bg-amber-500/15 text-amber-400' : 'text-ink/45 hover:text-ink/80'
            )}
          >
            <Icona className="h-3.5 w-3.5" />
          </button>
        )
      })}
    </div>
  )
}
