import { useCallback, useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { CampoForm, ErroreBox, cls } from './common'
import { ETICHETTE_UNITA, etichettaCategoria, messaggioErrore } from '@/lib/agricolo'

type Mp = Awaited<ReturnType<typeof window.api.mp.lista>>[number]

/**
 * Scelta della materia prima di destinazione di una lavorazione (es. "Orzo
 * grezzo", "Orzo calibrato", "Malto Pilsner aziendale"), con creazione al volo.
 */
export function SceltaMateriaPrima({
  id,
  categorie,
  valore,
  onChange,
  etichetta,
  categoriaNuova,
  nomeSuggerito,
  unitaAmmesse,
  aiuto,
  disabled,
  onUnita
}: {
  id: string
  categorie: string[]
  valore: string
  onChange: (id: string) => void
  etichetta: string
  categoriaNuova: string
  nomeSuggerito: string
  unitaAmmesse: string[]
  aiuto?: string
  disabled?: boolean
  onUnita?: (unita: string | null) => void
}): React.JSX.Element {
  const [elenco, setElenco] = useState<Mp[]>([])
  const [nuova, setNuova] = useState<{ nome: string; unita: string } | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const chiave = categorie.join(',')

  const carica = useCallback(async (): Promise<Mp[]> => {
    const tutte = await window.api.mp.lista()
    const filtrate = tutte.filter((m) => chiave.split(',').includes(m.categoria))
    setElenco(filtrate)
    return filtrate
  }, [chiave])

  useEffect(() => {
    void carica().then((lista) => {
      // Se c'è una sola scelta possibile e niente è selezionato, la proponiamo.
      if (!valore && lista.length === 1) onChange(String(lista[0].id))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carica])

  useEffect(() => {
    onUnita?.(elenco.find((m) => String(m.id) === valore)?.unita_misura ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valore, elenco])

  const crea = async (): Promise<void> => {
    if (!nuova) return
    if (!nuova.nome.trim()) {
      setErrore('Scrivi il nome.')
      return
    }
    setSalvando(true)
    setErrore(null)
    try {
      const r = await window.api.mp.crea({
        nome: nuova.nome.trim(),
        categoria: categoriaNuova,
        unita_misura: nuova.unita,
        soglia_riordino_fissa: null,
        soglia_riordino_dinamica_cotte: null,
        fornitore_preferito: null,
        note: null
      })
      await carica()
      onChange(String(r.id))
      setNuova(null)
    } catch (e) {
      setErrore(messaggioErrore(e))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <>
      <CampoForm etichetta={etichetta} htmlFor={id} obbligatorio aiuto={aiuto}>
        <div className="flex gap-2">
          <select
            id={id}
            className={cls.select}
            value={valore}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">{elenco.length === 0 ? 'Nessuna: creane una →' : 'Scegli…'}</option>
            {elenco.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome} ({m.unita_misura})
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 shrink-0"
            disabled={disabled}
            title={`Nuova materia prima: ${etichettaCategoria(categoriaNuova)}`}
            onClick={() => {
              setErrore(null)
              setNuova({ nome: elenco.length === 0 ? nomeSuggerito : '', unita: unitaAmmesse[0] })
            }}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Nuova
          </Button>
        </div>
      </CampoForm>

      <Dialog open={nuova !== null} onOpenChange={(o) => (!o ? setNuova(null) : undefined)}>
        <DialogContent className="max-w-sm" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Nuova materia prima</DialogTitle>
            <DialogDescription>Categoria: {etichettaCategoria(categoriaNuova)}</DialogDescription>
          </DialogHeader>
          {nuova && (
            <div className="grid gap-3">
              <CampoForm etichetta="Nome" htmlFor={`${id}-nuova-nome`} obbligatorio>
                <Input
                  id={`${id}-nuova-nome`}
                  value={nuova.nome}
                  placeholder={nomeSuggerito}
                  onChange={(e) => setNuova({ ...nuova, nome: e.target.value })}
                />
              </CampoForm>
              <CampoForm etichetta="Unità di misura" htmlFor={`${id}-nuova-unita`}>
                <select
                  id={`${id}-nuova-unita`}
                  className={cls.select}
                  value={nuova.unita}
                  onChange={(e) => setNuova({ ...nuova, unita: e.target.value })}
                >
                  {unitaAmmesse.map((u) => (
                    <option key={u} value={u}>
                      {ETICHETTE_UNITA[u] ?? u}
                    </option>
                  ))}
                </select>
              </CampoForm>
              <ErroreBox messaggio={errore} />
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setNuova(null)} disabled={salvando}>
              Annulla
            </Button>
            <Button onClick={() => void crea()} disabled={salvando}>
              Crea
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
