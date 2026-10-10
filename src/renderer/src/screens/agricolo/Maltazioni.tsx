import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Flame, Lock, PackageCheck, Pencil, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react'
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
  SceltaPulsanti,
  StatoVuoto,
  Valore,
  cls
} from '@/components/agricolo/common'
import { useAgricolo } from '@/components/agricolo/contesto'
import { FiltroStagione } from '@/components/agricolo/FiltroStagione'
import {
  ParametriFase,
  bozzaDaSalvati,
  bozzaModificata,
  bozzaVuota,
  payloadDaBozza,
  type BozzaParametri
} from '@/components/agricolo/ParametriFase'
import { SceltaMateriaPrima } from '@/components/agricolo/SceltaMateriaPrima'
import { cn } from '@/lib/utils'
import {
  convertiUnita,
  erroreDa,
  fmtData,
  fmtNum,
  fmtPerc,
  fmtQta,
  messaggioErrore,
  numeroInInput,
  oggiIso,
  parseNumero,
  type LavorazioneDettaglio,
  type LavorazioneRiga,
  type LottoDisponibile,
  type StatoLavorazione
} from '@/lib/agricolo'

type FiltroStato = 'tutte' | StatoLavorazione

const FILTRI_STATO: Array<{ valore: FiltroStato; etichetta: string }> = [
  { valore: 'tutte', etichetta: 'Tutte' },
  { valore: 'in_corso', etichetta: 'In corso' },
  { valore: 'chiusa', etichetta: 'Chiuse' }
]

/** Giorni trascorsi da una data AAAA-MM-GG a oggi. */
export function giorniDa(iso: string): number {
  const [a, m, g] = iso.split('-').map(Number)
  const oggi = new Date()
  const ms = Date.UTC(oggi.getFullYear(), oggi.getMonth(), oggi.getDate()) - Date.UTC(a, m - 1, g)
  return Math.max(0, Math.round(ms / 86400000))
}

export function BadgeStatoMaltazione({ r }: { r: Pick<LavorazioneRiga, 'stato' | 'data_inizio'> }): React.JSX.Element {
  if (r.stato === 'chiusa') return <BadgeTono tono="verde">Chiusa</BadgeTono>
  const g = giorniDa(r.data_inizio)
  return <BadgeTono tono="ambra">In corso · {g === 1 ? '1 giorno' : `${g} giorni`}</BadgeTono>
}

type RigaInput = { lotto_id: string; kg: string }

type Editor = {
  id: number | null
  data_inizio: string
  stagione: string
  materia_prima_id: string
  codice: string
  righe: RigaInput[]
  note: string
  /** In modifica: kg già scaricati da questa maltazione per lotto (tornano disponibili). */
  restituibili: Record<number, number>
}

type Vista = { tipo: 'elenco' } | { tipo: 'editor'; editor: Editor } | { tipo: 'dettaglio'; id: number }

export default function Maltazioni(): React.JSX.Element {
  const agricolo = useAgricolo()
  const [vista, setVista] = useState<Vista>({ tipo: 'elenco' })
  const [stagione, setStagione] = useState(agricolo.stagione_corrente)
  const [stato, setStato] = useState<FiltroStato>('tutte')
  const [righe, setRighe] = useState<LavorazioneRiga[]>([])
  const [caricamento, setCaricamento] = useState(true)
  const [errore, setErrore] = useState<string | null>(null)

  useEffect(() => {
    if (!stagione && agricolo.stagione_corrente) setStagione(agricolo.stagione_corrente)
  }, [agricolo.stagione_corrente, stagione])

  const carica = useCallback(async () => {
    try {
      setRighe(
        await window.api.agri.lavorazioniLista({
          tipo: 'maltazione',
          stagione: stagione || null,
          stato: stato === 'tutte' ? null : stato
        })
      )
    } catch (e) {
      setErrore(messaggioErrore(e, 'Impossibile caricare le maltazioni'))
    } finally {
      setCaricamento(false)
    }
  }, [stagione, stato])

  useEffect(() => {
    void carica()
  }, [carica])

  const nuova = (): void =>
    setVista({
      tipo: 'editor',
      editor: {
        id: null,
        data_inizio: oggiIso(),
        stagione: agricolo.stagione_corrente,
        materia_prima_id: '',
        codice: '',
        righe: [{ lotto_id: '', kg: '' }],
        note: '',
        restituibili: {}
      }
    })

  const modifica = (d: LavorazioneDettaglio): void => {
    const restituibili: Record<number, number> = {}
    for (const i of d.input) restituibili[i.lotto_id] = (restituibili[i.lotto_id] ?? 0) + (i.quantita_kg ?? 0)
    setVista({
      tipo: 'editor',
      editor: {
        id: d.id,
        data_inizio: d.data_inizio,
        stagione: d.stagione,
        materia_prima_id: d.materia_prima_id !== null ? String(d.materia_prima_id) : '',
        codice: d.codice ?? '',
        righe: d.input.map((i) => ({ lotto_id: String(i.lotto_id), kg: numeroInInput(i.quantita_kg) })),
        note: d.note ?? '',
        restituibili
      }
    })
  }

  if (vista.tipo === 'editor') {
    return (
      <EditorMaltazione
        iniziale={vista.editor}
        onAnnulla={() => setVista(vista.editor.id ? { tipo: 'dettaglio', id: vista.editor.id } : { tipo: 'elenco' })}
        onSalvata={(id, stagioneSalvata) => {
          if (stagione && stagioneSalvata !== stagione) setStagione(stagioneSalvata)
          void carica()
          setVista({ tipo: 'dettaglio', id })
        }}
      />
    )
  }

  if (vista.tipo === 'dettaglio') {
    return (
      <DettaglioMaltazione
        id={vista.id}
        onIndietro={() => {
          void carica()
          setVista({ tipo: 'elenco' })
        }}
        onModifica={modifica}
      />
    )
  }

  return (
    <div className="space-y-4">
      <Intestazione
        titolo="Maltazioni"
        sottotitolo="Dall'orzo calibrato al malto. Il lotto di malto entra in magazzino quando registri la data di uscita: prima non è disponibile per le cotte."
        azioni={
          <>
            <FiltroStagione valore={stagione} onChange={setStagione} />
            <Button size="sm" onClick={nuova}>
              <Plus className="mr-1.5 h-4 w-4" /> Nuova maltazione
            </Button>
          </>
        }
      />
      <ErroreBox messaggio={errore} />
      <SceltaPulsanti opzioni={FILTRI_STATO} valore={stato} onChange={setStato} />
      {caricamento ? (
        <p className="text-sm text-muted-foreground">Caricamento…</p>
      ) : righe.length === 0 ? (
        <StatoVuoto
          icona={Flame}
          titolo="Nessuna maltazione"
          testo="Avvia una maltazione scegliendo i lotti di orzo calibrato: potrai compilare i parametri di macerazione, germinazione, essiccazione e i test di laboratorio."
          azione={
            <Button size="sm" onClick={nuova}>
              <Plus className="mr-1.5 h-4 w-4" /> Nuova maltazione
            </Button>
          }
        />
      ) : (
        <div className={cls.tabellaWrap}>
          <table className={cn(cls.tabella, 'min-w-[820px]')}>
            <thead className={cls.thead}>
              <tr>
                <th className={cls.th}>Lotto</th>
                <th className={cls.th}>Malto</th>
                <th className={cls.th}>Inizio</th>
                <th className={cls.th}>Uscita</th>
                <th className={cn(cls.th, 'text-right')}>Orzo</th>
                <th className={cn(cls.th, 'text-right')}>Malto</th>
                <th className={cn(cls.th, 'text-right')}>Resa</th>
                <th className={cls.th}>Stato</th>
              </tr>
            </thead>
            <tbody>
              {righe.map((r) => (
                <tr key={r.id} className={cls.rigaCliccabile} onClick={() => setVista({ tipo: 'dettaglio', id: r.id })}>
                  <td className={cn(cls.td, 'font-medium text-foreground')}>{r.codice}</td>
                  <td className={cls.td}>{r.materia_prima_nome}</td>
                  <td className={cn(cls.td, 'tabular-nums')}>{fmtData(r.data_inizio)}</td>
                  <td className={cn(cls.td, 'tabular-nums')}>{fmtData(r.data_fine)}</td>
                  <td className={cn(cls.td, 'text-right tabular-nums')}>{fmtQta(r.input_kg, 'kg', 1)}</td>
                  <td className={cn(cls.td, 'text-right tabular-nums')}>
                    {r.stato === 'chiusa' ? fmtQta(r.output_kg, 'kg', 1) : '—'}
                  </td>
                  <td className={cn(cls.td, 'text-right tabular-nums')}>{fmtPerc(r.rese?.resa_maltazione)}</td>
                  <td className={cls.td}>
                    <BadgeStatoMaltazione r={r} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Editor ───────────────────────────────────────────────────────────────────

function EditorMaltazione({
  iniziale,
  onAnnulla,
  onSalvata
}: {
  iniziale: Editor
  onAnnulla: () => void
  onSalvata: (id: number, stagione: string) => void
}): React.JSX.Element {
  const [ed, setEd] = useState<Editor>(iniziale)
  const [lotti, setLotti] = useState<LottoDisponibile[]>([])
  const [errore, setErrore] = useState<string | null>(null)
  const [salvataggio, setSalvataggio] = useState(false)

  useEffect(() => {
    const includi = Object.keys(iniziale.restituibili).map(Number)
    window.api.agri
      .lottiDisponibili(['orzo_calibrato'], { includi })
      .then((l) =>
        setLotti(
          l.map((x) => {
            const extraKg = iniziale.restituibili[x.id] ?? 0
            const extra = extraKg ? (convertiUnita(extraKg, 'kg', x.unita_misura) ?? 0) : 0
            return { ...x, quantita_residua: x.quantita_residua + extra }
          })
        )
      )
      .catch(() => setLotti([]))
  }, [iniziale.restituibili])

  const kgDisponibili = (l: LottoDisponibile): number | null => convertiUnita(l.quantita_residua, l.unita_misura, 'kg')
  const pesoIniziale = ed.righe.reduce((s, r) => {
    const v = parseNumero(r.kg)
    return s + (v !== null && !Number.isNaN(v) ? v : 0)
  }, 0)

  const aggiornaRiga = (i: number, patch: Partial<RigaInput>): void =>
    setEd((p) => ({ ...p, righe: p.righe.map((r, j) => (j === i ? { ...r, ...patch } : r)) }))

  const salva = async (): Promise<void> => {
    if (!ed.materia_prima_id) return setErrore('Scegli il tipo di malto (la materia prima che verrà caricata).')
    if (!ed.codice.trim()) return setErrore('Inserisci il codice lotto della maltazione.')
    const input: Array<{ lotto_id: number; kg: number }> = []
    for (const r of ed.righe) {
      if (!r.lotto_id && !r.kg.trim()) continue
      const kg = parseNumero(r.kg)
      if (!r.lotto_id) return setErrore('Scegli il lotto di orzo calibrato in ogni riga.')
      if (kg === null || Number.isNaN(kg) || kg <= 0) return setErrore('Inserisci i kg di orzo per ogni lotto.')
      const l = lotti.find((x) => String(x.id) === r.lotto_id)
      const disp = l ? kgDisponibili(l) : null
      if (disp !== null && kg > disp + 1e-6) {
        return setErrore(`Il lotto ${l?.codice} ha solo ${fmtNum(disp)} kg disponibili.`)
      }
      input.push({ lotto_id: Number(r.lotto_id), kg })
    }
    if (input.length === 0) return setErrore('Aggiungi almeno un lotto di orzo calibrato.')
    setSalvataggio(true)
    setErrore(null)
    try {
      const r = await window.api.agri.maltazioneAvvia(ed.id, {
        data_inizio: ed.data_inizio,
        stagione: ed.stagione,
        materia_prima_id: Number(ed.materia_prima_id),
        codice: ed.codice,
        input,
        note: ed.note
      })
      const err = erroreDa(r)
      if (err) return setErrore(err)
      if (r.ok) onSalvata(r.id, ed.stagione)
    } catch (e) {
      setErrore(messaggioErrore(e))
    } finally {
      setSalvataggio(false)
    }
  }

  const lottiScelti = new Set(ed.righe.map((r) => r.lotto_id).filter(Boolean))

  return (
    <div className="space-y-4">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 mb-1" onClick={onAnnulla}>
          <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Annulla
        </Button>
        <h3 className="text-lg font-semibold text-foreground">{ed.id ? 'Modifica maltazione' : 'Nuova maltazione'}</h3>
        <p className="text-sm text-muted-foreground">
          L&apos;orzo scelto viene scaricato dal magazzino alla data di inizio. I parametri si compilano dopo, nella scheda.
        </p>
      </div>

      <section className={cn(cls.pannello, 'grid gap-3 p-5')}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1.6fr]">
          <CampoForm etichetta="Data di inizio" htmlFor="mal-data" obbligatorio>
            <Input id="mal-data" type="date" value={ed.data_inizio} onChange={(e) => setEd((p) => ({ ...p, data_inizio: e.target.value }))} />
          </CampoForm>
          <CampoForm etichetta="Codice lotto" htmlFor="mal-cod" obbligatorio aiuto="Il tuo formato, es. 187/2026PTL.">
            <Input id="mal-cod" value={ed.codice} onChange={(e) => setEd((p) => ({ ...p, codice: e.target.value }))} />
          </CampoForm>
          <CampoForm etichetta="Stagione" htmlFor="mal-stag" obbligatorio>
            <Input id="mal-stag" value={ed.stagione} onChange={(e) => setEd((p) => ({ ...p, stagione: e.target.value }))} />
          </CampoForm>
          <SceltaMateriaPrima
            id="mal-malto"
            categorie={['malto']}
            valore={ed.materia_prima_id}
            onChange={(v) => setEd((p) => ({ ...p, materia_prima_id: v }))}
            etichetta="Tipo di malto"
            categoriaNuova="malto"
            nomeSuggerito="Malto Pilsner aziendale"
            unitaAmmesse={['kg', 'q']}
          />
        </div>
      </section>

      <section className={cn(cls.pannello, 'grid gap-3 p-5')}>
        <h4 className="text-sm font-semibold text-foreground">Orzo calibrato in ingresso</h4>
        {lotti.length === 0 && (
          <AvvisoBox>Nessun lotto di orzo calibrato disponibile: prima registra un&apos;analisi e calibratura.</AvvisoBox>
        )}
        <div className="grid gap-2">
          {ed.righe.map((r, i) => {
            const l = lotti.find((x) => String(x.id) === r.lotto_id)
            const disp = l ? kgDisponibili(l) : null
            return (
              <div key={i} className="grid items-end gap-2 sm:grid-cols-[1fr_200px_auto]">
                <CampoForm etichetta={i === 0 ? 'Lotto (calibro)' : ''} htmlFor={`mal-lotto-${i}`}>
                  <select
                    id={`mal-lotto-${i}`}
                    className={cls.select}
                    value={r.lotto_id}
                    onChange={(e) => aggiornaRiga(i, { lotto_id: e.target.value })}
                  >
                    <option value="">Scegli il lotto…</option>
                    {lotti
                      .filter((x) => String(x.id) === r.lotto_id || !lottiScelti.has(String(x.id)))
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.codice}
                          {x.calibro ? ` · calibro ${x.calibro}` : ''} · {fmtQta(kgDisponibili(x), 'kg', 0)} disponibili
                        </option>
                      ))}
                  </select>
                </CampoForm>
                <CampoForm etichetta={i === 0 ? 'Peso orzo' : ''} htmlFor={`mal-kg-${i}`} aiuto={disp !== null ? `max ${fmtNum(disp, 0)} kg` : undefined}>
                  <InputNumero id={`mal-kg-${i}`} valore={r.kg} unita="kg" onChange={(v) => aggiornaRiga(i, { kg: v })} />
                </CampoForm>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn('h-9', disp !== null && 'mb-5')}
                  title="Togli riga"
                  disabled={ed.righe.length <= 1}
                  onClick={() => setEd((p) => ({ ...p, righe: p.righe.filter((_, j) => j !== i) }))}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="outline"
            size="sm"
            disabled={ed.righe.length >= lotti.length}
            onClick={() => setEd((p) => ({ ...p, righe: [...p.righe, { lotto_id: '', kg: '' }] }))}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Aggiungi un altro lotto
          </Button>
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Peso iniziale</div>
            <div className="text-2xl font-semibold tabular-nums text-foreground">{fmtNum(pesoIniziale)} kg</div>
          </div>
        </div>
        <CampoForm etichetta="Note" htmlFor="mal-note">
          <textarea id="mal-note" className={cls.textarea} value={ed.note} onChange={(e) => setEd((p) => ({ ...p, note: e.target.value }))} />
        </CampoForm>
      </section>

      <ErroreBox messaggio={errore} />
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onAnnulla} disabled={salvataggio}>
          Annulla
        </Button>
        <Button onClick={() => void salva()} disabled={salvataggio}>
          <Save className="mr-1.5 h-4 w-4" />
          {salvataggio ? 'Salvataggio…' : ed.id ? 'Salva modifiche' : 'Avvia maltazione'}
        </Button>
      </div>
    </div>
  )
}

// ── Dettaglio ────────────────────────────────────────────────────────────────

function DettaglioMaltazione({
  id,
  onIndietro,
  onModifica
}: {
  id: number
  onIndietro: () => void
  onModifica: (d: LavorazioneDettaglio) => void
}): React.JSX.Element {
  const [d, setD] = useState<LavorazioneDettaglio | null>(null)
  const [bozza, setBozza] = useState<BozzaParametri>(bozzaVuota)
  const [errore, setErrore] = useState<string | null>(null)
  const [messaggio, setMessaggio] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [chiusura, setChiusura] = useState<{ data_uscita: string; peso: string; scadenza: string; scadenzaToccata: boolean } | null>(null)
  const [erroreDialog, setErroreDialog] = useState<string | null>(null)
  const [conferma, setConferma] = useState<'elimina' | 'riapri' | null>(null)

  const carica = useCallback(async () => {
    try {
      const x = await window.api.agri.lavorazioneDettaglio(id)
      setD(x)
      setBozza(bozzaDaSalvati(x.gruppi, x.valori))
    } catch (e) {
      setErrore(messaggioErrore(e))
    }
  }, [id])

  useEffect(() => {
    void carica()
  }, [carica])

  // Scadenza proposta quando cambia la data di uscita (se non scelta a mano)
  useEffect(() => {
    if (!chiusura || chiusura.scadenzaToccata || !/^\d{4}-\d{2}-\d{2}$/.test(chiusura.data_uscita)) return
    let attivo = true
    window.api.agri
      .scadenzaMalto(chiusura.data_uscita)
      .then((s) => attivo && setChiusura((c) => (c && !c.scadenzaToccata ? { ...c, scadenza: s } : c)))
      .catch(() => {})
    return () => {
      attivo = false
    }
  }, [chiusura?.data_uscita, chiusura?.scadenzaToccata]) // eslint-disable-line react-hooks/exhaustive-deps

  const modificata = useMemo(() => (d ? bozzaModificata(d.gruppi, bozza, d.valori) : false), [d, bozza])

  if (!d) return <p className="text-sm text-muted-foreground">{errore ?? 'Caricamento…'}</p>

  const lottoMalto = d.output.find((o) => o.lotto_id !== null) ?? null
  const chiusa = d.stato === 'chiusa'

  const salvaParametri = async (): Promise<void> => {
    const p = payloadDaBozza(d.gruppi, bozza, d.valori)
    if (!p.ok) return setErrore(p.errore)
    setSalvando(true)
    setErrore(null)
    try {
      const r = await window.api.agri.salvaParametri(d.id, p.valori, p.date)
      const err = erroreDa(r)
      if (err) return setErrore(err)
      setMessaggio('Parametri salvati.')
      await carica()
    } catch (e) {
      setErrore(messaggioErrore(e))
    } finally {
      setSalvando(false)
    }
  }

  const apriChiusura = (): void => {
    setErroreDialog(null)
    setChiusura({
      data_uscita: d.data_fine ?? oggiIso(),
      peso: numeroInInput(lottoMalto?.quantita_kg ?? null),
      scadenza: d.data_scadenza_output ?? '',
      scadenzaToccata: !!d.data_scadenza_output
    })
  }

  const confermaChiusura = async (): Promise<void> => {
    if (!chiusura) return
    const peso = parseNumero(chiusura.peso)
    if (peso === null || Number.isNaN(peso) || peso <= 0) return setErroreDialog('Inserisci il peso finale del malto in kg.')
    setSalvando(true)
    setErroreDialog(null)
    try {
      const r = await window.api.agri.maltazioneChiudi(d.id, {
        data_uscita: chiusura.data_uscita,
        peso_finale_kg: peso,
        data_scadenza: chiusura.scadenza || null
      })
      const err = erroreDa(r)
      if (err) return setErroreDialog(err)
      setChiusura(null)
      await carica()
    } catch (e) {
      setErroreDialog(messaggioErrore(e))
    } finally {
      setSalvando(false)
    }
  }

  const eseguiConferma = async (): Promise<void> => {
    if (!conferma) return
    setSalvando(true)
    setErroreDialog(null)
    try {
      const r = conferma === 'elimina' ? await window.api.agri.lavorazioneElimina(d.id) : await window.api.agri.maltazioneRiapri(d.id)
      const err = erroreDa(r)
      if (err) return setErroreDialog(err)
      setConferma(null)
      if (conferma === 'elimina') onIndietro()
      else await carica()
    } catch (e) {
      setErroreDialog(messaggioErrore(e))
    } finally {
      setSalvando(false)
    }
  }

  const pesoFinaleLive = chiusura ? parseNumero(chiusura.peso) : null
  const resaLive =
    pesoFinaleLive && !Number.isNaN(pesoFinaleLive) && d.input_kg ? pesoFinaleLive / d.input_kg : null

  return (
    <div className="space-y-4 pb-16">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" className="-ml-2 mb-1" onClick={onIndietro}>
            <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Tutte le maltazioni
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-lg font-semibold text-foreground">Maltazione {d.codice}</h3>
            <BadgeStatoMaltazione r={d} />
          </div>
          <p className="text-sm text-muted-foreground">
            {d.materia_prima_nome} · stagione {d.stagione}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!chiusa && (
            <Button size="sm" onClick={apriChiusura}>
              <PackageCheck className="mr-1.5 h-4 w-4" /> Registra uscita e carica il malto
            </Button>
          )}
          {d.bloccata ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" title={d.bloccata}>
              <Lock className="h-3.5 w-3.5" /> Malto già usato: si modificano solo i parametri
            </span>
          ) : (
            <>
              {chiusa && (
                <>
                  <Button variant="outline" size="sm" onClick={apriChiusura}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" /> Correggi uscita
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setConferma('riapri')}>
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Riapri
                  </Button>
                </>
              )}
              <Button variant="outline" size="sm" onClick={() => onModifica(d)}>
                <Pencil className="mr-1.5 h-3.5 w-3.5" /> Modifica
              </Button>
              <Button variant="outline" size="sm" onClick={() => setConferma('elimina')}>
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Elimina
              </Button>
            </>
          )}
        </div>
      </div>

      <div className={cn(cls.pannello, 'grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4')}>
        <Valore etichetta="Inizio">{fmtData(d.data_inizio)}</Valore>
        <Valore etichetta="Peso iniziale (orzo)">{fmtQta(d.input_kg, 'kg')}</Valore>
        <Valore etichetta="Uscita">{chiusa ? fmtData(d.data_fine) : 'in corso'}</Valore>
        <Valore etichetta="Peso finale (malto)">
          {chiusa ? fmtQta(lottoMalto?.quantita_kg ?? null, 'kg') : '—'}
        </Valore>
      </div>

      {chiusa && d.rese && (
        <div className={cn(cls.pannello, 'grid gap-4 p-5 sm:grid-cols-3')}>
          <Valore etichetta="Resa di maltazione">
            <span className="text-xl font-semibold text-emerald-400">{fmtPerc(d.rese.resa_maltazione)}</span>
            <span className="block text-xs text-muted-foreground">kg malto / kg orzo calibrato</span>
          </Valore>
          <Valore etichetta="Resa complessiva">
            <span className="text-xl font-semibold text-foreground">{fmtPerc(d.rese.resa_complessiva)}</span>
            <span className="block text-xs text-muted-foreground">
              kg malto / {fmtNum(d.rese.kg_grezzo_equivalenti, 0)} kg di orzo raccolto
            </span>
          </Valore>
          <Valore etichetta="Scarto di calibratura">
            <span className="text-xl font-semibold text-foreground">{fmtPerc(d.rese.perc_scarto_calibratura)}</span>
            <span className="block text-xs text-muted-foreground">dell&apos;orzo grezzo d&apos;origine</span>
          </Valore>
          {d.rese.parziale && (
            <p className="text-xs text-amber-400 sm:col-span-3">
              Resa complessiva parziale: almeno un lotto di orzo calibrato non viene da una calibratura registrata.
            </p>
          )}
        </div>
      )}

      {chiusa && lottoMalto && (
        <AvvisoBox titolo={`Lotto ${lottoMalto.lotto_codice} in magazzino`}>
          {fmtQta(lottoMalto.quantita, lottoMalto.unita_misura)} di {d.materia_prima_nome}, caricati il {fmtData(d.data_fine)}
          {d.data_scadenza_output ? `, scadenza ${fmtData(d.data_scadenza_output)}` : ''}. Residuo{' '}
          {fmtQta(lottoMalto.lotto_residuo, lottoMalto.unita_misura)}: è disponibile per le cotte.
        </AvvisoBox>
      )}

      <section className={cls.pannello}>
        <div className="border-b border-border px-4 py-3">
          <h4 className="text-sm font-semibold text-foreground">Orzo calibrato usato</h4>
        </div>
        <table className={cls.tabella}>
          <thead className={cls.thead}>
            <tr>
              <th className={cls.th}>Lotto</th>
              <th className={cls.th}>Calibro</th>
              <th className={cls.th}>Stagione</th>
              <th className={cn(cls.th, 'text-right')}>Peso</th>
            </tr>
          </thead>
          <tbody>
            {d.input.map((i) => (
              <tr key={i.id} className={cls.riga}>
                <td className={cn(cls.td, 'text-foreground')}>{i.codice}</td>
                <td className={cls.td}>{i.calibro ?? '—'}</td>
                <td className={cls.td}>{i.stagione ?? '—'}</td>
                <td className={cn(cls.td, 'text-right tabular-nums')}>{fmtQta(i.quantita_kg, 'kg')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="space-y-2">
        <h4 className="text-sm font-semibold text-foreground">Parametri della maltazione</h4>
        <ParametriFase
          idBase="mal-par"
          gruppi={d.gruppi}
          bozza={bozza}
          onChange={(b) => {
            setMessaggio(null)
            setBozza(b)
          }}
          storici={d.valori_storici}
        />
      </section>
      {d.note && <p className="text-sm text-muted-foreground">Note: {d.note}</p>}

      <div className="sticky bottom-0 z-[5] -mx-6 border-t border-border bg-background/95 px-6 py-3 backdrop-blur">
        <div className="flex flex-wrap items-center justify-end gap-3">
          <ErroreBox messaggio={errore} />
          {messaggio && !modificata && <span className="text-sm text-emerald-400">{messaggio}</span>}
          {modificata && <span className="text-sm text-amber-400">Modifiche ai parametri non salvate</span>}
          <Button disabled={!modificata || salvando} onClick={() => void salvaParametri()}>
            <Save className="mr-1.5 h-4 w-4" /> Salva parametri
          </Button>
        </div>
      </div>

      <Dialog open={chiusura !== null} onOpenChange={(o) => (!o ? setChiusura(null) : undefined)}>
        <DialogContent className="max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{chiusa ? 'Correggi uscita' : 'Registra uscita del malto'}</DialogTitle>
            <DialogDescription>
              Il lotto {d.codice} entra in magazzino con data di carico uguale alla data di uscita e diventa disponibile
              per le cotte.
            </DialogDescription>
          </DialogHeader>
          {chiusura && (
            <div className="grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <CampoForm etichetta="Data di uscita" htmlFor="chi-data" obbligatorio>
                  <Input id="chi-data" type="date" value={chiusura.data_uscita} onChange={(e) => setChiusura({ ...chiusura, data_uscita: e.target.value })} />
                </CampoForm>
                <CampoForm etichetta="Peso finale" htmlFor="chi-peso" obbligatorio>
                  <InputNumero id="chi-peso" valore={chiusura.peso} unita="kg" onChange={(v) => setChiusura({ ...chiusura, peso: v })} />
                </CampoForm>
              </div>
              <CampoForm etichetta="Scadenza del malto" htmlFor="chi-scad" aiuto="Proposta dalle impostazioni del modulo, modificabile.">
                <Input
                  id="chi-scad"
                  type="date"
                  value={chiusura.scadenza}
                  onChange={(e) => setChiusura({ ...chiusura, scadenza: e.target.value, scadenzaToccata: true })}
                />
              </CampoForm>
              {resaLive !== null && (
                <p className="text-sm text-muted-foreground">
                  Resa di maltazione: <strong className="text-foreground">{fmtPerc(resaLive)}</strong> ({fmtNum(pesoFinaleLive)} su{' '}
                  {fmtNum(d.input_kg)} kg)
                </p>
              )}
              <ErroreBox messaggio={erroreDialog} />
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setChiusura(null)} disabled={salvando}>
              Annulla
            </Button>
            <Button onClick={() => void confermaChiusura()} disabled={salvando}>
              {chiusa ? 'Salva' : 'Carica il malto in magazzino'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfermaDialog
        aperto={conferma !== null}
        titolo={conferma === 'elimina' ? 'Eliminare la maltazione?' : 'Riaprire la maltazione?'}
        testo={
          conferma === 'elimina'
            ? "L'orzo calibrato tornerà in magazzino e, se presente, il lotto di malto verrà tolto. I parametri compilati andranno persi."
            : 'Il lotto di malto verrà tolto dal magazzino e la maltazione tornerà "in corso". I parametri restano.'
        }
        etichettaConferma={conferma === 'elimina' ? 'Elimina' : 'Riapri'}
        pericoloso={conferma === 'elimina'}
        inCorso={salvando}
        errore={erroreDialog}
        onConferma={() => void eseguiConferma()}
        onChiudi={() => setConferma(null)}
      />
    </div>
  )
}
