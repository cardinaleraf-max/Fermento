import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Tractor, Trash2 } from 'lucide-react'
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
  Intestazione,
  SceltaPulsanti,
  StatoVuoto,
  cls
} from '@/components/agricolo/common'
import { BannerRegistro } from '@/components/agricolo/BannerRegistro'
import { useAgricolo } from '@/components/agricolo/contesto'
import { FiltroStagione } from '@/components/agricolo/FiltroStagione'
import {
  SelettoreProdotto,
  prodottoInPayload,
  prodottoVuoto,
  type InfoProdotto,
  type ValoreProdotto
} from '@/components/agricolo/SelettoreProdotto'
import { cn } from '@/lib/utils'
import {
  CATEGORIE_PER_TIPO,
  PRODOTTO_OBBLIGATORIO,
  TIPI_OPERAZIONE,
  aggiungiGiorniIso,
  erroreDa,
  fmtData,
  fmtNum,
  fmtQta,
  messaggioErrore,
  numeroInInput,
  oggiIso,
  parseNumero,
  type CampoRiga,
  type ConsumoLotto,
  type OperazioneRiga,
  type SeminaRiga,
  type TipoOperazione
} from '@/lib/agricolo'

type FiltroTipo = 'tutte' | TipoOperazione

const FILTRI_TIPO: Array<{ valore: FiltroTipo; etichetta: string }> = [
  { valore: 'tutte', etichetta: 'Tutte' },
  { valore: 'concimazione', etichetta: 'Concimazioni' },
  { valore: 'trattamento', etichetta: 'Trattamenti' },
  { valore: 'lavorazione', etichetta: 'Lavorazioni' },
  { valore: 'irrigazione', etichetta: 'Irrigazioni' },
  { valore: 'altro', etichetta: 'Altro' }
]

const TIPI_BREVI: Array<{ valore: TipoOperazione; etichetta: string }> = [
  { valore: 'concimazione', etichetta: 'Concimazione' },
  { valore: 'trattamento', etichetta: 'Trattamento' },
  { valore: 'lavorazione', etichetta: 'Lavorazione' },
  { valore: 'irrigazione', etichetta: 'Irrigazione' },
  { valore: 'altro', etichetta: 'Altro' }
]

export function BadgeTipoOperazione({ tipo }: { tipo: TipoOperazione }): React.JSX.Element {
  const etichetta = TIPI_OPERAZIONE.find((t) => t.valore === tipo)?.etichetta ?? tipo
  const tono = tipo === 'trattamento' ? 'rosso' : tipo === 'concimazione' ? 'verde' : tipo === 'irrigazione' ? 'blu' : 'grigio'
  return <BadgeTono tono={tono}>{etichetta}</BadgeTono>
}

type Form = {
  semina_id: string
  tipo: TipoOperazione
  data: string
  conProdotto: boolean
  prodotto: ValoreProdotto
  restituibili: ConsumoLotto[]
  motivo: string
  operatore: string
  note: string
}

function etichettaSemina(s: SeminaRiga): string {
  const coltura = s.coltura === 'orzo' ? 'Orzo' : 'Luppolo'
  return `${s.campo_nome} · ${coltura}${s.varieta ? ` ${s.varieta}` : ''} (${fmtData(s.data)})`
}

export default function OperazioniCampo(): React.JSX.Element {
  const agricolo = useAgricolo()
  const [stagione, setStagione] = useState(agricolo.stagione_corrente)
  const [campoFiltro, setCampoFiltro] = useState('')
  const [tipoFiltro, setTipoFiltro] = useState<FiltroTipo>('tutte')
  const [operazioni, setOperazioni] = useState<OperazioneRiga[]>([])
  const [campi, setCampi] = useState<CampoRiga[]>([])
  const [semine, setSemine] = useState<SeminaRiga[]>([])
  const [caricamento, setCaricamento] = useState(true)
  const [errore, setErrore] = useState<string | null>(null)

  const [dialog, setDialog] = useState<{ id: number | null } | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [info, setInfo] = useState<InfoProdotto | null>(null)
  const [erroreDialog, setErroreDialog] = useState<string | null>(null)
  const [salvataggio, setSalvataggio] = useState(false)
  const [daEliminare, setDaEliminare] = useState<OperazioneRiga | null>(null)
  const [erroreConferma, setErroreConferma] = useState<string | null>(null)

  useEffect(() => {
    if (!stagione && agricolo.stagione_corrente) setStagione(agricolo.stagione_corrente)
  }, [agricolo.stagione_corrente, stagione])

  const carica = useCallback(async () => {
    try {
      const [ops, cs, ss] = await Promise.all([
        window.api.agri.operazioniLista({
          stagione: stagione || null,
          campo_id: campoFiltro ? Number(campoFiltro) : null,
          tipo: tipoFiltro === 'tutte' ? null : tipoFiltro
        }),
        window.api.agri.campiLista(null),
        window.api.agri.semineLista({ stagione: null })
      ])
      setOperazioni(ops)
      setCampi(cs)
      setSemine(ss)
    } catch (e) {
      setErrore(messaggioErrore(e, 'Impossibile caricare le operazioni'))
    } finally {
      setCaricamento(false)
    }
  }, [stagione, campoFiltro, tipoFiltro])

  useEffect(() => {
    void carica()
  }, [carica])

  const semineSelezionabili = useMemo(() => {
    const idCorrente = form?.semina_id ?? ''
    return semine.filter((s) => !stagione || s.stagione === stagione || String(s.id) === idCorrente)
  }, [semine, stagione, form?.semina_id])

  const seminaScelta = semine.find((s) => String(s.id) === form?.semina_id) ?? null

  const apri = (op: OperazioneRiga | null): void => {
    setErroreDialog(null)
    setInfo(null)
    if (op) {
      setForm({
        semina_id: String(op.semina_id),
        tipo: op.tipo,
        data: op.data,
        conProdotto: op.materia_prima_id !== null,
        prodotto:
          op.materia_prima_id !== null
            ? {
                materia_prima_id: String(op.materia_prima_id),
                quantita: numeroInInput(op.quantita),
                lotto_id: op.lotti.length === 1 ? String(op.lotti[0].lotto_id) : ''
              }
            : prodottoVuoto,
        restituibili: op.lotti,
        motivo: op.motivo ?? '',
        operatore: op.operatore ?? '',
        note: op.note ?? ''
      })
    } else {
      const prima = semine.find((s) => !stagione || s.stagione === stagione)
      setForm({
        semina_id: prima ? String(prima.id) : '',
        tipo: 'concimazione',
        data: oggiIso(),
        conProdotto: true,
        prodotto: prodottoVuoto,
        restituibili: [],
        motivo: '',
        operatore: '',
        note: ''
      })
    }
    setDialog({ id: op?.id ?? null })
  }

  const cambiaTipo = (tipo: TipoOperazione): void => {
    setForm((f) => {
      if (!f) return f
      const stesseCategorie = CATEGORIE_PER_TIPO[tipo].join() === CATEGORIE_PER_TIPO[f.tipo].join()
      return {
        ...f,
        tipo,
        conProdotto: PRODOTTO_OBBLIGATORIO[tipo] ? true : f.conProdotto && stesseCategorie,
        prodotto: stesseCategorie ? f.prodotto : prodottoVuoto
      }
    })
  }

  const salva = async (): Promise<void> => {
    if (!dialog || !form) return
    if (!form.semina_id) return setErroreDialog('Scegli la semina su cui hai fatto l’operazione.')
    const prodotto = form.conProdotto ? prodottoInPayload(form.prodotto) : null
    if (form.conProdotto && !prodotto) return setErroreDialog('Scegli il prodotto usato.')
    if (prodotto && !(prodotto.quantita > 0)) return setErroreDialog('Inserisci la quantità totale usata.')
    setSalvataggio(true)
    setErroreDialog(null)
    try {
      const r = await window.api.agri.operazioneSalva(dialog.id, {
        semina_id: Number(form.semina_id),
        tipo: form.tipo,
        data: form.data,
        prodotto,
        motivo: form.motivo,
        operatore: form.operatore,
        note: form.note
      })
      const err = erroreDa(r)
      if (err) return setErroreDialog(err)
      setDialog(null)
      const seminaStagione = seminaScelta?.stagione
      if (stagione && seminaStagione && seminaStagione !== stagione) {
        setStagione(seminaStagione) // mostra l'operazione appena salvata
      } else {
        await carica()
      }
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
      const r = await window.api.agri.operazioneElimina(daEliminare.id)
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

  // Calcoli dal vivo nel dialog
  const quantitaLive = form ? parseNumero(form.prodotto.quantita) : null
  const superficie = seminaScelta?.superficie_ha ?? null
  const doseLive =
    form?.conProdotto && info && quantitaLive !== null && !Number.isNaN(quantitaLive) && superficie && superficie > 0
      ? quantitaLive / superficie
      : null
  const carenzaLive =
    form?.tipo === 'trattamento' && info?.tempo_carenza_giorni && info.tempo_carenza_giorni > 0 && form.data
      ? aggiungiGiorniIso(form.data, info.tempo_carenza_giorni)
      : null

  return (
    <div className="space-y-4">
      <BannerRegistro />
      <Intestazione
        titolo="Operazioni di campo"
        sottotitolo="Concimazioni, trattamenti, lavorazioni e irrigazioni, semina per semina. I prodotti vengono scaricati dal magazzino."
        azioni={
          <>
            <FiltroStagione valore={stagione} onChange={setStagione} />
            <Button size="sm" onClick={() => apri(null)} disabled={semine.length === 0}>
              <Plus className="mr-1.5 h-4 w-4" /> Nuova operazione
            </Button>
          </>
        }
      />
      <ErroreBox messaggio={errore} />

      <div className="flex flex-wrap items-center gap-3">
        <SceltaPulsanti opzioni={FILTRI_TIPO} valore={tipoFiltro} onChange={setTipoFiltro} />
        <select className={cn(cls.select, 'w-auto')} value={campoFiltro} onChange={(e) => setCampoFiltro(e.target.value)}>
          <option value="">Tutti i campi</option>
          {campi.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
      </div>

      {caricamento ? (
        <p className="text-sm text-muted-foreground">Caricamento…</p>
      ) : semine.length === 0 ? (
        <StatoVuoto
          icona={Tractor}
          titolo="Nessuna semina registrata"
          testo="Le operazioni si registrano su una semina: prima aggiungi un campo e la sua semina in “Campi e semine”."
        />
      ) : operazioni.length === 0 ? (
        <StatoVuoto
          icona={Tractor}
          titolo="Nessuna operazione con questi filtri"
          testo="Registra concimazioni, trattamenti, lavorazioni del terreno e irrigazioni."
          azione={
            <Button size="sm" onClick={() => apri(null)}>
              <Plus className="mr-1.5 h-4 w-4" /> Nuova operazione
            </Button>
          }
        />
      ) : (
        <div className={cls.tabellaWrap}>
          <table className={cn(cls.tabella, 'min-w-[860px]')}>
            <thead className={cls.thead}>
              <tr>
                <th className={cls.th}>Data</th>
                <th className={cls.th}>Campo e coltura</th>
                <th className={cls.th}>Operazione</th>
                <th className={cls.th}>Prodotto e lotto</th>
                <th className={cn(cls.th, 'text-right')}>Quantità</th>
                <th className={cn(cls.th, 'text-right')}>Dose/ha</th>
                <th className={cls.th}>Motivo</th>
                <th className={cls.th} />
              </tr>
            </thead>
            <tbody>
              {operazioni.map((o) => (
                <tr key={o.id} className={cls.riga}>
                  <td className={cn(cls.td, 'whitespace-nowrap tabular-nums')}>{fmtData(o.data)}</td>
                  <td className={cls.td}>
                    <div className="text-foreground">{o.campo_nome}</div>
                    <div className="text-xs text-muted-foreground">
                      {o.coltura === 'orzo' ? 'Orzo' : 'Luppolo'}
                      {o.varieta ? ` ${o.varieta}` : ''} · {o.stagione}
                    </div>
                  </td>
                  <td className={cls.td}>
                    <BadgeTipoOperazione tipo={o.tipo} />
                    {o.fine_carenza && (
                      <div className="mt-1 text-xs text-amber-400">Carenza fino al {fmtData(o.fine_carenza)}</div>
                    )}
                  </td>
                  <td className={cls.td}>
                    {o.materia_prima_nome ? (
                      <>
                        <div className="text-foreground">{o.materia_prima_nome}</div>
                        <div className="text-xs text-muted-foreground">
                          {o.lotti.map((l) => `lotto ${l.lotto_codice || '—'}`).join(', ')}
                        </div>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className={cn(cls.td, 'whitespace-nowrap text-right tabular-nums')}>{fmtQta(o.quantita, o.unita_misura)}</td>
                  <td className={cn(cls.td, 'whitespace-nowrap text-right tabular-nums')}>
                    {o.dose_ha !== null ? `${fmtNum(o.dose_ha)} ${o.unita_misura}/ha` : '—'}
                  </td>
                  <td className={cn(cls.td, 'max-w-[220px]')}>
                    <div className="truncate" title={o.motivo ?? undefined}>
                      {o.motivo || '—'}
                    </div>
                    {o.operatore && <div className="text-xs text-muted-foreground">{o.operatore}</div>}
                  </td>
                  <td className={cn(cls.td, 'whitespace-nowrap text-right')}>
                    <Button variant="ghost" size="sm" title="Modifica" onClick={() => apri(o)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Elimina"
                      onClick={() => {
                        setErroreConferma(null)
                        setDaEliminare(o)
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
        <DialogContent className={cn('max-w-xl', cls.dialogLungo)} onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{dialog?.id ? 'Modifica operazione' : 'Nuova operazione di campo'}</DialogTitle>
            <DialogDescription>Cosa hai fatto, dove, quando e con quale prodotto.</DialogDescription>
          </DialogHeader>
          {form && (
            <div className="grid gap-3">
              <CampoForm etichetta="Tipo di operazione" obbligatorio>
                <SceltaPulsanti opzioni={TIPI_BREVI} valore={form.tipo} onChange={cambiaTipo} />
              </CampoForm>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <CampoForm etichetta="Semina" htmlFor="op-semina" obbligatorio>
                  <select
                    id="op-semina"
                    className={cls.select}
                    value={form.semina_id}
                    onChange={(e) => setForm((f) => (f ? { ...f, semina_id: e.target.value } : f))}
                  >
                    <option value="">Scegli…</option>
                    {semineSelezionabili.map((s) => (
                      <option key={s.id} value={s.id}>
                        {etichettaSemina(s)}
                      </option>
                    ))}
                  </select>
                </CampoForm>
                <CampoForm etichetta="Data" htmlFor="op-data" obbligatorio>
                  <Input
                    id="op-data"
                    type="date"
                    value={form.data}
                    onChange={(e) => setForm((f) => (f ? { ...f, data: e.target.value } : f))}
                  />
                </CampoForm>
              </div>

              {!PRODOTTO_OBBLIGATORIO[form.tipo] && (
                <label className="flex items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-amber-500"
                    checked={form.conProdotto}
                    onChange={(e) => setForm((f) => (f ? { ...f, conProdotto: e.target.checked } : f))}
                  />
                  È stato usato un prodotto del magazzino
                </label>
              )}
              {form.conProdotto && (
                <SelettoreProdotto
                  idBase="op-prodotto"
                  categorie={CATEGORIE_PER_TIPO[form.tipo]}
                  etichetta={form.tipo === 'trattamento' ? 'Fitofarmaco' : form.tipo === 'concimazione' ? 'Concime' : 'Prodotto'}
                  obbligatorio
                  valore={form.prodotto}
                  restituibili={form.restituibili}
                  onChange={(v) => setForm((f) => (f ? { ...f, prodotto: v } : f))}
                  onInfo={setInfo}
                  testoVuoto={
                    form.tipo === 'trattamento'
                      ? 'Nessun fitofarmaco in magazzino: caricalo da “Magazzino input agricoli”.'
                      : form.tipo === 'concimazione'
                        ? 'Nessun concime in magazzino: caricalo da “Magazzino input agricoli”.'
                        : 'Nessun prodotto in magazzino.'
                  }
                />
              )}
              {(doseLive !== null || carenzaLive) && (
                <AvvisoBox tono={carenzaLive ? 'attenzione' : 'info'}>
                  {doseLive !== null && info && (
                    <p>
                      Dose: <strong>{fmtNum(doseLive)} {info.unita}/ha</strong> su {fmtNum(superficie)} ha seminati.
                    </p>
                  )}
                  {carenzaLive && info && (
                    <p>
                      Tempo di carenza {info.tempo_carenza_giorni} giorni: la raccolta non dovrebbe avvenire prima del{' '}
                      <strong>{fmtData(carenzaLive)}</strong>.
                    </p>
                  )}
                </AvvisoBox>
              )}

              <CampoForm
                etichetta={form.tipo === 'trattamento' ? 'Avversità / motivo' : 'Motivo'}
                htmlFor="op-motivo"
              >
                <Input
                  id="op-motivo"
                  value={form.motivo}
                  placeholder={
                    form.tipo === 'trattamento'
                      ? 'es. Ruggine, Oidio, infestanti'
                      : form.tipo === 'concimazione'
                        ? 'es. Concimazione di copertura'
                        : 'es. Erpicatura, rullatura'
                  }
                  onChange={(e) => setForm((f) => (f ? { ...f, motivo: e.target.value } : f))}
                />
              </CampoForm>
              <div className="grid gap-3 sm:grid-cols-2">
                <CampoForm etichetta="Operatore" htmlFor="op-operatore">
                  <Input
                    id="op-operatore"
                    value={form.operatore}
                    onChange={(e) => setForm((f) => (f ? { ...f, operatore: e.target.value } : f))}
                  />
                </CampoForm>
                <CampoForm etichetta="Note" htmlFor="op-note">
                  <Input
                    id="op-note"
                    value={form.note}
                    onChange={(e) => setForm((f) => (f ? { ...f, note: e.target.value } : f))}
                  />
                </CampoForm>
              </div>
              <ErroreBox messaggio={erroreDialog} />
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialog(null)} disabled={salvataggio}>
              Annulla
            </Button>
            <Button onClick={() => void salva()} disabled={salvataggio}>
              {salvataggio ? 'Salvataggio…' : 'Salva operazione'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfermaDialog
        aperto={daEliminare !== null}
        titolo="Eliminare l'operazione?"
        testo={
          daEliminare
            ? `L'operazione del ${fmtData(daEliminare.data)} verrà eliminata.${daEliminare.materia_prima_nome ? ' Il prodotto usato tornerà in magazzino.' : ''}`
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
