import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, PackageSearch, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  fmtData,
  messaggioErrore,
  type LottoImballoRiga,
  type MaterialeImballo
} from '@/lib/agricolo'

/**
 * Lotti dei materiali di confezionamento (HACCP): facoltativi, per tutti i
 * birrifici. Non toccano le giacenze, sono solo tracciabilità.
 */

function etichettaCarico(c: {
  lotto_fornitore: string | null
  fornitore: string | null
  data: string
  quantita: number
}): string {
  const parti = [
    c.lotto_fornitore ? `Lotto ${c.lotto_fornitore}` : 'Carico senza lotto',
    c.fornitore,
    `ricevuto il ${fmtData(c.data)}`,
    `${c.quantita.toLocaleString('it-IT')} pz`
  ].filter(Boolean)
  return parti.join(' · ')
}

/** Elenco a spunta dei carichi (lotti) per bottiglia, tappo e fusti della cotta. */
export function SelettoreLottiImballi({
  cottaId,
  bottiglie,
  fusti,
  selezionati,
  onChange
}: {
  cottaId: number
  bottiglie: boolean
  fusti: number[]
  selezionati: number[]
  onChange: (ids: number[]) => void
}): React.JSX.Element {
  const [materiali, setMateriali] = useState<MaterialeImballo[] | null>(null)
  const chiaveFusti = fusti.join(',')

  useEffect(() => {
    let attivo = true
    window.api.imballi
      .perConfezionamento(cottaId, {
        bottiglie,
        fusti: chiaveFusti ? chiaveFusti.split(',').map(Number) : []
      })
      .then((m) => attivo && setMateriali(m))
      .catch(() => attivo && setMateriali([]))
    return () => {
      attivo = false
    }
  }, [cottaId, bottiglie, chiaveFusti])

  if (materiali === null) return <p className="text-sm text-muted-foreground">Caricamento…</p>
  if (materiali.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nessun materiale di confezionamento da indicare.
      </p>
    )
  }

  const commuta = (id: number): void =>
    onChange(selezionati.includes(id) ? selezionati.filter((x) => x !== id) : [...selezionati, id])

  return (
    <div className="space-y-3">
      {materiali.map((m) => (
        <div key={m.materiale_id} className="space-y-1">
          <p className="text-sm font-medium text-foreground">{m.nome}</p>
          {m.carichi.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nessun carico registrato per questo materiale.
            </p>
          ) : (
            <div className="space-y-1">
              {m.carichi.map((c) => (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-start gap-2 text-sm text-foreground/80"
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 accent-amber-500"
                    checked={selezionati.includes(c.id)}
                    onChange={() => commuta(c.id)}
                  />
                  <span>{etichettaCarico(c)}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/** Sezione richiudibile del dialogo di confezionamento (chiusa di default). */
export function SezioneLottiImballi({
  cottaId,
  bottiglie,
  fusti,
  selezionati,
  onChange
}: {
  cottaId: number
  bottiglie: boolean
  fusti: number[]
  selezionati: number[]
  onChange: (ids: number[]) => void
}): React.JSX.Element {
  const [aperta, setAperta] = useState(false)
  return (
    <div className="rounded-md border border-border">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm"
        onClick={() => setAperta((v) => !v)}
        aria-expanded={aperta}
      >
        <span className="flex items-center gap-2 text-foreground">
          {aperta ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          Lotti di bottiglie, tappi e fusti usati
        </span>
        <span className="text-xs text-muted-foreground">
          {selezionati.length > 0 ? `${selezionati.length} indicati` : 'facoltativo · HACCP'}
        </span>
      </button>
      {aperta && (
        <div className="border-t border-border px-3 py-3">
          <SelettoreLottiImballi
            cottaId={cottaId}
            bottiglie={bottiglie}
            fusti={fusti}
            selezionati={selezionati}
            onChange={onChange}
          />
        </div>
      )}
    </div>
  )
}

/** Riquadro nel dettaglio di una cotta confezionata: lotti indicati + modifica. */
export function RiquadroLottiImballi({
  cottaId,
  bottiglie,
  fusti
}: {
  cottaId: number
  bottiglie: boolean
  fusti: number[]
}): React.JSX.Element {
  const [righe, setRighe] = useState<LottoImballoRiga[]>([])
  const [aperto, setAperto] = useState(false)
  const [bozza, setBozza] = useState<number[]>([])
  const [errore, setErrore] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const carica = useCallback(async () => {
    try {
      setRighe(await window.api.imballi.lottiCotta(cottaId))
    } catch {
      // es. database appena ripristinato da un backup vecchio: niente da mostrare
      setRighe([])
    }
  }, [cottaId])

  useEffect(() => {
    void carica()
  }, [carica])

  const salva = async (): Promise<void> => {
    setSalvando(true)
    setErrore(null)
    try {
      const r = await window.api.imballi.salvaLottiCotta(cottaId, bozza)
      if (!r.ok) {
        setErrore(r.errore)
        return
      }
      setAperto(false)
      await carica()
    } catch (e) {
      setErrore(messaggioErrore(e))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="mb-3 flex items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold text-foreground">Lotti imballi (HACCP)</h3>
          <p className="text-xs text-muted-foreground">
            Facoltativo: da quali lotti vengono bottiglie, tappi e fusti di questa cotta.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setErrore(null)
            setBozza(righe.map((r) => r.movimento_id))
            setAperto(true)
          }}
        >
          <Pencil className="mr-2 h-3.5 w-3.5" /> {righe.length > 0 ? 'Modifica' : 'Indica lotti'}
        </Button>
      </div>
      {righe.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <PackageSearch className="h-4 w-4" /> Nessun lotto indicato.
        </p>
      ) : (
        <ul className="space-y-1 text-sm">
          {righe.map((r) => (
            <li key={r.movimento_id} className="text-foreground/80">
              <span className="font-medium text-foreground">{r.materiale_nome}</span> —{' '}
              {etichettaCarico(r)}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={aperto} onOpenChange={setAperto}>
        <DialogContent
          className={cn('max-w-lg', 'max-h-[90vh] overflow-y-auto')}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Lotti imballi usati</DialogTitle>
            <DialogDescription>
              Spunta i lotti da cui hai preso bottiglie, tappi e fusti per questa cotta.
            </DialogDescription>
          </DialogHeader>
          <SelettoreLottiImballi
            cottaId={cottaId}
            bottiglie={bottiglie}
            fusti={fusti}
            selezionati={bozza}
            onChange={setBozza}
          />
          {errore && <p className="text-sm text-red-400">{errore}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAperto(false)} disabled={salvando}>
              Annulla
            </Button>
            <Button onClick={() => void salva()} disabled={salvando}>
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
