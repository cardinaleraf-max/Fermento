import { useState } from 'react'
import {
  Beer,
  ChevronDown,
  ChevronRight,
  Flame,
  Layers,
  MapPin,
  Microscope,
  Package,
  PackageCheck,
  ShoppingCart,
  Sprout,
  Tractor,
  Wheat,
  type LucideIcon
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { ETICHETTE_NODO, type NodoTraccia, type TipoNodo } from '@/lib/agricolo'

const ICONE: Record<TipoNodo, LucideIcon> = {
  cotta: Beer,
  lotto: Package,
  maltazione: Flame,
  calibratura: Microscope,
  raccolta: Wheat,
  semina: Sprout,
  campo: MapPin,
  operazione: Tractor,
  imballo: PackageCheck,
  vendita: ShoppingCart,
  gruppo: Layers
}

const COLORI: Record<TipoNodo, string> = {
  cotta: 'text-amber-400',
  lotto: 'text-sky-400',
  maltazione: 'text-orange-400',
  calibratura: 'text-violet-300',
  raccolta: 'text-yellow-300',
  semina: 'text-emerald-400',
  campo: 'text-emerald-300',
  operazione: 'text-lime-300',
  imballo: 'text-cyan-300',
  vendita: 'text-pink-300',
  gruppo: 'text-muted-foreground'
}

/** Quanti dettagli mostrare prima di "mostra tutti" (le maltazioni ne hanno molti). */
const DETTAGLI_VISIBILI = 8

function Nodo({
  nodo,
  chiusi,
  commuta
}: {
  nodo: NodoTraccia
  chiusi: Set<string>
  commuta: (chiave: string) => void
}): React.JSX.Element {
  const [tuttiDettagli, setTuttiDettagli] = useState(false)
  const aperto = !chiusi.has(nodo.chiave)
  const Icona = ICONE[nodo.tipo]
  const haContenuto = nodo.figli.length > 0 || nodo.dettagli.length > 0
  const dettagli = tuttiDettagli ? nodo.dettagli : nodo.dettagli.slice(0, DETTAGLI_VISIBILI)
  return (
    <li>
      <div className={cn('rounded-md border border-border bg-card', nodo.tipo === 'gruppo' && 'border-dashed bg-transparent')}>
        <button
          type="button"
          className="flex w-full items-start gap-2 px-3 py-2 text-left"
          onClick={() => haContenuto && commuta(nodo.chiave)}
          aria-expanded={aperto}
        >
          <span className="mt-0.5 w-4 shrink-0 text-muted-foreground">
            {haContenuto ? aperto ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" /> : null}
          </span>
          <Icona className={cn('mt-0.5 h-4 w-4 shrink-0', COLORI[nodo.tipo])} aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-foreground">{nodo.titolo}</span>
            {nodo.sottotitolo && <span className="block text-xs text-muted-foreground">{nodo.sottotitolo}</span>}
          </span>
          {nodo.tipo !== 'gruppo' && (
            <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">{ETICHETTE_NODO[nodo.tipo]}</span>
          )}
        </button>
        {aperto && nodo.dettagli.length > 0 && (
          <div className="border-t border-border/60 px-3 py-2 pl-12">
            <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2 xl:grid-cols-3">
              {dettagli.map((d, i) => (
                <div key={i} className="flex min-w-0 gap-1.5">
                  <dt className="shrink-0 text-muted-foreground">{d.etichetta}:</dt>
                  <dd className={cn('min-w-0 break-words text-foreground/90', d.etichetta === 'Attenzione' && 'text-amber-400')}>
                    {d.valore}
                  </dd>
                </div>
              ))}
            </dl>
            {nodo.dettagli.length > DETTAGLI_VISIBILI && (
              <button
                type="button"
                className="mt-1 text-xs text-amber-400 hover:underline"
                onClick={() => setTuttiDettagli((v) => !v)}
              >
                {tuttiDettagli ? 'Mostra meno' : `Mostra tutti i dati (${nodo.dettagli.length})`}
              </button>
            )}
          </div>
        )}
      </div>
      {aperto && nodo.figli.length > 0 && (
        <ul className="ml-5 mt-2 space-y-2 border-l border-border pl-4">
          {nodo.figli.map((f) => (
            <Nodo key={f.chiave} nodo={f} chiusi={chiusi} commuta={commuta} />
          ))}
        </ul>
      )}
    </li>
  )
}

export function tutteLeChiavi(nodi: NodoTraccia[], out: string[] = []): string[] {
  for (const n of nodi) {
    out.push(n.chiave)
    tutteLeChiavi(n.figli, out)
  }
  return out
}

/** Albero di tracciabilità espandibile. `chiusi` contiene i nodi compressi. */
export function AlberoTracciabilita({
  nodi,
  chiusi,
  onChiusiChange
}: {
  nodi: NodoTraccia[]
  chiusi: Set<string>
  onChiusiChange: (s: Set<string>) => void
}): React.JSX.Element {
  const commuta = (chiave: string): void => {
    const n = new Set(chiusi)
    if (n.has(chiave)) n.delete(chiave)
    else n.add(chiave)
    onChiusiChange(n)
  }
  return (
    <ul className="space-y-2">
      {nodi.map((n) => (
        <Nodo key={n.chiave} nodo={n} chiusi={chiusi} commuta={commuta} />
      ))}
    </ul>
  )
}
