import { CalendarRange } from 'lucide-react'
import { cls } from './common'
import { useAgricolo } from './contesto'

/** Valore speciale per "tutte le stagioni". */
export const TUTTE_LE_STAGIONI = ''

/**
 * Filtro stagione comune a tutte le liste del modulo. Il valore '' significa
 * "tutte le stagioni"; il default lo sceglie chi lo usa (di solito la corrente).
 */
export function FiltroStagione({
  valore,
  onChange
}: {
  valore: string
  onChange: (stagione: string) => void
}): React.JSX.Element {
  const { stagioni, stagione_corrente } = useAgricolo()
  const elenco = stagioni.length > 0 ? stagioni : stagione_corrente ? [stagione_corrente] : []
  return (
    <label className="flex items-center gap-2 text-sm text-muted-foreground">
      <CalendarRange className="h-4 w-4" aria-hidden />
      <span className="sr-only">Stagione</span>
      <select className={`${cls.select} w-auto`} value={valore} onChange={(e) => onChange(e.target.value)}>
        {elenco.map((s) => (
          <option key={s} value={s}>
            Stagione {s}
            {s === stagione_corrente ? ' (corrente)' : ''}
          </option>
        ))}
        <option value={TUTTE_LE_STAGIONI}>Tutte le stagioni</option>
      </select>
    </label>
  )
}
