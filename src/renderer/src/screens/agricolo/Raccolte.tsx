import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Lock, Plus, Trash2, Wheat } from 'lucide-react'
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
  AvvisoBox,
  BadgeTono,
  CampoForm,
  ConfermaDialog,
  ErroreBox,
  InputNumero,
  Intestazione,
  StatoVuoto,
  cls
} from '@/components/agricolo/common'
import { useAgricolo } from '@/components/agricolo/contesto'
import { FiltroStagione } from '@/components/agricolo/FiltroStagione'
import {
  ParametriFase,
  bozzaDaSalvati,
  bozzaVuota,
  payloadDaBozza,
  type BozzaParametri
} from '@/components/agricolo/ParametriFase'
import { SceltaMateriaPrima } from '@/components/agricolo/SceltaMateriaPrima'
import { cn } from '@/lib/utils'
import {
  erroreDa,
  fmtData,
  fmtNum,
  messaggioErrore,
  numeroInInput,
  oggiIso,
  parseNumero,
  type GruppoParametri,
  type LavorazioneDettaglio,
  type LavorazioneRiga,
  type SeminaRiga,
  type ValoriParametri,
  type ViolazioneCarenzaRiga
} from '@/lib/agricolo'

type Form = {
  semina_id: string
  data: string
  stagione: string
  materia_prima_id: string
  quantita: string
  codice: string
  scadenza: string
  note: string
}

function etichettaSemina(s: SeminaRiga): string {
  const coltura = s.coltura === 'orzo' ? 'Orzo' : 'Luppolo'
  return `${s.campo_nome} · ${coltura}${s.varieta ? ` ${s.varieta}` : ''} (${fmtData(s.data)}, ${s.stagione})`
}

export default function Raccolte(): React.JSX.Element {
  const agricolo = useAgricolo()
  const [stagione, setStagione] = useState(agricolo.stagione_corrente)
  const [righe, setRighe] = useState<LavorazioneRiga[]>([])
  const [semine, setSemine] = useState<SeminaRiga[]>([])
  const [gruppi, setGruppi] = useState<GruppoParametri[]>([])
  const [caricamento, setCaricamento] = useState(true)
  const [errore, setErrore] = useState<string | null>(null)

  const [dialog, setDialog] = useState<{
    id: number | null
    dettaglio: LavorazioneDettaglio | null
  } | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [bozza, setBozza] = useState<BozzaParametri>(bozzaVuota)
  const [salvati, setSalvati] = useState<ValoriParametri>({ valori: {}, date: {} })
  const [unita, setUnita] = useState<string | null>(null)
  const [carenza, setCarenza] = useState<ViolazioneCarenzaRiga[]>([])
  const [erroreDialog, setErroreDialog] = useState<string | null>(null)
  const [salvataggio, setSalvataggio] = useState(false)
  const [daEliminare, setDaEliminare] = useState<LavorazioneRiga | null>(null)
  const [erroreConferma, setErroreConferma] = useState<string | null>(null)

  useEffect(() => {
    if (!stagione && agricolo.stagione_corrente) setStagione(agricolo.stagione_corrente)
  }, [agricolo.stagione_corrente, stagione])

  const carica = useCallback(async () => {
    try {
      const [r, s, g] = await Promise.all([
        window.api.agri.lavorazioniLista({ tipo: 'raccolta', stagione: stagione || null }),
        window.api.agri.semineLista({ stagione: null }),
        window.api.agri.parametriConfig('raccolta')
      ])
      setRighe(r)
      setSemine(s)
      setGruppi(g)
    } catch (e) {
      setErrore(messaggioErrore(e, 'Impossibile caricare le raccolte'))
    } finally {
      setCaricamento(false)
    }
  }, [stagione])

  useEffect(() => {
    void carica()
  }, [carica])

  const seminaScelta = semine.find((s) => String(s.id) === form?.semina_id) ?? null
  const bloccata = dialog?.dettaglio?.bloccata ?? null

  // Controllo del tempo di carenza mentre si compila
  useEffect(() => {
    if (!form?.semina_id || !/^\d{4}-\d{2}-\d{2}$/.test(form.data)) {
      setCarenza([])
      return
    }
    let attivo = true
    window.api.agri
      .verificaCarenza(Number(form.semina_id), form.data)
      .then((v) => attivo && setCarenza(v))
      .catch(() => attivo && setCarenza([]))
    return () => {
      attivo = false
    }
  }, [form?.semina_id, form?.data])

  const semineOrdinate = useMemo(
    () => [...semine].sort((a, b) => (a.data < b.data ? 1 : -1)),
    [semine]
  )

  const apri = async (riga: LavorazioneRiga | null): Promise<void> => {
    setErroreDialog(null)
    if (!riga) {
      const prima = semineOrdinate[0]
      setForm({
        semina_id: prima ? String(prima.id) : '',
        data: oggiIso(),
        stagione: prima?.stagione ?? agricolo.stagione_corrente,
        materia_prima_id: '',
        quantita: '',
        codice: '',
        scadenza: '',
        note: ''
      })
      setBozza(bozzaVuota)
      setSalvati({ valori: {}, date: {} })
      setDialog({ id: null, dettaglio: null })
      return
    }
    try {
      const d = await window.api.agri.lavorazioneDettaglio(riga.id)
      const uscita = d.output[0]
      setForm({
        semina_id: d.semina_id !== null ? String(d.semina_id) : '',
        data: d.data_inizio,
        stagione: d.stagione,
        materia_prima_id: d.materia_prima_id !== null ? String(d.materia_prima_id) : '',
        quantita: numeroInInput(uscita?.quantita ?? null),
        codice: d.codice ?? '',
        scadenza: d.data_scadenza_output ?? '',
        note: d.note ?? ''
      })
      setBozza(bozzaDaSalvati(d.gruppi, d.valori))
      setSalvati(d.valori)
      setDialog({ id: riga.id, dettaglio: d })
    } catch (e) {
      setErrore(messaggioErrore(e))
    }
  }

  const salva = async (): Promise<void> => {
    if (!dialog || !form) return
    const parametri = payloadDaBozza(gruppi, bozza, salvati)
    if (!parametri.ok) return setErroreDialog(parametri.errore)
    setSalvataggio(true)
    setErroreDialog(null)
    try {
      let id = dialog.id
      if (!bloccata) {
        const q = parseNumero(form.quantita)
        if (!form.semina_id) return setErroreDialog('Scegli la semina da cui viene il raccolto.')
        if (!form.materia_prima_id)
          return setErroreDialog('Scegli la materia prima in cui caricare il raccolto.')
        if (q === null || Number.isNaN(q) || q <= 0)
          return setErroreDialog('Inserisci la quantità raccolta.')
        const r = await window.api.agri.raccoltaSalva(dialog.id, {
          semina_id: Number(form.semina_id),
          data: form.data,
          stagione: form.stagione,
          materia_prima_id: Number(form.materia_prima_id),
          quantita: q,
          codice: form.codice,
          data_scadenza: form.scadenza || null,
          note: form.note
        })
        const err = erroreDa(r)
        if (err) return setErroreDialog(err)
        if (r.ok) id = r.id
      }
      if (
        id !== null &&
        (Object.keys(parametri.valori).length > 0 || Object.keys(parametri.date).length > 0)
      ) {
        const rp = await window.api.agri.salvaParametri(id, parametri.valori, parametri.date)
        const errp = erroreDa(rp)
        if (errp) return setErroreDialog(`Raccolta salvata, ma i parametri no: ${errp}`)
      }
      setDialog(null)
      if (stagione && form.stagione !== stagione) setStagione(form.stagione)
      else await carica()
    } catch (e) {
      setErroreDialog(messaggioErrore(e))
    } finally {
      setSalvataggio(false)
    }
  }

  const elimina = async (): Promise<void> => {
    if (!daEliminare) return
    setSalvataggio(true)
    setErroreConferma(null)
    try {
      const r = await window.api.agri.lavorazioneElimina(daEliminare.id)
      const err = erroreDa(r)
      if (err) return setErroreConferma(err)
      setDaEliminare(null)
      await carica()
    } catch (e) {
      setErroreConferma(messaggioErrore(e))
    } finally {
      setSalvataggio(false)
    }
  }

  const coltura = seminaScelta?.coltura ?? 'orzo'

  return (
    <div className="space-y-4">
      <Intestazione
        titolo="Raccolte"
        sottotitolo="Ogni raccolta crea un lotto di materia prima grezza in magazzino, collegato al campo e alla semina."
        azioni={
          <>
            <FiltroStagione valore={stagione} onChange={setStagione} />
            <Button size="sm" onClick={() => void apri(null)} disabled={semine.length === 0}>
              <Plus className="mr-1.5 h-4 w-4" /> Nuova raccolta
            </Button>
          </>
        }
      />
      <ErroreBox messaggio={errore} />

      {caricamento ? (
        <p className="text-sm text-muted-foreground">Caricamento…</p>
      ) : semine.length === 0 ? (
        <StatoVuoto
          icona={Wheat}
          titolo="Nessuna semina registrata"
          testo="Le raccolte partono da una semina: registrala prima in “Campi e semine”."
        />
      ) : righe.length === 0 ? (
        <StatoVuoto
          icona={Wheat}
          titolo={
            stagione ? `Nessuna raccolta nella stagione ${stagione}` : 'Nessuna raccolta registrata'
          }
          testo="Registra il raccolto di orzo o luppolo: verrà creato il lotto in magazzino con il codice che scegli tu."
          azione={
            <Button size="sm" onClick={() => void apri(null)}>
              <Plus className="mr-1.5 h-4 w-4" /> Nuova raccolta
            </Button>
          }
        />
      ) : (
        <div className={cls.tabellaWrap}>
          <table className={cn(cls.tabella, 'min-w-[760px]')}>
            <thead className={cls.thead}>
              <tr>
                <th className={cls.th}>Data</th>
                <th className={cls.th}>Lotto</th>
                <th className={cls.th}>Campo e coltura</th>
                <th className={cls.th}>Materia prima</th>
                <th className={cn(cls.th, 'text-right')}>Quantità</th>
                <th className={cls.th} />
              </tr>
            </thead>
            <tbody>
              {righe.map((r) => (
                <tr key={r.id} className={cls.rigaCliccabile} onClick={() => void apri(r)}>
                  <td className={cn(cls.td, 'whitespace-nowrap tabular-nums')}>
                    {fmtData(r.data_inizio)}
                  </td>
                  <td className={cls.td}>
                    <span className="font-medium text-foreground">{r.codice}</span>
                    {r.carenza.length > 0 && (
                      <div className="mt-1">
                        <BadgeTono tono="rosso">
                          <AlertTriangle className="mr-1 h-3 w-3" /> Dentro il tempo di carenza
                        </BadgeTono>
                      </div>
                    )}
                    {r.riepilogo_parametri && (
                      <div className="text-xs text-muted-foreground">{r.riepilogo_parametri}</div>
                    )}
                  </td>
                  <td className={cls.td}>
                    <div>{r.campo_nome}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.coltura === 'luppolo' ? 'Luppolo' : 'Orzo'}
                      {r.varieta ? ` ${r.varieta}` : ''}
                    </div>
                  </td>
                  <td className={cls.td}>{r.materia_prima_nome}</td>
                  <td className={cn(cls.td, 'whitespace-nowrap text-right tabular-nums')}>
                    <div>{r.output_descrizione.replace(`${r.codice} `, '')}</div>
                    {r.unita_misura !== 'kg' && r.output_kg !== null && (
                      <div className="text-xs text-muted-foreground">
                        {fmtNum(r.output_kg, 0)} kg
                      </div>
                    )}
                  </td>
                  <td className={cn(cls.td, 'text-right')} onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Elimina raccolta"
                      onClick={() => {
                        setErroreConferma(null)
                        setDaEliminare(r)
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialog !== null} onOpenChange={(o) => (!o ? setDialog(null) : undefined)}>
        <DialogContent
          className={cn('max-w-2xl', cls.dialogLungo)}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>
              {dialog?.id ? `Raccolta ${form?.codice ?? ''}` : 'Nuova raccolta'}
            </DialogTitle>
            <DialogDescription>
              Il raccolto entra in magazzino come lotto di materia prima grezza.
            </DialogDescription>
          </DialogHeader>
          {form && (
            <div className="grid gap-3">
              {bloccata && (
                <AvvisoBox tono="info" titolo="Quantità e lotto non più modificabili">
                  <span className="inline-flex items-center gap-1">
                    <Lock className="h-3.5 w-3.5" /> {bloccata} Puoi ancora compilare i parametri.
                  </span>
                </AvvisoBox>
              )}
              <CampoForm etichetta="Semina" htmlFor="rac-semina" obbligatorio>
                <select
                  id="rac-semina"
                  className={cls.select}
                  value={form.semina_id}
                  disabled={!!bloccata}
                  onChange={(e) => {
                    const s = semine.find((x) => String(x.id) === e.target.value)
                    setForm({
                      ...form,
                      semina_id: e.target.value,
                      stagione: s?.stagione ?? form.stagione,
                      materia_prima_id: ''
                    })
                  }}
                >
                  <option value="">Scegli…</option>
                  {semineOrdinate.map((s) => (
                    <option key={s.id} value={s.id}>
                      {etichettaSemina(s)}
                    </option>
                  ))}
                </select>
              </CampoForm>
              <div className="grid gap-3 sm:grid-cols-2">
                <CampoForm etichetta="Data di raccolta" htmlFor="rac-data" obbligatorio>
                  <Input
                    id="rac-data"
                    type="date"
                    value={form.data}
                    disabled={!!bloccata}
                    onChange={(e) => setForm({ ...form, data: e.target.value })}
                  />
                </CampoForm>
                <CampoForm
                  etichetta="Stagione"
                  htmlFor="rac-stag"
                  obbligatorio
                  aiuto="Di norma quella della semina."
                >
                  <Input
                    id="rac-stag"
                    value={form.stagione}
                    disabled={!!bloccata}
                    onChange={(e) => setForm({ ...form, stagione: e.target.value })}
                  />
                </CampoForm>
              </div>
              {carenza.length > 0 && (
                <AvvisoBox tono="attenzione" titolo="Raccolta dentro il tempo di carenza">
                  {carenza.map((c, i) => (
                    <p key={i}>
                      {c.prodotto}: trattamento del {fmtData(c.data)}, carenza di {c.giorni} giorni
                      fino al <strong>{fmtData(c.fine_carenza)}</strong>.
                    </p>
                  ))}
                  <p className="mt-1 text-xs">
                    Puoi registrarla comunque: comparirà anche tra gli avvisi.
                  </p>
                </AvvisoBox>
              )}
              <SceltaMateriaPrima
                key={coltura}
                id="rac-mp"
                categorie={coltura === 'orzo' ? ['orzo_grezzo'] : ['luppolo_grezzo', 'luppolo']}
                valore={form.materia_prima_id}
                onChange={(v) => setForm((f) => (f ? { ...f, materia_prima_id: v } : f))}
                etichetta="Carica in magazzino come"
                categoriaNuova={coltura === 'orzo' ? 'orzo_grezzo' : 'luppolo_grezzo'}
                nomeSuggerito={coltura === 'orzo' ? 'Orzo grezzo' : 'Luppolo fresco'}
                unitaAmmesse={coltura === 'orzo' ? ['q', 'kg'] : ['kg', 'g', 'q']}
                disabled={!!bloccata}
                onUnita={setUnita}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <CampoForm etichetta="Quantità raccolta" htmlFor="rac-q" obbligatorio>
                  <InputNumero
                    id="rac-q"
                    valore={form.quantita}
                    unita={unita}
                    disabled={!!bloccata}
                    onChange={(v) => setForm({ ...form, quantita: v })}
                  />
                </CampoForm>
                <CampoForm
                  etichetta="Codice lotto"
                  htmlFor="rac-cod"
                  obbligatorio
                  aiuto="Con il tuo formato, es. ORZ-01/2026."
                >
                  <Input
                    id="rac-cod"
                    value={form.codice}
                    disabled={!!bloccata}
                    onChange={(e) => setForm({ ...form, codice: e.target.value })}
                  />
                </CampoForm>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <CampoForm etichetta="Scadenza del lotto" htmlFor="rac-scad">
                  <Input
                    id="rac-scad"
                    type="date"
                    value={form.scadenza}
                    disabled={!!bloccata}
                    onChange={(e) => setForm({ ...form, scadenza: e.target.value })}
                  />
                </CampoForm>
                <CampoForm etichetta="Note" htmlFor="rac-note">
                  <Input
                    id="rac-note"
                    value={form.note}
                    disabled={!!bloccata}
                    onChange={(e) => setForm({ ...form, note: e.target.value })}
                  />
                </CampoForm>
              </div>
              {gruppi.length > 0 && (
                <div className="pt-1">
                  <p className="mb-2 text-sm font-semibold text-foreground">
                    Parametri della raccolta
                  </p>
                  <ParametriFase
                    idBase="rac-par"
                    gruppi={gruppi}
                    bozza={bozza}
                    onChange={setBozza}
                    storici={dialog?.dettaglio?.valori_storici}
                  />
                </div>
              )}
              <ErroreBox messaggio={erroreDialog} />
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialog(null)} disabled={salvataggio}>
              Annulla
            </Button>
            <Button onClick={() => void salva()} disabled={salvataggio}>
              {salvataggio ? 'Salvataggio…' : dialog?.id ? 'Salva modifiche' : 'Registra raccolta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfermaDialog
        aperto={daEliminare !== null}
        titolo="Eliminare la raccolta?"
        testo={
          daEliminare
            ? `La raccolta ${daEliminare.codice ?? ''} e il suo lotto in magazzino verranno eliminati.`
            : ''
        }
        etichettaConferma="Elimina"
        pericoloso
        inCorso={salvataggio}
        errore={erroreConferma}
        onConferma={() => void elimina()}
        onChiudi={() => setDaEliminare(null)}
      />
    </div>
  )
}
