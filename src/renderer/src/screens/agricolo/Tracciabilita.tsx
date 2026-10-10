import { useEffect, useState } from 'react'
import { Beer, Download, MapPin, Package, Route, Search, Sprout, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AvvisoBox,
  ErroreBox,
  Intestazione,
  SceltaPulsanti,
  StatoVuoto,
  cls
} from '@/components/agricolo/common'
import { AlberoTracciabilita, tutteLeChiavi } from '@/components/agricolo/AlberoTracciabilita'
import { cn } from '@/lib/utils'
import {
  messaggioErrore,
  oggiIso,
  type DirezioneTraccia,
  type NodoTraccia,
  type PartenzaTraccia
} from '@/lib/agricolo'

const ICONA_PARTENZA = { cotta: Beer, lotto: Package, campo: MapPin, semina: Sprout }

const ETICHETTA_PARTENZA: Record<PartenzaTraccia['tipo'], string> = {
  cotta: 'Cotta',
  lotto: 'Lotto',
  campo: 'Campo',
  semina: 'Semina'
}

export default function Tracciabilita(): React.JSX.Element {
  const [testo, setTesto] = useState('')
  const [risultati, setRisultati] = useState<PartenzaTraccia[]>([])
  const [partenza, setPartenza] = useState<PartenzaTraccia | null>(null)
  const [direzione, setDirezione] = useState<DirezioneTraccia>('indietro')
  const [albero, setAlbero] = useState<NodoTraccia[]>([])
  const [chiusi, setChiusi] = useState<Set<string>>(new Set())
  const [caricamento, setCaricamento] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [messaggio, setMessaggio] = useState<string | null>(null)

  // Ricerca con piccolo ritardo mentre si scrive
  useEffect(() => {
    let attivo = true
    const t = setTimeout(() => {
      window.api.agri
        .cercaPartenze(testo)
        .then((r) => attivo && setRisultati(r))
        .catch(() => attivo && setRisultati([]))
    }, 200)
    return () => {
      attivo = false
      clearTimeout(t)
    }
  }, [testo])

  useEffect(() => {
    if (!partenza) {
      setAlbero([])
      return
    }
    let attivo = true
    setCaricamento(true)
    setErrore(null)
    setMessaggio(null)
    window.api.agri
      .traccia({ tipo: partenza.tipo, id: partenza.id }, direzione)
      .then((a) => {
        if (!attivo) return
        setAlbero(a)
        setChiusi(new Set())
      })
      .catch((e) => attivo && setErrore(messaggioErrore(e)))
      .finally(() => attivo && setCaricamento(false))
    return () => {
      attivo = false
    }
  }, [partenza, direzione])

  const scegli = (p: PartenzaTraccia): void => {
    setDirezione(p.tipo === 'campo' || p.tipo === 'semina' ? 'avanti' : 'indietro')
    setPartenza(p)
  }

  const esporta = async (): Promise<void> => {
    if (!partenza) return
    setErrore(null)
    setMessaggio(null)
    try {
      const nome = `tracciabilita ${partenza.etichetta} ${direzione === 'indietro' ? 'a ritroso' : 'in avanti'} ${oggiIso()}`
      const r = await window.api.agri.esportaCsv(albero, nome)
      if (r.ok) setMessaggio(`File salvato: ${r.percorso}`)
    } catch (e) {
      setErrore(messaggioErrore(e, 'Esportazione non riuscita'))
    }
  }

  const direzioni: Array<{ valore: DirezioneTraccia; etichetta: string }> =
    partenza?.tipo === 'campo'
      ? [{ valore: 'avanti', etichetta: 'Dove è finito (in avanti)' }]
      : [
          { valore: 'indietro', etichetta: 'Da dove viene (a ritroso)' },
          { valore: 'avanti', etichetta: 'Dove è finito (in avanti)' }
        ]

  return (
    <div className="space-y-4">
      <Intestazione
        titolo="Tracciabilità"
        sottotitolo="Dalla bottiglia al campo e dal campo alla bottiglia: cerca una cotta, un lotto o un campo."
      />

      <div className={cn(cls.pannello, 'space-y-3 p-4')}>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            value={testo}
            placeholder="Codice della cotta o del lotto (es. 2026-033, ORZ-01/2026) oppure nome del campo"
            onChange={(e) => setTesto(e.target.value)}
          />
        </div>
        {risultati.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nessun risultato.</p>
        ) : (
          <div>
            {!testo && (
              <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Recenti</p>
            )}
            <div className="flex flex-wrap gap-2">
              {risultati.map((r) => {
                const Icona = ICONA_PARTENZA[r.tipo]
                const scelto = partenza?.tipo === r.tipo && partenza.id === r.id
                return (
                  <button
                    key={`${r.tipo}-${r.id}`}
                    type="button"
                    onClick={() => scegli(r)}
                    className={cn(
                      'flex items-center gap-2 rounded-md border px-3 py-1.5 text-left text-sm transition-colors',
                      scelto
                        ? 'border-amber-500 bg-amber-500/10 text-amber-300'
                        : 'border-border bg-secondary/30 text-foreground/90 hover:bg-secondary/60'
                    )}
                    title={`${ETICHETTA_PARTENZA[r.tipo]}: ${r.sottotitolo}`}
                  >
                    <Icona className="h-3.5 w-3.5 shrink-0" />
                    <span>{r.etichetta}</span>
                    <span className="text-xs text-muted-foreground">{r.sottotitolo}</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {!partenza ? (
        <StatoVuoto
          icona={Route}
          titolo="Scegli da dove partire"
          testo="Da una cotta risali al malto, all'orzo, alla raccolta, al campo e ai trattamenti. Da un campo o da un lotto vedi in quali cotte è finito e a quali clienti è stata venduta la birra."
        />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <SceltaPulsanti opzioni={direzioni} valore={direzione} onChange={setDirezione} />
              <Button variant="ghost" size="sm" onClick={() => setPartenza(null)}>
                <X className="mr-1 h-3.5 w-3.5" /> Cambia partenza
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setChiusi(new Set())}>
                Espandi tutto
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setChiusi(new Set(tutteLeChiavi(albero)))}
              >
                Comprimi tutto
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={albero.length === 0}
                onClick={() => void esporta()}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" /> Esporta CSV
              </Button>
            </div>
          </div>
          <ErroreBox messaggio={errore} />
          {messaggio && <AvvisoBox>{messaggio}</AvvisoBox>}
          {caricamento ? (
            <p className="text-sm text-muted-foreground">Ricostruzione della filiera…</p>
          ) : albero.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessun dato da mostrare.</p>
          ) : (
            <>
              {albero[0].figli.length === 0 && (
                <AvvisoBox>
                  {direzione === 'indietro'
                    ? 'Nessuna provenienza registrata: è un lotto acquistato o caricato a mano.'
                    : 'Non risulta ancora usato più avanti nella filiera.'}
                </AvvisoBox>
              )}
              <AlberoTracciabilita nodi={albero} chiusi={chiusi} onChiusiChange={setChiusi} />
            </>
          )}
        </div>
      )}
    </div>
  )
}
