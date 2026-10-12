import { useCallback, useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, CalendarDays, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  BadgeTono,
  CampoForm,
  ConfermaDialog,
  ErroreBox,
  SceltaPulsanti,
  cls
} from '@/components/agricolo/common'
import { cn } from '@/lib/utils'
import {
  ETICHETTE_FASE,
  ETICHETTE_TIPO_PARAMETRO,
  erroreDa,
  messaggioErrore,
  type FaseLavorazione,
  type GruppoParametri,
  type Parametro,
  type TipoParametro
} from '@/lib/agricolo'

const FASI: Array<{ valore: FaseLavorazione; etichetta: string }> = [
  { valore: 'raccolta', etichetta: ETICHETTE_FASE.raccolta },
  { valore: 'calibratura', etichetta: ETICHETTE_FASE.calibratura },
  { valore: 'maltazione', etichetta: ETICHETTE_FASE.maltazione }
]

const TIPI: TipoParametro[] = ['numero', 'testo', 'scala', 'si_no']

/** Impostazioni → Modulo agricolo → Parametri delle fasi. */
export default function GestioneParametri(): React.JSX.Element {
  const [fase, setFase] = useState<FaseLavorazione>('maltazione')
  const [gruppi, setGruppi] = useState<GruppoParametri[]>([])
  const [errore, setErrore] = useState<string | null>(null)
  const [gruppoDialog, setGruppoDialog] = useState<{
    id: number | null
    nome: string
    con_data: boolean
  } | null>(null)
  const [paramDialog, setParamDialog] = useState<{
    id: number | null
    gruppo_id: number
    nome: string
    unita: string
    tipo: TipoParametro
  } | null>(null)
  const [erroreDialog, setErroreDialog] = useState<string | null>(null)
  const [conferma, setConferma] = useState<
    { tipo: 'gruppo'; g: GruppoParametri } | { tipo: 'parametro'; p: Parametro } | null
  >(null)
  const [occupato, setOccupato] = useState(false)
  const [messaggio, setMessaggio] = useState<string | null>(null)

  const carica = useCallback(async () => {
    try {
      setGruppi(await window.api.agri.parametriConfig(fase))
    } catch (e) {
      setErrore(messaggioErrore(e))
    }
  }, [fase])

  useEffect(() => {
    void carica()
  }, [carica])

  const esegui = async (
    azione: () => Promise<
      { ok: boolean; errore?: string } | { ok: true } | { ok: false; errore: string }
    >
  ): Promise<boolean> => {
    setOccupato(true)
    setErroreDialog(null)
    setErrore(null)
    try {
      const r = await azione()
      const err = erroreDa(r)
      if (err) {
        setErroreDialog(err)
        return false
      }
      await carica()
      return true
    } catch (e) {
      setErroreDialog(messaggioErrore(e))
      return false
    } finally {
      setOccupato(false)
    }
  }

  const salvaGruppo = async (): Promise<void> => {
    if (!gruppoDialog) return
    const ok = await esegui(() =>
      window.api.agri.gruppoSalva(gruppoDialog.id, {
        fase,
        nome: gruppoDialog.nome,
        con_data: gruppoDialog.con_data
      })
    )
    if (ok) setGruppoDialog(null)
  }

  const salvaParametro = async (): Promise<void> => {
    if (!paramDialog) return
    const ok = await esegui(() =>
      window.api.agri.parametroSalva(paramDialog.id, {
        gruppo_id: paramDialog.gruppo_id,
        nome: paramDialog.nome,
        unita: paramDialog.tipo === 'numero' ? paramDialog.unita : null,
        tipo: paramDialog.tipo
      })
    )
    if (ok) setParamDialog(null)
  }

  const sposta = (cosa: 'gruppo' | 'parametro', id: number, dir: 'su' | 'giu'): void => {
    void esegui(() => window.api.agri.parametriSposta(cosa, id, dir))
  }

  const confermaElimina = async (): Promise<void> => {
    if (!conferma) return
    setOccupato(true)
    setErroreDialog(null)
    try {
      const r =
        conferma.tipo === 'gruppo'
          ? await window.api.agri.gruppoElimina(conferma.g.id)
          : await window.api.agri.parametroElimina(conferma.p.id)
      if (!r.ok) {
        setErroreDialog(r.errore)
        return
      }
      setMessaggio(
        r.esito === 'nascosto'
          ? 'Aveva già dei valori registrati: è stato nascosto, e i valori restano visibili nello storico delle lavorazioni.'
          : 'Eliminato.'
      )
      setConferma(null)
      await carica()
    } catch (e) {
      setErroreDialog(messaggioErrore(e))
    } finally {
      setOccupato(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Parametri delle fasi</CardTitle>
        <CardDescription>
          I dati che compili in ogni lavorazione, divisi in gruppi nell&apos;ordine del processo.
          Puoi rinominarli, riordinarli, eliminarli o aggiungerne di tuoi.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SceltaPulsanti
            opzioni={FASI}
            valore={fase}
            onChange={(f) => {
              setMessaggio(null)
              setFase(f)
            }}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setErroreDialog(null)
              setGruppoDialog({ id: null, nome: '', con_data: false })
            }}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Nuovo gruppo
          </Button>
        </div>
        <ErroreBox messaggio={errore} />
        {messaggio && <p className="text-sm text-emerald-400">{messaggio}</p>}

        {gruppi.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            Nessun parametro per questa fase. Aggiungi un gruppo (es. &quot;Condizioni alla
            raccolta&quot;) e poi i suoi parametri.
          </p>
        ) : (
          <div className="space-y-3">
            {gruppi.map((g, gi) => (
              <div key={g.id} className={cls.pannello}>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-secondary/30 px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs tabular-nums text-muted-foreground">{gi + 1}.</span>
                    <span className="text-sm font-semibold text-foreground">{g.nome}</span>
                    {g.con_data && (
                      <BadgeTono tono="blu">
                        <CalendarDays className="mr-1 h-3 w-3" /> con data
                      </BadgeTono>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Sposta su"
                      disabled={gi === 0 || occupato}
                      onClick={() => sposta('gruppo', g.id, 'su')}
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Sposta giù"
                      disabled={gi === gruppi.length - 1 || occupato}
                      onClick={() => sposta('gruppo', g.id, 'giu')}
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Rinomina"
                      onClick={() => {
                        setErroreDialog(null)
                        setGruppoDialog({ id: g.id, nome: g.nome, con_data: g.con_data })
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Elimina gruppo"
                      onClick={() => {
                        setErroreDialog(null)
                        setConferma({ tipo: 'gruppo', g })
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <table className={cn(cls.tabella, 'table-fixed')}>
                  <colgroup>
                    <col />
                    <col className="w-24" />
                    <col className="w-36" />
                    <col className="w-44" />
                  </colgroup>
                  <tbody>
                    {g.parametri.map((p, pi) => (
                      <tr key={p.id} className={cls.riga}>
                        <td className={cls.td}>{p.nome}</td>
                        <td className={cn(cls.td, 'text-muted-foreground')}>{p.unita ?? ''}</td>
                        <td className={cn(cls.td, 'text-muted-foreground')}>
                          {ETICHETTE_TIPO_PARAMETRO[p.tipo]}
                        </td>
                        <td className={cn(cls.td, 'whitespace-nowrap text-right')}>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Sposta su"
                            disabled={pi === 0 || occupato}
                            onClick={() => sposta('parametro', p.id, 'su')}
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Sposta giù"
                            disabled={pi === g.parametri.length - 1 || occupato}
                            onClick={() => sposta('parametro', p.id, 'giu')}
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Modifica"
                            onClick={() => {
                              setErroreDialog(null)
                              setParamDialog({
                                id: p.id,
                                gruppo_id: g.id,
                                nome: p.nome,
                                unita: p.unita ?? '',
                                tipo: p.tipo
                              })
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Elimina"
                            onClick={() => {
                              setErroreDialog(null)
                              setConferma({ tipo: 'parametro', p })
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="px-4 py-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setErroreDialog(null)
                      setParamDialog({
                        id: null,
                        gruppo_id: g.id,
                        nome: '',
                        unita: '',
                        tipo: 'numero'
                      })
                    }}
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" /> Aggiungi parametro
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog
        open={gruppoDialog !== null}
        onOpenChange={(o) => (!o ? setGruppoDialog(null) : undefined)}
      >
        <DialogContent className="max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{gruppoDialog?.id ? 'Modifica gruppo' : 'Nuovo gruppo'}</DialogTitle>
            <DialogDescription>Fase: {ETICHETTE_FASE[fase]}</DialogDescription>
          </DialogHeader>
          {gruppoDialog && (
            <div className="grid gap-3">
              <CampoForm etichetta="Nome del gruppo" htmlFor="grp-nome" obbligatorio>
                <Input
                  id="grp-nome"
                  value={gruppoDialog.nome}
                  onChange={(e) => setGruppoDialog({ ...gruppoDialog, nome: e.target.value })}
                />
              </CampoForm>
              <label className="flex items-start gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-amber-500"
                  checked={gruppoDialog.con_data}
                  onChange={(e) => setGruppoDialog({ ...gruppoDialog, con_data: e.target.checked })}
                />
                <span>
                  Ha una sua data
                  <span className="block text-xs text-muted-foreground">
                    Per dati raccolti in un giorno diverso, es. i test di laboratorio dopo la
                    chiusura.
                  </span>
                </span>
              </label>
              <ErroreBox messaggio={erroreDialog} />
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setGruppoDialog(null)} disabled={occupato}>
              Annulla
            </Button>
            <Button onClick={() => void salvaGruppo()} disabled={occupato}>
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={paramDialog !== null}
        onOpenChange={(o) => (!o ? setParamDialog(null) : undefined)}
      >
        <DialogContent className="max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{paramDialog?.id ? 'Modifica parametro' : 'Nuovo parametro'}</DialogTitle>
            <DialogDescription>
              {gruppi.find((g) => g.id === paramDialog?.gruppo_id)?.nome}
            </DialogDescription>
          </DialogHeader>
          {paramDialog && (
            <div className="grid gap-3">
              <CampoForm
                etichetta="Nome"
                htmlFor="par-nome"
                obbligatorio
                aiuto="Se in un gruppo tutti i parametri sono numeri chiamati «Riga – Colonna» (es. «Curva 2 – Durata»), la scheda li mostra come tabella."
              >
                <Input
                  id="par-nome"
                  value={paramDialog.nome}
                  onChange={(e) => setParamDialog({ ...paramDialog, nome: e.target.value })}
                />
              </CampoForm>
              <CampoForm etichetta="Tipo di valore" htmlFor="par-tipo">
                <select
                  id="par-tipo"
                  className={cls.select}
                  value={paramDialog.tipo}
                  onChange={(e) =>
                    setParamDialog({ ...paramDialog, tipo: e.target.value as TipoParametro })
                  }
                >
                  {TIPI.map((t) => (
                    <option key={t} value={t}>
                      {ETICHETTE_TIPO_PARAMETRO[t]}
                    </option>
                  ))}
                </select>
              </CampoForm>
              {paramDialog.tipo === 'numero' && (
                <CampoForm etichetta="Unità" htmlFor="par-unita" aiuto="es. °C, kg, ore, min, %">
                  <Input
                    id="par-unita"
                    value={paramDialog.unita}
                    onChange={(e) => setParamDialog({ ...paramDialog, unita: e.target.value })}
                  />
                </CampoForm>
              )}
              <ErroreBox messaggio={erroreDialog} />
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setParamDialog(null)} disabled={occupato}>
              Annulla
            </Button>
            <Button onClick={() => void salvaParametro()} disabled={occupato}>
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfermaDialog
        aperto={conferma !== null}
        titolo={
          conferma?.tipo === 'gruppo'
            ? `Eliminare il gruppo "${conferma.g.nome}"?`
            : `Eliminare "${conferma?.tipo === 'parametro' ? conferma.p.nome : ''}"?`
        }
        testo="Non comparirà più nelle nuove lavorazioni. Se ha già dei valori registrati verrà solo nascosto: i dati delle lavorazioni passate restano visibili."
        etichettaConferma="Elimina"
        pericoloso
        inCorso={occupato}
        errore={erroreDialog}
        onConferma={() => void confermaElimina()}
        onChiudi={() => setConferma(null)}
      />
    </Card>
  )
}
