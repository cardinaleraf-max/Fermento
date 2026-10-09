import { useCallback, useEffect, useMemo, useState } from 'react'
import { Archive, ArchiveRestore, MapPin, Pencil, Plus, Sprout, Trash2 } from 'lucide-react'
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
import {
  BadgeTono,
  CampoForm,
  ConfermaDialog,
  ErroreBox,
  InputNumero,
  Intestazione,
  SceltaPulsanti,
  StatoVuoto,
  Valore,
  cls
} from '@/components/agricolo/common'
import { useAgricolo } from '@/components/agricolo/contesto'
import { FiltroStagione } from '@/components/agricolo/FiltroStagione'
import { cn } from '@/lib/utils'
import {
  erroreDa,
  fmtData,
  fmtNum,
  fmtQta,
  messaggioErrore,
  notificaCambioModulo,
  numeroInInput,
  oggiIso,
  parseNumero,
  stagioneDaData,
  type CampoRiga,
  type Coltura,
  type SeminaRiga
} from '@/lib/agricolo'

type CampoForm = { nome: string; superficie: string; localita: string; rif_catastale: string; note: string }

const campoVuoto: CampoForm = { nome: '', superficie: '', localita: '', rif_catastale: '', note: '' }

type SeminaForm = {
  campo_id: string
  stagione: string
  stagioneToccata: boolean
  coltura: Coltura
  varieta: string
  data: string
  superficie: string
  semente_testo: string
  note: string
}

const COLTURE: Array<{ valore: Coltura; etichetta: string }> = [
  { valore: 'orzo', etichetta: 'Orzo' },
  { valore: 'luppolo', etichetta: 'Luppolo' }
]

export function BadgeColtura({ coltura }: { coltura: Coltura }): React.JSX.Element {
  return coltura === 'orzo' ? <BadgeTono tono="ambra">Orzo</BadgeTono> : <BadgeTono tono="verde">Luppolo</BadgeTono>
}

export default function Campi(): React.JSX.Element {
  const agricolo = useAgricolo()
  const [stagione, setStagione] = useState(agricolo.stagione_corrente)
  const [campi, setCampi] = useState<CampoRiga[]>([])
  const [semine, setSemine] = useState<SeminaRiga[]>([])
  const [selezionatoId, setSelezionatoId] = useState<number | null>(null)
  const [mostraArchiviati, setMostraArchiviati] = useState(false)
  const [caricamento, setCaricamento] = useState(true)
  const [errore, setErrore] = useState<string | null>(null)

  const [campoDialog, setCampoDialog] = useState<{ id: number | null } | null>(null)
  const [campoForm, setCampoForm] = useState<CampoForm>(campoVuoto)
  const [seminaDialog, setSeminaDialog] = useState<{ id: number | null } | null>(null)
  const [seminaForm, setSeminaForm] = useState<SeminaForm | null>(null)
  const [erroreDialog, setErroreDialog] = useState<string | null>(null)
  const [salvataggio, setSalvataggio] = useState(false)
  const [conferma, setConferma] = useState<
    | { tipo: 'elimina-campo'; campo: CampoRiga }
    | { tipo: 'elimina-semina'; semina: SeminaRiga }
    | null
  >(null)
  const [erroreConferma, setErroreConferma] = useState<string | null>(null)

  useEffect(() => {
    if (!stagione && agricolo.stagione_corrente) setStagione(agricolo.stagione_corrente)
  }, [agricolo.stagione_corrente, stagione])

  const caricaCampi = useCallback(async () => {
    try {
      const lista = await window.api.agri.campiLista(stagione || null)
      setCampi(lista)
      setSelezionatoId((attuale) => attuale ?? lista.find((c) => c.attivo === 1)?.id ?? null)
    } catch (e) {
      setErrore(messaggioErrore(e, 'Impossibile caricare i campi'))
    } finally {
      setCaricamento(false)
    }
  }, [stagione])

  const caricaSemine = useCallback(async () => {
    if (selezionatoId === null) {
      setSemine([])
      return
    }
    try {
      setSemine(await window.api.agri.semineLista({ campo_id: selezionatoId, stagione: stagione || null }))
    } catch (e) {
      setErrore(messaggioErrore(e, 'Impossibile caricare le semine'))
    }
  }, [selezionatoId, stagione])

  useEffect(() => {
    void caricaCampi()
  }, [caricaCampi])

  useEffect(() => {
    void caricaSemine()
  }, [caricaSemine])

  const campiVisibili = useMemo(
    () => campi.filter((c) => mostraArchiviati || c.attivo === 1 || c.id === selezionatoId),
    [campi, mostraArchiviati, selezionatoId]
  )
  const archiviati = campi.filter((c) => c.attivo !== 1).length
  const selezionato = campi.find((c) => c.id === selezionatoId) ?? null

  // ── Campo ──────────────────────────────────────────────────────────────────

  const apriCampo = (campo: CampoRiga | null): void => {
    setErroreDialog(null)
    setCampoForm(
      campo
        ? {
            nome: campo.nome,
            superficie: numeroInInput(campo.superficie_ha),
            localita: campo.localita ?? '',
            rif_catastale: campo.rif_catastale ?? '',
            note: campo.note ?? ''
          }
        : campoVuoto
    )
    setCampoDialog({ id: campo?.id ?? null })
  }

  const salvaCampo = async (): Promise<void> => {
    if (!campoDialog) return
    const superficie = parseNumero(campoForm.superficie)
    if (superficie !== null && Number.isNaN(superficie)) {
      setErroreDialog('Superficie: inserisci un numero (es. 10 oppure 4,5).')
      return
    }
    setSalvataggio(true)
    setErroreDialog(null)
    try {
      const r = await window.api.agri.campoSalva(campoDialog.id, {
        nome: campoForm.nome,
        superficie_ha: superficie,
        localita: campoForm.localita,
        rif_catastale: campoForm.rif_catastale,
        note: campoForm.note
      })
      const err = erroreDa(r)
      if (err) {
        setErroreDialog(err)
        return
      }
      setCampoDialog(null)
      if (r.ok) setSelezionatoId(r.id)
      await caricaCampi()
    } catch (e) {
      setErroreDialog(messaggioErrore(e))
    } finally {
      setSalvataggio(false)
    }
  }

  const archivia = async (campo: CampoRiga, attivo: boolean): Promise<void> => {
    setErrore(null)
    try {
      await window.api.agri.campoArchivia(campo.id, attivo)
      await caricaCampi()
    } catch (e) {
      setErrore(messaggioErrore(e))
    }
  }

  // ── Semina ─────────────────────────────────────────────────────────────────

  const apriSemina = (semina: SeminaRiga | null): void => {
    if (!selezionato && !semina) return
    setErroreDialog(null)
    if (semina) {
      setSeminaForm({
        campo_id: String(semina.campo_id),
        stagione: semina.stagione,
        stagioneToccata: true,
        coltura: semina.coltura,
        varieta: semina.varieta ?? '',
        data: semina.data,
        superficie: numeroInInput(semina.superficie_ha),
        semente_testo: semina.semente_testo ?? '',
        note: semina.note ?? ''
      })
    } else if (selezionato) {
      const data = oggiIso()
      setSeminaForm({
        campo_id: String(selezionato.id),
        stagione: stagioneDaData(data),
        stagioneToccata: false,
        coltura: 'orzo',
        varieta: '',
        data,
        superficie: numeroInInput(selezionato.superficie_ha),
        semente_testo: '',
        note: ''
      })
    }
    setSeminaDialog({ id: semina?.id ?? null })
  }

  const aggiornaSemina = (patch: Partial<SeminaForm>): void => {
    setSeminaForm((prev) => {
      if (!prev) return prev
      const next = { ...prev, ...patch }
      // Finché l'utente non sceglie a mano la stagione, la proponiamo dalla data.
      if (patch.data && !next.stagioneToccata && /^\d{4}-\d{2}-\d{2}$/.test(patch.data)) {
        next.stagione = stagioneDaData(patch.data)
      }
      return next
    })
  }

  const salvaSemina = async (): Promise<void> => {
    if (!seminaDialog || !seminaForm) return
    const superficie = parseNumero(seminaForm.superficie)
    if (superficie !== null && Number.isNaN(superficie)) {
      setErroreDialog('Superficie seminata: inserisci un numero (es. 10 oppure 4,5).')
      return
    }
    setSalvataggio(true)
    setErroreDialog(null)
    try {
      const r = await window.api.agri.seminaSalva(seminaDialog.id, {
        campo_id: Number(seminaForm.campo_id),
        stagione: seminaForm.stagione,
        coltura: seminaForm.coltura,
        varieta: seminaForm.varieta,
        data: seminaForm.data,
        superficie_ha: superficie,
        semente_testo: seminaForm.semente_testo,
        semente: null,
        note: seminaForm.note
      })
      const err = erroreDa(r)
      if (err) {
        setErroreDialog(err)
        return
      }
      setSeminaDialog(null)
      notificaCambioModulo() // la stagione potrebbe essere nuova: aggiorna l'elenco stagioni
      // Se la semina è di un'altra stagione, mostra quella: altrimenti "sparirebbe" dalla vista.
      const stagioneSalvata = seminaForm.stagione.trim()
      if (stagione && stagioneSalvata !== stagione) {
        setStagione(stagioneSalvata)
        return // il cambio di stagione ricarica già campi e semine
      }
      await Promise.all([caricaCampi(), caricaSemine()])
    } catch (e) {
      setErroreDialog(messaggioErrore(e))
    } finally {
      setSalvataggio(false)
    }
  }

  const confermaEliminazione = async (): Promise<void> => {
    if (!conferma) return
    setSalvataggio(true)
    setErroreConferma(null)
    try {
      const r =
        conferma.tipo === 'elimina-campo'
          ? await window.api.agri.campoElimina(conferma.campo.id)
          : await window.api.agri.seminaElimina(conferma.semina.id)
      const err = erroreDa(r)
      if (err) {
        setErroreConferma(err)
        return
      }
      if (conferma.tipo === 'elimina-campo') setSelezionatoId(null)
      setConferma(null)
      await Promise.all([caricaCampi(), caricaSemine()])
    } catch (e) {
      setErroreConferma(messaggioErrore(e))
    } finally {
      setSalvataggio(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <Intestazione
        titolo="Campi e semine"
        sottotitolo="Il tuo quaderno di campagna: i campi e cosa ci hai seminato, stagione per stagione."
        azioni={
          <>
            <FiltroStagione valore={stagione} onChange={setStagione} />
            <Button size="sm" onClick={() => apriCampo(null)}>
              <Plus className="mr-1.5 h-4 w-4" /> Nuovo campo
            </Button>
          </>
        }
      />

      <ErroreBox messaggio={errore} />

      {caricamento ? (
        <p className="text-sm text-muted-foreground">Caricamento…</p>
      ) : campi.length === 0 ? (
        <StatoVuoto
          icona={MapPin}
          titolo="Nessun campo registrato"
          testo="Inizia aggiungendo i tuoi appezzamenti: nome, superficie e località. Poi potrai registrare semine, concimazioni, trattamenti e raccolte."
          azione={
            <Button size="sm" onClick={() => apriCampo(null)}>
              <Plus className="mr-1.5 h-4 w-4" /> Aggiungi il primo campo
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 [&>*]:min-w-0 xl:grid-cols-[minmax(240px,1fr)_2.6fr]">
          <div className={cn(cls.pannello, 'self-start')}>
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h4 className="text-sm font-semibold text-foreground">I tuoi campi</h4>
              {archiviati > 0 && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setMostraArchiviati((v) => !v)}
                >
                  {mostraArchiviati ? 'Nascondi archiviati' : `Mostra archiviati (${archiviati})`}
                </button>
              )}
            </div>
            <ul className="divide-y divide-border/60">
              {campiVisibili.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSelezionatoId(c.id)}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/30',
                      c.id === selezionatoId && 'bg-amber-500/10',
                      c.attivo !== 1 && 'opacity-60'
                    )}
                  >
                    <div className="min-w-0">
                      <p className={cn('truncate text-sm font-medium', c.id === selezionatoId ? 'text-amber-400' : 'text-foreground')}>
                        {c.nome}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[c.superficie_ha !== null ? `${fmtNum(c.superficie_ha)} ha` : null, c.localita]
                          .filter(Boolean)
                          .join(' · ') || 'Nessun dettaglio'}
                      </p>
                    </div>
                    <div className="shrink-0">
                      {c.attivo !== 1 ? (
                        <BadgeTono tono="grigio">Archiviato</BadgeTono>
                      ) : c.semine_stagione > 0 ? (
                        <BadgeTono tono="verde">
                          {c.semine_stagione} {c.semine_stagione === 1 ? 'semina' : 'semine'}
                        </BadgeTono>
                      ) : (
                        <span className="text-xs text-muted-foreground">Nessuna semina</span>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-4">
            {!selezionato ? (
              <StatoVuoto icona={Sprout} titolo="Seleziona un campo" testo="Scegli un campo a sinistra per vederne le semine." />
            ) : (
              <>
                <div className={cn(cls.pannello, 'p-5')}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="text-xl font-semibold text-foreground">{selezionato.nome}</h4>
                      {selezionato.attivo !== 1 && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Campo archiviato: resta nello storico e nella tracciabilità.
                        </p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => apriCampo(selezionato)}>
                        <Pencil className="mr-1.5 h-3.5 w-3.5" /> Modifica
                      </Button>
                      {selezionato.attivo === 1 ? (
                        <Button variant="outline" size="sm" onClick={() => void archivia(selezionato, false)}>
                          <Archive className="mr-1.5 h-3.5 w-3.5" /> Archivia
                        </Button>
                      ) : (
                        <Button variant="outline" size="sm" onClick={() => void archivia(selezionato, true)}>
                          <ArchiveRestore className="mr-1.5 h-3.5 w-3.5" /> Riattiva
                        </Button>
                      )}
                      {selezionato.semine_totali === 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setErroreConferma(null)
                            setConferma({ tipo: 'elimina-campo', campo: selezionato })
                          }}
                        >
                          <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Elimina
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    <Valore etichetta="Superficie">
                      {selezionato.superficie_ha !== null ? `${fmtNum(selezionato.superficie_ha)} ha` : '—'}
                    </Valore>
                    <Valore etichetta="Località">{selezionato.localita || '—'}</Valore>
                    <Valore etichetta="Riferimento catastale">{selezionato.rif_catastale || '—'}</Valore>
                  </div>
                  {selezionato.note && <p className="mt-3 text-sm text-muted-foreground">{selezionato.note}</p>}
                </div>

                <div className={cls.pannello}>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                    <h4 className="text-sm font-semibold text-foreground">
                      Semine {stagione ? `· stagione ${stagione}` : '· tutte le stagioni'}
                    </h4>
                    <Button size="sm" onClick={() => apriSemina(null)} disabled={selezionato.attivo !== 1}>
                      <Plus className="mr-1.5 h-4 w-4" /> Nuova semina
                    </Button>
                  </div>
                  {semine.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                      Nessuna semina {stagione ? 'in questa stagione' : 'registrata'} su questo campo.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className={cn(cls.tabella, 'min-w-[560px]')}>
                        <thead className={cls.thead}>
                          <tr>
                            <th className={cls.th}>Data</th>
                            <th className={cls.th}>Coltura</th>
                            <th className={cn(cls.th, 'text-right')}>Superficie</th>
                            <th className={cls.th}>Semente</th>
                            <th className={cls.th}>Registro</th>
                            <th className={cls.th} />
                          </tr>
                        </thead>
                        <tbody>
                          {semine.map((s) => {
                            const bloccata = s.operazioni > 0 || s.raccolte > 0
                            return (
                              <tr key={s.id} className={cls.riga}>
                                <td className={cn(cls.td, 'whitespace-nowrap tabular-nums')}>
                                  {fmtData(s.data)}
                                  {!stagione && <div className="text-xs text-muted-foreground">{s.stagione}</div>}
                                </td>
                                <td className={cls.td}>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <BadgeColtura coltura={s.coltura} />
                                    <span>{s.varieta || ''}</span>
                                  </div>
                                </td>
                                <td className={cn(cls.td, 'whitespace-nowrap text-right tabular-nums')}>
                                  {s.superficie_ha !== null ? `${fmtNum(s.superficie_ha)} ha` : '—'}
                                </td>
                                <td className={cn(cls.td, 'max-w-[220px]')}>
                                  {s.semente.length > 0 ? (
                                    s.semente.map((l) => (
                                      <div key={l.lotto_id} className="truncate" title={l.materia_prima_nome}>
                                        Lotto {l.lotto_codice || '—'} · {fmtQta(l.quantita, l.unita_misura)}
                                      </div>
                                    ))
                                  ) : (
                                    <div className="truncate text-muted-foreground" title={s.semente_testo ?? undefined}>
                                      {s.semente_testo || '—'}
                                    </div>
                                  )}
                                </td>
                                <td className={cn(cls.td, 'whitespace-nowrap text-xs text-muted-foreground')}>
                                  {s.operazioni} {s.operazioni === 1 ? 'operazione' : 'operazioni'}
                                  <br />
                                  {s.raccolte} {s.raccolte === 1 ? 'raccolta' : 'raccolte'}
                                </td>
                                <td className={cn(cls.td, 'whitespace-nowrap text-right')}>
                                  <Button variant="ghost" size="sm" title="Modifica semina" onClick={() => apriSemina(s)}>
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={bloccata}
                                    title={
                                      bloccata
                                        ? 'Ha operazioni o raccolte collegate: non si può eliminare'
                                        : 'Elimina semina'
                                    }
                                    onClick={() => {
                                      setErroreConferma(null)
                                      setConferma({ tipo: 'elimina-semina', semina: s })
                                    }}
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Dialog campo */}
      <Dialog open={campoDialog !== null} onOpenChange={(o) => (!o ? setCampoDialog(null) : undefined)}>
        <DialogContent className={cn('max-w-lg', cls.dialogLungo)} onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{campoDialog?.id ? 'Modifica campo' : 'Nuovo campo'}</DialogTitle>
            <DialogDescription>Un appezzamento della tua azienda agricola.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <CampoForm etichetta="Nome del campo" htmlFor="campo-nome" obbligatorio>
              <Input
                id="campo-nome"
                value={campoForm.nome}
                placeholder="es. Campo 1A, Su Pranu, Luppoleto"
                onChange={(e) => setCampoForm((p) => ({ ...p, nome: e.target.value }))}
              />
            </CampoForm>
            <div className="grid gap-3 sm:grid-cols-2">
              <CampoForm etichetta="Superficie" htmlFor="campo-sup">
                <InputNumero
                  id="campo-sup"
                  valore={campoForm.superficie}
                  unita="ha"
                  onChange={(v) => setCampoForm((p) => ({ ...p, superficie: v }))}
                />
              </CampoForm>
              <CampoForm etichetta="Località" htmlFor="campo-loc">
                <Input
                  id="campo-loc"
                  value={campoForm.localita}
                  onChange={(e) => setCampoForm((p) => ({ ...p, localita: e.target.value }))}
                />
              </CampoForm>
            </div>
            <CampoForm etichetta="Riferimento catastale" htmlFor="campo-cat" aiuto="Testo libero, es. Foglio 12, particella 34.">
              <Input
                id="campo-cat"
                value={campoForm.rif_catastale}
                onChange={(e) => setCampoForm((p) => ({ ...p, rif_catastale: e.target.value }))}
              />
            </CampoForm>
            <CampoForm etichetta="Note" htmlFor="campo-note">
              <textarea
                id="campo-note"
                className={cls.textarea}
                value={campoForm.note}
                onChange={(e) => setCampoForm((p) => ({ ...p, note: e.target.value }))}
              />
            </CampoForm>
            <ErroreBox messaggio={erroreDialog} />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCampoDialog(null)} disabled={salvataggio}>
              Annulla
            </Button>
            <Button onClick={() => void salvaCampo()} disabled={salvataggio}>
              {salvataggio ? 'Salvataggio…' : 'Salva campo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog semina */}
      <Dialog open={seminaDialog !== null} onOpenChange={(o) => (!o ? setSeminaDialog(null) : undefined)}>
        <DialogContent className={cn('max-w-lg', cls.dialogLungo)} onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{seminaDialog?.id ? 'Modifica semina' : 'Nuova semina'}</DialogTitle>
            <DialogDescription>Cosa hai seminato, dove e quando.</DialogDescription>
          </DialogHeader>
          {seminaForm && (
            <div className="grid gap-3">
              <CampoForm etichetta="Campo" htmlFor="semina-campo" obbligatorio>
                <select
                  id="semina-campo"
                  className={cls.select}
                  value={seminaForm.campo_id}
                  onChange={(e) => aggiornaSemina({ campo_id: e.target.value })}
                >
                  {campi
                    .filter((c) => c.attivo === 1 || String(c.id) === seminaForm.campo_id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                </select>
              </CampoForm>
              <CampoForm etichetta="Coltura" obbligatorio>
                <SceltaPulsanti opzioni={COLTURE} valore={seminaForm.coltura} onChange={(v) => aggiornaSemina({ coltura: v })} />
              </CampoForm>
              <div className="grid gap-3 sm:grid-cols-2">
                <CampoForm etichetta="Varietà" htmlFor="semina-var">
                  <Input
                    id="semina-var"
                    value={seminaForm.varieta}
                    placeholder={seminaForm.coltura === 'orzo' ? 'es. Concerto, Planet' : 'es. Cascade'}
                    onChange={(e) => aggiornaSemina({ varieta: e.target.value })}
                  />
                </CampoForm>
                <CampoForm etichetta="Data di semina" htmlFor="semina-data" obbligatorio>
                  <Input
                    id="semina-data"
                    type="date"
                    value={seminaForm.data}
                    onChange={(e) => aggiornaSemina({ data: e.target.value })}
                  />
                </CampoForm>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <CampoForm etichetta="Superficie seminata" htmlFor="semina-sup">
                  <InputNumero
                    id="semina-sup"
                    valore={seminaForm.superficie}
                    unita="ha"
                    onChange={(v) => aggiornaSemina({ superficie: v })}
                  />
                </CampoForm>
                <CampoForm etichetta="Stagione" htmlFor="semina-stag" obbligatorio aiuto="Proposta in base alla data.">
                  <Input
                    id="semina-stag"
                    list="semina-stagioni"
                    value={seminaForm.stagione}
                    placeholder="2026/2027"
                    onChange={(e) => aggiornaSemina({ stagione: e.target.value, stagioneToccata: true })}
                  />
                  <datalist id="semina-stagioni">
                    {agricolo.stagioni.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </CampoForm>
              </div>
              <CampoForm
                etichetta="Semente (lotto e fornitore)"
                htmlFor="semina-semente"
                aiuto="Testo libero, es. Lotto SEM-77 · Consorzio agrario."
              >
                <Input
                  id="semina-semente"
                  value={seminaForm.semente_testo}
                  onChange={(e) => aggiornaSemina({ semente_testo: e.target.value })}
                />
              </CampoForm>
              <CampoForm etichetta="Note" htmlFor="semina-note">
                <textarea
                  id="semina-note"
                  className={cls.textarea}
                  value={seminaForm.note}
                  onChange={(e) => aggiornaSemina({ note: e.target.value })}
                />
              </CampoForm>
              <ErroreBox messaggio={erroreDialog} />
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSeminaDialog(null)} disabled={salvataggio}>
              Annulla
            </Button>
            <Button onClick={() => void salvaSemina()} disabled={salvataggio}>
              {salvataggio ? 'Salvataggio…' : 'Salva semina'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfermaDialog
        aperto={conferma !== null}
        titolo={conferma?.tipo === 'elimina-campo' ? 'Eliminare il campo?' : 'Eliminare la semina?'}
        testo={
          conferma?.tipo === 'elimina-campo'
            ? `Il campo "${conferma.campo.nome}" verrà eliminato definitivamente.`
            : conferma?.tipo === 'elimina-semina'
              ? `La semina del ${fmtData(conferma.semina.data)} verrà eliminata definitivamente.`
              : ''
        }
        etichettaConferma="Elimina"
        pericoloso
        inCorso={salvataggio}
        errore={erroreConferma}
        onConferma={() => void confermaEliminazione()}
        onChiudi={() => setConferma(null)}
      />
    </div>
  )
}
