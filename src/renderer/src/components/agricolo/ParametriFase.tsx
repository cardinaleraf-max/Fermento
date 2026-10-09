import { useState } from 'react'
import { ChevronDown, ChevronRight, History } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
  parseNumero,
  type GruppoParametri,
  type Parametro,
  type ValoreStorico,
  type ValoriParametri
} from '@/lib/agricolo'
import { InputNumero, cls } from './common'

/** Valori in modifica: testo così come digitato (virgola decimale ammessa). */
export type BozzaParametri = { valori: Record<number, string>; date: Record<number, string> }

export const bozzaVuota: BozzaParametri = { valori: {}, date: {} }

/** Valori salvati → bozza da mostrare (numeri con la virgola). */
export function bozzaDaSalvati(gruppi: GruppoParametri[], salvati: ValoriParametri): BozzaParametri {
  const tipi = new Map<number, Parametro['tipo']>()
  for (const g of gruppi) for (const p of g.parametri) tipi.set(p.id, p.tipo)
  const valori: Record<number, string> = {}
  for (const [k, v] of Object.entries(salvati.valori)) {
    valori[Number(k)] = tipi.get(Number(k)) === 'numero' ? v.replace('.', ',') : v
  }
  return { valori, date: { ...salvati.date } }
}

/**
 * Bozza → payload per il salvataggio. Include le cancellazioni (campi svuotati)
 * e converte i numeri. Ritorna un errore leggibile se un numero non è valido.
 */
export function payloadDaBozza(
  gruppi: GruppoParametri[],
  bozza: BozzaParametri,
  salvati: ValoriParametri = { valori: {}, date: {} }
): { ok: true; valori: Record<number, string>; date: Record<number, string> } | { ok: false; errore: string } {
  const valori: Record<number, string> = {}
  const date: Record<number, string> = {}
  for (const g of gruppi) {
    for (const p of g.parametri) {
      const grezzo = (bozza.valori[p.id] ?? '').trim()
      if (grezzo === '') {
        if (salvati.valori[p.id] !== undefined) valori[p.id] = ''
        continue
      }
      if (p.tipo === 'numero') {
        const n = parseNumero(grezzo)
        if (n === null || Number.isNaN(n)) return { ok: false, errore: `"${p.nome}": inserisci un numero (es. 22 oppure 22,5).` }
        valori[p.id] = String(n)
      } else {
        valori[p.id] = grezzo
      }
    }
    if (g.con_data) {
      const d = bozza.date[g.id] ?? ''
      if (d) date[g.id] = d
      else if (salvati.date[g.id]) date[g.id] = ''
    }
  }
  return { ok: true, valori, date }
}

/** true se la bozza è diversa da quanto salvato. */
export function bozzaModificata(gruppi: GruppoParametri[], bozza: BozzaParametri, salvati: ValoriParametri): boolean {
  const di = payloadDaBozza(gruppi, bozza, salvati)
  if (!di.ok) return true
  for (const [k, v] of Object.entries(di.valori)) if ((salvati.valori[Number(k)] ?? '') !== v) return true
  for (const [k, v] of Object.entries(di.date)) if ((salvati.date[Number(k)] ?? '') !== v) return true
  return false
}

function CampoScala({ valore, onChange }: { valore: string; onChange: (v: string) => void }): React.JSX.Element {
  return (
    <div className="flex flex-wrap gap-1" role="radiogroup">
      {Array.from({ length: 10 }, (_, i) => String(i + 1)).map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={valore === n}
          onClick={() => onChange(valore === n ? '' : n)}
          className={cn(
            'h-8 w-8 rounded-md border text-sm tabular-nums transition-colors',
            valore === n
              ? 'border-amber-500 bg-amber-500 font-semibold text-black'
              : 'border-border bg-secondary/40 text-muted-foreground hover:text-foreground'
          )}
        >
          {n}
        </button>
      ))}
    </div>
  )
}

function CampoSiNo({ valore, onChange }: { valore: string; onChange: (v: string) => void }): React.JSX.Element {
  const opzioni: Array<{ v: string; e: string }> = [
    { v: 'si', e: 'Sì' },
    { v: 'no', e: 'No' }
  ]
  return (
    <div className="inline-flex gap-1 rounded-md border border-border bg-secondary/40 p-1">
      {opzioni.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(valore === o.v ? '' : o.v)}
          className={cn(
            'rounded px-3 py-1 text-sm font-medium transition-colors',
            valore === o.v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {o.e}
        </button>
      ))}
    </div>
  )
}

function etichettaParametro(p: Parametro): string {
  return p.unita ? `${p.nome} (${p.unita})` : p.nome
}

/**
 * Parametri di una fase come sezioni comprimibili nell'ordine del processo.
 * Componente controllato: chi lo usa tiene la bozza e decide quando salvarla.
 */
export function ParametriFase({
  gruppi,
  bozza,
  onChange,
  storici = [],
  idBase = 'par'
}: {
  gruppi: GruppoParametri[]
  bozza: BozzaParametri
  onChange: (b: BozzaParametri) => void
  storici?: ValoreStorico[]
  idBase?: string
}): React.JSX.Element {
  const [chiusi, setChiusi] = useState<Set<number>>(new Set())

  const setValore = (id: number, v: string): void => onChange({ ...bozza, valori: { ...bozza.valori, [id]: v } })
  const setData = (gid: number, v: string): void => onChange({ ...bozza, date: { ...bozza.date, [gid]: v } })
  const toggle = (gid: number): void =>
    setChiusi((prev) => {
      const n = new Set(prev)
      if (n.has(gid)) n.delete(gid)
      else n.add(gid)
      return n
    })

  if (gruppi.length === 0 && storici.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nessun parametro configurato per questa fase. Puoi aggiungerli da Impostazioni → Modulo agricolo.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {gruppi.length > 1 && (
        <div className="flex justify-end gap-3 text-xs">
          <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => setChiusi(new Set())}>
            Espandi tutto
          </button>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setChiusi(new Set(gruppi.map((g) => g.id)))}
          >
            Comprimi tutto
          </button>
        </div>
      )}
      {gruppi.map((g) => {
        const aperto = !chiusi.has(g.id)
        const compilati = g.parametri.filter((p) => (bozza.valori[p.id] ?? '').trim() !== '').length
        return (
          <section key={g.id} className={cn(cls.pannello, 'overflow-hidden')}>
            <div className="flex flex-wrap items-center justify-between gap-2 bg-secondary/30 px-4 py-2.5">
              <button
                type="button"
                className="flex min-w-0 items-center gap-2 text-left"
                onClick={() => toggle(g.id)}
                aria-expanded={aperto}
              >
                {aperto ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                <span className="truncate text-sm font-semibold text-foreground">{g.nome}</span>
                <span
                  className={cn(
                    'shrink-0 text-xs',
                    compilati === g.parametri.length && compilati > 0 ? 'text-emerald-400' : 'text-muted-foreground'
                  )}
                >
                  {compilati} di {g.parametri.length} compilati
                </span>
              </button>
              {g.con_data && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  Data
                  <Input
                    type="date"
                    className="h-8 w-auto"
                    value={bozza.date[g.id] ?? ''}
                    onChange={(e) => setData(g.id, e.target.value)}
                  />
                </label>
              )}
            </div>
            {aperto && (
              <div className="grid gap-x-4 gap-y-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
                {g.parametri.length === 0 && (
                  <p className="text-sm text-muted-foreground">Nessun parametro in questo gruppo.</p>
                )}
                {g.parametri.map((p) => {
                  const id = `${idBase}-${p.id}`
                  const v = bozza.valori[p.id] ?? ''
                  const lungo = p.tipo === 'testo' && /^note/i.test(p.nome)
                  return (
                    <div key={p.id} className={cn('grid content-start gap-1.5', (lungo || p.tipo === 'scala') && 'sm:col-span-2 xl:col-span-3')}>
                      <label htmlFor={id} className="text-sm text-foreground/90">
                        {p.tipo === 'numero' ? p.nome : etichettaParametro(p)}
                      </label>
                      {p.tipo === 'numero' && <InputNumero id={id} valore={v} unita={p.unita} onChange={(x) => setValore(p.id, x)} />}
                      {p.tipo === 'testo' &&
                        (lungo ? (
                          <textarea id={id} className={cls.textarea} value={v} onChange={(e) => setValore(p.id, e.target.value)} />
                        ) : (
                          <Input id={id} value={v} onChange={(e) => setValore(p.id, e.target.value)} />
                        ))}
                      {p.tipo === 'scala' && <CampoScala valore={v} onChange={(x) => setValore(p.id, x)} />}
                      {p.tipo === 'si_no' && <CampoSiNo valore={v} onChange={(x) => setValore(p.id, x)} />}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        )
      })}
      {storici.length > 0 && (
        <div className="rounded-md border border-dashed border-border p-3 text-sm">
          <p className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <History className="h-3.5 w-3.5" /> Valori di parametri non più in uso
          </p>
          <ul className="grid gap-1 sm:grid-cols-2">
            {storici.map((s, i) => (
              <li key={i} className="text-muted-foreground">
                {s.gruppo} · {s.parametro}: <span className="text-foreground">{testoValore(s.tipo, s.valore, s.unita)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** Valore leggibile (sì/no, numeri con la virgola, unità). */
export function testoValore(tipo: Parametro['tipo'], valore: string, unita: string | null): string {
  if (tipo === 'si_no') return valore === 'si' ? 'Sì' : 'No'
  if (tipo === 'numero') return `${valore.replace('.', ',')}${unita ? ` ${unita}` : ''}`
  if (tipo === 'scala') return `${valore}/10`
  return valore
}
