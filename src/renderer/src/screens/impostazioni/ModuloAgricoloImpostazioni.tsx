import { useCallback, useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { AvvisoBox, CampoForm, ErroreBox } from '@/components/agricolo/common'
import { useAgricolo } from '@/components/agricolo/contesto'
import { erroreDa, messaggioErrore, notificaCambioModulo, type FrazioneDefault } from '@/lib/agricolo'

function Salvato({ visibile }: { visibile: boolean }): React.JSX.Element | null {
  return visibile ? <span className="text-xs text-emerald-400">Salvato</span> : null
}

/** Tab "Modulo agricolo" delle Impostazioni (visibile solo a modulo attivo). */
export default function ModuloAgricoloImpostazioni(): React.JSX.Element {
  const agricolo = useAgricolo()
  const [stagione, setStagione] = useState(agricolo.stagione_corrente)
  const [frazioni, setFrazioni] = useState<FrazioneDefault[]>([])
  const [mesi, setMesi] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const [salvando, setSalvando] = useState<'stagione' | 'frazioni' | 'mesi' | null>(null)
  const [salvato, setSalvato] = useState<'stagione' | 'frazioni' | 'mesi' | null>(null)

  const carica = useCallback(async () => {
    try {
      const imp = await window.api.agri.impostazioni()
      setFrazioni(imp.frazioni_default)
      setMesi(String(imp.shelf_life_malto_mesi))
    } catch (e) {
      setErrore(messaggioErrore(e, 'Impossibile caricare le impostazioni del modulo'))
    }
  }, [])

  useEffect(() => {
    void carica()
  }, [carica])

  useEffect(() => {
    setStagione(agricolo.stagione_corrente)
  }, [agricolo.stagione_corrente])

  const salva = async (
    quale: 'stagione' | 'frazioni' | 'mesi',
    payload: Parameters<typeof window.api.agri.salvaImpostazioni>[0]
  ): Promise<void> => {
    setSalvando(quale)
    setSalvato(null)
    setErrore(null)
    try {
      const r = await window.api.agri.salvaImpostazioni(payload)
      const err = erroreDa(r)
      if (err) {
        setErrore(err)
        return
      }
      setSalvato(quale)
      if (quale === 'stagione') notificaCambioModulo()
      await carica()
    } catch (e) {
      setErrore(messaggioErrore(e))
    } finally {
      setSalvando(null)
    }
  }

  const sposta = (i: number, delta: -1 | 1): void => {
    setFrazioni((prev) => {
      const j = i + delta
      if (j < 0 || j >= prev.length) return prev
      const copia = [...prev]
      ;[copia[i], copia[j]] = [copia[j], copia[i]]
      return copia
    })
  }

  return (
    <div className="space-y-4">
      <ErroreBox messaggio={errore} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Stagione corrente</CardTitle>
          <CardDescription>
            È la stagione proposta quando registri semine, raccolte e lavorazioni, e quella mostrata di
            default negli elenchi del modulo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <CampoForm etichetta="Stagione" htmlFor="agri-stagione" className="sm:w-56" aiuto='Formato "2026/2027".'>
              <Input id="agri-stagione" value={stagione} onChange={(e) => setStagione(e.target.value)} />
            </CampoForm>
            <div className="flex items-center gap-3 sm:pb-5">
              <Button
                disabled={salvando === 'stagione'}
                onClick={() => void salva('stagione', { stagione_corrente: stagione })}
              >
                Salva
              </Button>
              <Salvato visibile={salvato === 'stagione'} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Frazioni di calibratura predefinite</CardTitle>
          <CardDescription>
            Le frazioni proposte in ogni nuova analisi e calibratura. Le frazioni segnate come scarto vengono
            registrate con la loro quantità ma non entrano in magazzino.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            {frazioni.map((f, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <Input
                  className="w-48"
                  value={f.nome}
                  aria-label={`Nome frazione ${i + 1}`}
                  onChange={(e) =>
                    setFrazioni((prev) => prev.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)))
                  }
                />
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-amber-500"
                    checked={f.scarto}
                    onChange={(e) =>
                      setFrazioni((prev) => prev.map((x, j) => (j === i ? { ...x, scarto: e.target.checked } : x)))
                    }
                  />
                  Scarto
                </label>
                <div className="ml-auto flex gap-1 sm:ml-0">
                  <Button variant="ghost" size="sm" title="Sposta su" disabled={i === 0} onClick={() => sposta(i, -1)}>
                    <ArrowUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    title="Sposta giù"
                    disabled={i === frazioni.length - 1}
                    onClick={() => sposta(i, 1)}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    title="Rimuovi"
                    disabled={frazioni.length <= 1}
                    onClick={() => setFrazioni((prev) => prev.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => setFrazioni((p) => [...p, { nome: '', scarto: false }])}>
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Aggiungi frazione
            </Button>
            <Button
              size="sm"
              disabled={salvando === 'frazioni'}
              onClick={() => void salva('frazioni', { frazioni_default: frazioni })}
            >
              Salva frazioni
            </Button>
            <Salvato visibile={salvato === 'frazioni'} />
          </div>
          <AvvisoBox>Le calibrature già registrate non cambiano: queste sono solo le frazioni proposte per le nuove.</AvvisoBox>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scadenza proposta per il malto</CardTitle>
          <CardDescription>
            Alla chiusura di una maltazione la scadenza del lotto di malto viene proposta come data di uscita più
            questi mesi. Puoi sempre cambiarla lotto per lotto.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <CampoForm etichetta="Mesi" htmlFor="agri-mesi" className="sm:w-40">
              <Input id="agri-mesi" inputMode="numeric" value={mesi} onChange={(e) => setMesi(e.target.value)} />
            </CampoForm>
            <div className="flex items-center gap-3 sm:pb-0.5">
              <Button
                disabled={salvando === 'mesi'}
                onClick={() => void salva('mesi', { shelf_life_malto_mesi: Number(mesi) })}
              >
                Salva
              </Button>
              <Salvato visibile={salvato === 'mesi'} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
