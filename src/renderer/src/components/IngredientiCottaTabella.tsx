import { useState } from 'react'
import { Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  etichettaCategoria,
  isCategoriaInputAgricolo,
  isCategoriaMpAgricola,
  parseNumero
} from '@/lib/agricolo'
import {
  insufficiente,
  rigaPerMateria,
  rigaVuota,
  righeModificate,
  tolti,
  type RigaBozza
} from '@/lib/ingredientiCotta'

export type MateriaElenco = {
  id: number
  nome: string
  categoria: string
  unita_misura: string
  giacenza_totale: number
}

const fmt = (n: number): string => n.toLocaleString('it-IT', { maximumFractionDigits: 3 })

/**
 * Tabella degli ingredienti di una cotta, modificabile: quantità, sostituzione
 * (matita), rimozione (cestino) e aggiunta. Componente controllato.
 */
export function IngredientiCottaTabella({
  titolo,
  aiuto,
  righe,
  iniziali,
  onChange,
  materie,
  riferimenti,
  giaUsato,
  intestazioneQuantita,
  etichettaRiferimento,
  testoRipristina
}: {
  titolo: string
  aiuto?: string
  righe: RigaBozza[]
  iniziali: RigaBozza[]
  onChange: (righe: RigaBozza[]) => void
  materie: MateriaElenco[]
  /** Quantità di partenza per materia prima (ricetta o già usate). */
  riferimenti: Map<number, number>
  /** Già scaricato per la cotta (vuoto per una nuova cotta). */
  giaUsato: Map<number, number>
  intestazioneQuantita: string
  /** "ricetta" o "prima": testo accanto alla quantità di partenza. */
  etichettaRiferimento: string
  testoRipristina: string
}): React.JSX.Element {
  /** Righe in cui si sta scegliendo l'ingrediente (sostituzione o aggiunta). */
  const [inScelta, setInScelta] = useState<Set<string>>(new Set())

  const modificate = righeModificate(righe, iniziali)
  const toltiDaMostrare = tolti(righe, iniziali)

  const apriScelta = (chiave: string, aperta: boolean): void =>
    setInScelta((prev) => {
      const n = new Set(prev)
      if (aperta) n.add(chiave)
      else n.delete(chiave)
      return n
    })

  const scegli = (r: RigaBozza, materiaId: number): void => {
    const m = materie.find((x) => x.id === materiaId)
    if (!m) return
    // Su una sostituzione la quantità resta quella digitata, su un'aggiunta parte vuota.
    const nuova = rigaPerMateria(
      m,
      r.chiave,
      r.materia_prima_id ? r.quantita : '',
      riferimenti,
      giaUsato
    )
    onChange(righe.map((x) => (x.chiave === r.chiave ? nuova : x)))
    apriScelta(r.chiave, false)
  }

  const togli = (r: RigaBozza): void => {
    onChange(righe.filter((x) => x.chiave !== r.chiave))
    apriScelta(r.chiave, false)
  }

  const aggiungi = (): void => {
    const r = rigaVuota()
    onChange([...righe, r])
    apriScelta(r.chiave, true)
  }

  const ripristina = (): void => {
    onChange(iniziali)
    setInScelta(new Set())
  }

  const opzioniPer = (r: RigaBozza): MateriaElenco[] => {
    const usate = new Set(righe.filter((x) => x.chiave !== r.chiave).map((x) => x.materia_prima_id))
    return materie.filter((m) => !isCategoriaInputAgricolo(m.categoria) && !usate.has(m.id))
  }

  return (
    <div className="rounded-lg border border-border bg-secondary/20">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {titolo}
        </span>
        {modificate && (
          <button
            type="button"
            onClick={ripristina}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" /> {testoRipristina}
          </button>
        )}
      </div>
      {aiuto && <p className="px-4 pt-2 text-xs text-muted-foreground">{aiuto}</p>}
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-medium">Ingrediente</th>
            <th className="px-4 py-2 text-right font-medium">{intestazioneQuantita}</th>
            <th className="px-4 py-2 text-right font-medium">Giacenza</th>
            <th className="px-4 py-2 font-medium">Disponibile</th>
            <th className="w-20 px-2 py-2">
              <span className="sr-only">Azioni</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {righe.length === 0 && (
            <tr className="border-t border-border/50">
              <td colSpan={5} className="px-4 py-4 text-center text-muted-foreground">
                Nessun ingrediente.
              </td>
            </tr>
          )}
          {righe.map((r) => {
            const sceltaAperta = inScelta.has(r.chiave) || !r.materia_prima_id
            const scelto = r.materia_prima_id > 0
            const manca = scelto && insufficiente(r)
            const nQuantita = parseNumero(r.quantita)
            const cambiata =
              scelto &&
              r.riferimento !== null &&
              nQuantita !== null &&
              !Number.isNaN(nQuantita) &&
              Math.abs(nQuantita - r.riferimento) > 1e-9
            return (
              <tr key={r.chiave} className="border-t border-border/50 align-top text-foreground/80">
                <td className="px-4 py-2">
                  {sceltaAperta ? (
                    <select
                      aria-label="Scegli ingrediente"
                      autoFocus
                      className="flex h-8 w-full min-w-[10rem] rounded-md border border-input px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      value={r.materia_prima_id || ''}
                      onChange={(e) => scegli(r, Number(e.target.value))}
                    >
                      <option value="">Scegli ingrediente…</option>
                      {opzioniPer(r).map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nome} —{' '}
                          {isCategoriaMpAgricola(m.categoria)
                            ? etichettaCategoria(m.categoria)
                            : m.categoria}{' '}
                          ({m.unita_misura})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="py-1.5">
                      {r.mp_nome}
                      {r.riferimento === null && (
                        <span className="ml-2 text-xs text-amber-400">aggiunto</span>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Input
                      aria-label={`Quantità ${r.mp_nome}`}
                      inputMode="decimal"
                      disabled={!scelto}
                      value={r.quantita}
                      onChange={(e) =>
                        onChange(
                          righe.map((x) =>
                            x.chiave === r.chiave ? { ...x, quantita: e.target.value } : x
                          )
                        )
                      }
                      className="h-8 w-24 text-right tabular-nums"
                    />
                    <span className="w-6 text-left text-muted-foreground">{r.unita_misura}</span>
                  </div>
                  {cambiata && (
                    <div className="mt-1 pr-8 text-xs text-amber-400">
                      {etichettaRiferimento}: {fmt(r.riferimento as number)} {r.unita_misura}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  <div className="py-1.5">
                    {scelto ? `${fmt(r.giacenza)} ${r.unita_misura}` : '—'}
                  </div>
                </td>
                <td className="px-4 py-2">
                  <div className="py-1">
                    {scelto && (
                      <Badge
                        className={
                          manca
                            ? 'bg-red-500/15 text-red-400 border-red-500/25'
                            : 'bg-green-500/15 text-green-400 border-green-500/25'
                        }
                      >
                        {manca ? 'Insufficiente' : 'OK'}
                      </Badge>
                    )}
                  </div>
                </td>
                <td className="px-2 py-2">
                  <div className="flex justify-end gap-1">
                    {scelto && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        title={
                          sceltaAperta
                            ? 'Annulla sostituzione'
                            : 'Sostituisci con un altro ingrediente'
                        }
                        aria-label={
                          sceltaAperta ? 'Annulla sostituzione' : `Sostituisci ${r.mp_nome}`
                        }
                        onClick={() => apriScelta(r.chiave, !sceltaAperta)}
                      >
                        {sceltaAperta ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-8 w-8 p-0 hover:text-red-400"
                      title="Togli dalla cotta"
                      aria-label={`Togli ${r.mp_nome || 'riga'}`}
                      onClick={() => togli(r)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 px-4 py-2">
        <Button type="button" variant="outline" size="sm" onClick={aggiungi}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Aggiungi ingrediente
        </Button>
        {toltiDaMostrare.length > 0 && (
          <span className="text-xs text-muted-foreground">
            Tolti:{' '}
            {toltiDaMostrare
              .map((t) =>
                t.riferimento !== null
                  ? `${t.mp_nome} (${fmt(t.riferimento)} ${t.unita_misura})`
                  : t.mp_nome
              )
              .join(', ')}
          </span>
        )}
      </div>
    </div>
  )
}
