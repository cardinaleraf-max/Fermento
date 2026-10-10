import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Lock, Microscope, Pencil, Plus, Save, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
  type GruppoParametri,
  type LavorazioneDettaglio,
  type LavorazioneRiga,
  type LottoDisponibile
} from '@/lib/agricolo'

type RigaFrazione = { nome: string; perc: string; qta: string; peso: string; scarto: boolean }

type Editor = {
  id: number | null
  lotto_id: string
  data: string
  stagione: string
  quantita: string
  quantitaToccata: boolean
  materia_prima_id: string
  frazioni: RigaFrazione[]
  note: string
  /** In modifica: quantità del lotto grezzo già scaricata da questa calibratura (torna disponibile). */
  restituibile: { lotto_id: number; quantita: number } | null
}

type Vista = { tipo: 'elenco' } | { tipo: 'editor' } | { tipo: 'dettaglio'; id: number }

function n(s: string): number {
  const v = parseNumero(s)
  return v === null || Number.isNaN(v) ? 0 : v
}

function arrot(x: number, dec = 3): number {
  const f = 10 ** dec
  return Math.round((x + Number.EPSILON) * f) / f
}

export default function AnalisiCalibratura(): React.JSX.Element {
  const agricolo = useAgricolo()
  const [vista, setVista] = useState<Vista>({ tipo: 'elenco' })
  const [stagione, setStagione] = useState(agricolo.stagione_corrente)
  const [righe, setRighe] = useState<LavorazioneRiga[]>([])
  const [gruppi, setGruppi] = useState<GruppoParametri[]>([])
  const [caricamento, setCaricamento] = useState(true)
  const [errore, setErrore] = useState<string | null>(null)

  useEffect(() => {
    if (!stagione && agricolo.stagione_corrente) setStagione(agricolo.stagione_corrente)
  }, [agricolo.stagione_corrente, stagione])

  const carica = useCallback(async () => {
    try {
      const [r, g] = await Promise.all([
        window.api.agri.lavorazioniLista({ tipo: 'calibratura', stagione: stagione || null }),
        window.api.agri.parametriConfig('calibratura')
      ])
      setRighe(r)
      setGruppi(g)
    } catch (e) {
      setErrore(messaggioErrore(e, 'Impossibile caricare le calibrature'))
    } finally {
      setCaricamento(false)
    }
  }, [stagione])

  useEffect(() => {
    void carica()
  }, [carica])

  const [editorIniziale, setEditorIniziale] = useState<{ editor: Editor; bozza: BozzaParametri } | null>(null)

  const nuova = async (): Promise<void> => {
    try {
      const imp = await window.api.agri.impostazioni()
      setEditorIniziale({
        editor: {
          id: null,
          lotto_id: '',
          data: oggiIso(),
          stagione: agricolo.stagione_corrente,
          quantita: '',
          quantitaToccata: false,
          materia_prima_id: '',
          frazioni: imp.frazioni_default.map((f) => ({ nome: f.nome, perc: '', qta: '', peso: '', scarto: f.scarto })),
          note: '',
          restituibile: null
        },
        bozza: bozzaVuota
      })
      setVista({ tipo: 'editor' })
    } catch (e) {
      setErrore(messaggioErrore(e))
    }
  }

  const modifica = (d: LavorazioneDettaglio): void => {
    const ingresso = d.input[0]
    setEditorIniziale({
      editor: {
        id: d.id,
        lotto_id: ingresso ? String(ingresso.lotto_id) : '',
        data: d.data_inizio,
        stagione: d.stagione,
        quantita: numeroInInput(ingresso?.quantita ?? null),
        quantitaToccata: true,
        materia_prima_id: d.materia_prima_id !== null ? String(d.materia_prima_id) : '',
        frazioni: d.output.map((o) => ({
          nome: o.nome ?? '',
          perc: numeroInInput(o.percentuale),
          qta: '',
          peso: numeroInInput(o.peso_specifico_gl),
          scarto: o.scarto
        })),
        note: d.note ?? '',
        restituibile: ingresso ? { lotto_id: ingresso.lotto_id, quantita: ingresso.quantita } : null
      },
      bozza: bozzaDaSalvati(d.gruppi, d.valori)
    })
    setVista({ tipo: 'editor' })
  }

  if (vista.tipo === 'editor' && editorIniziale) {
    return (
      <EditorCalibratura
        iniziale={editorIniziale.editor}
        bozzaIniziale={editorIniziale.bozza}
        gruppi={gruppi}
        onAnnulla={() => setVista(editorIniziale.editor.id ? { tipo: 'dettaglio', id: editorIniziale.editor.id } : { tipo: 'elenco' })}
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
      <DettaglioCalibratura
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
        titolo="Analisi e calibratura"
        sottotitolo="Analisi del lotto di orzo grezzo e divisione in frazioni per calibro. Le frazioni buone diventano lotti di orzo calibrato, pronti per la maltazione."
        azioni={
          <>
            <FiltroStagione valore={stagione} onChange={setStagione} />
            <Button size="sm" onClick={() => void nuova()}>
              <Plus className="mr-1.5 h-4 w-4" /> Nuova analisi e calibratura
            </Button>
          </>
        }
      />
      <ErroreBox messaggio={errore} />
      {caricamento ? (
        <p className="text-sm text-muted-foreground">Caricamento…</p>
      ) : righe.length === 0 ? (
        <StatoVuoto
          icona={Microscope}
          titolo={stagione ? `Nessuna calibratura nella stagione ${stagione}` : 'Nessuna calibratura registrata'}
          testo="Parti da un lotto di orzo grezzo (creato con una raccolta o caricato in magazzino): registri l'analisi e le percentuali delle frazioni."
          azione={
            <Button size="sm" onClick={() => void nuova()}>
              <Plus className="mr-1.5 h-4 w-4" /> Nuova analisi e calibratura
            </Button>
          }
        />
      ) : (
        <div className={cls.tabellaWrap}>
          <table className={cn(cls.tabella, 'min-w-[760px]')}>
            <thead className={cls.thead}>
              <tr>
                <th className={cls.th}>Data</th>
                <th className={cls.th}>Lotto di orzo grezzo</th>
                <th className={cls.th}>Analisi</th>
                <th className={cls.th}>Frazioni in magazzino</th>
              </tr>
            </thead>
            <tbody>
              {righe.map((r) => (
                <tr key={r.id} className={cls.rigaCliccabile} onClick={() => setVista({ tipo: 'dettaglio', id: r.id })}>
                  <td className={cn(cls.td, 'whitespace-nowrap tabular-nums')}>{fmtData(r.data_inizio)}</td>
                  <td className={cls.td}>
                    <span className="font-medium text-foreground">{r.input_descrizione}</span>
                  </td>
                  <td className={cn(cls.td, 'text-muted-foreground')}>{r.riepilogo_parametri || '—'}</td>
                  <td className={cls.td}>{r.output_descrizione || '—'}</td>
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

function EditorCalibratura({
  iniziale,
  bozzaIniziale,
  gruppi,
  onAnnulla,
  onSalvata
}: {
  iniziale: Editor
  bozzaIniziale: BozzaParametri
  gruppi: GruppoParametri[]
  onAnnulla: () => void
  onSalvata: (id: number, stagione: string) => void
}): React.JSX.Element {
  const [ed, setEd] = useState<Editor>(iniziale)
  const [bozza, setBozza] = useState<BozzaParametri>(bozzaIniziale)
  const [lotti, setLotti] = useState<LottoDisponibile[]>([])
  const [unitaDest, setUnitaDest] = useState<string | null>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [salvataggio, setSalvataggio] = useState(false)

  useEffect(() => {
    const includi = iniziale.restituibile ? [iniziale.restituibile.lotto_id] : []
    window.api.agri
      .lottiDisponibili(['orzo_grezzo'], { includi })
      .then((l) =>
        setLotti(
          l.map((x) =>
            iniziale.restituibile && x.id === iniziale.restituibile.lotto_id
              ? { ...x, quantita_residua: x.quantita_residua + iniziale.restituibile.quantita }
              : x
          )
        )
      )
      .catch(() => setLotti([]))
  }, [iniziale.restituibile])

  const lotto = lotti.find((l) => String(l.id) === ed.lotto_id) ?? null
  const unita = lotto?.unita_misura ?? ''
  const Q = n(ed.quantita)

  // Quantità di ogni frazione sempre ricalcolata dalla percentuale
  const frazioni = useMemo(
    () => ed.frazioni.map((f) => ({ ...f, qtaCalcolata: f.perc.trim() === '' ? null : arrot((Q * n(f.perc)) / 100) })),
    [ed.frazioni, Q]
  )
  const somma = arrot(
    ed.frazioni.reduce((s, f) => s + n(f.perc), 0),
    4
  )
  const calo = Math.max(0, arrot(100 - somma, 4))
  const utile = arrot(frazioni.filter((f) => !f.scarto).reduce((s, f) => s + (f.qtaCalcolata ?? 0), 0))
  const scarto = arrot(frazioni.filter((f) => f.scarto).reduce((s, f) => s + (f.qtaCalcolata ?? 0), 0))

  const aggiornaFrazione = (i: number, patch: Partial<RigaFrazione>): void =>
    setEd((p) => ({ ...p, frazioni: p.frazioni.map((f, j) => (j === i ? { ...f, ...patch } : f)) }))

  const daQuantita = (i: number, testo: string): void => {
    const q = parseNumero(testo)
    if (q === null || Number.isNaN(q) || Q <= 0) {
      aggiornaFrazione(i, { qta: testo })
      return
    }
    aggiornaFrazione(i, { qta: testo, perc: numeroInInput(arrot((q / Q) * 100, 4)) })
  }

  const scegliLotto = (id: string): void => {
    const l = lotti.find((x) => String(x.id) === id)
    setEd((p) => ({
      ...p,
      lotto_id: id,
      quantita: !p.quantitaToccata && l ? numeroInInput(l.quantita_residua) : p.quantita,
      frazioni: p.frazioni.map((f) => ({ ...f, qta: '' }))
    }))
  }

  const salva = async (): Promise<void> => {
    if (!ed.lotto_id) return setErrore('Scegli il lotto di orzo grezzo.')
    if (!(Q > 0)) return setErrore('Inserisci la quantità lavorata.')
    if (lotto && Q > lotto.quantita_residua + 1e-9) {
      return setErrore(`Il lotto ha solo ${fmtQta(lotto.quantita_residua, unita)} disponibili.`)
    }
    if (!ed.materia_prima_id) return setErrore('Scegli la materia prima "Orzo calibrato" in cui caricare le frazioni.')
    for (const f of ed.frazioni) {
      const p = parseNumero(f.perc)
      if (f.perc.trim() !== '' && (p === null || Number.isNaN(p))) return setErrore(`Percentuale non valida per "${f.nome}".`)
      const ps = parseNumero(f.peso)
      if (f.peso.trim() !== '' && (ps === null || Number.isNaN(ps))) return setErrore(`Peso specifico non valido per "${f.nome}".`)
    }
    const parametri = payloadDaBozza(gruppi, bozza, iniziale.id ? undefined : { valori: {}, date: {} })
    if (!parametri.ok) return setErrore(parametri.errore)
    setSalvataggio(true)
    setErrore(null)
    try {
      const r = await window.api.agri.calibraturaSalva(ed.id, {
        lotto_id: Number(ed.lotto_id),
        data: ed.data,
        stagione: ed.stagione,
        quantita: Q,
        materia_prima_id: Number(ed.materia_prima_id),
        frazioni: ed.frazioni
          .filter((f) => f.nome.trim() !== '' || f.perc.trim() !== '')
          .map((f) => ({
            nome: f.nome,
            percentuale: n(f.perc),
            scarto: f.scarto,
            peso_specifico_gl: f.peso.trim() === '' ? null : n(f.peso)
          })),
        note: ed.note
      })
      const err = erroreDa(r)
      if (err) return setErrore(err)
      if (!r.ok) return
      // Analisi: in modifica si inviano anche i campi svuotati
      const salvati = iniziale.id ? (await window.api.agri.lavorazioneDettaglio(r.id)).valori : { valori: {}, date: {} }
      const par = payloadDaBozza(gruppi, bozza, salvati)
      if (par.ok && (Object.keys(par.valori).length > 0 || Object.keys(par.date).length > 0)) {
        const rp = await window.api.agri.salvaParametri(r.id, par.valori, par.date)
        const ep = erroreDa(rp)
        if (ep) return setErrore(`Calibratura salvata, ma l'analisi no: ${ep}`)
      }
      onSalvata(r.id, ed.stagione)
    } catch (e) {
      setErrore(messaggioErrore(e))
    } finally {
      setSalvataggio(false)
    }
  }

  const codiceGrezzo = lotto?.codice || ''

  return (
    <div className="space-y-4">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 mb-1" onClick={onAnnulla}>
          <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Annulla
        </Button>
        <h3 className="text-lg font-semibold text-foreground">
          {ed.id ? 'Modifica analisi e calibratura' : 'Nuova analisi e calibratura'}
        </h3>
      </div>

      <section className={cn(cls.pannello, 'grid gap-3 p-5')}>
        <h4 className="text-sm font-semibold text-foreground">1. Lotto di orzo grezzo</h4>
        <div className="grid gap-3 lg:grid-cols-[2fr_1fr_1fr_1fr]">
          <CampoForm etichetta="Lotto" htmlFor="cal-lotto" obbligatorio>
            <select id="cal-lotto" className={cls.select} value={ed.lotto_id} onChange={(e) => scegliLotto(e.target.value)}>
              <option value="">{lotti.length === 0 ? 'Nessun lotto di orzo grezzo disponibile' : 'Scegli…'}</option>
              {lotti.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.codice || `#${l.id}`} — {l.materia_prima_nome} · {fmtQta(l.quantita_residua, l.unita_misura)}
                  {l.stagione ? ` · ${l.stagione}` : ''}
                </option>
              ))}
            </select>
          </CampoForm>
          <CampoForm etichetta="Quantità lavorata" htmlFor="cal-q" obbligatorio aiuto={lotto ? `Disponibili ${fmtQta(lotto.quantita_residua, unita)}` : undefined}>
            <InputNumero
              id="cal-q"
              valore={ed.quantita}
              unita={unita || null}
              onChange={(v) =>
                setEd((p) => ({
                  ...p,
                  quantita: v,
                  quantitaToccata: true,
                  // le quantità scritte a mano si riallineano alle percentuali
                  frazioni: p.frazioni.map((f) => ({ ...f, qta: '' }))
                }))
              }
            />
          </CampoForm>
          <CampoForm etichetta="Data" htmlFor="cal-data" obbligatorio>
            <Input id="cal-data" type="date" value={ed.data} onChange={(e) => setEd((p) => ({ ...p, data: e.target.value }))} />
          </CampoForm>
          <CampoForm etichetta="Stagione" htmlFor="cal-stag" obbligatorio>
            <Input id="cal-stag" value={ed.stagione} onChange={(e) => setEd((p) => ({ ...p, stagione: e.target.value }))} />
          </CampoForm>
        </div>
        {lotti.length === 0 && (
          <AvvisoBox>
            Per calibrare serve un lotto di orzo grezzo: registralo con una raccolta, oppure caricalo nel Magazzino materie
            prime con la categoria “Orzo grezzo”.
          </AvvisoBox>
        )}
      </section>

      <section className={cn(cls.pannello, 'grid gap-3 p-5')}>
        <h4 className="text-sm font-semibold text-foreground">2. Analisi</h4>
        <ParametriFase idBase="cal-par" gruppi={gruppi} bozza={bozza} onChange={setBozza} />
      </section>

      <section className={cn(cls.pannello, 'grid gap-3 p-5')}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h4 className="text-sm font-semibold text-foreground">3. Calibratura</h4>
          <p className="text-xs text-muted-foreground">Inserisci la percentuale oppure la quantità: l&apos;altra si calcola da sola.</p>
        </div>
        <div className="overflow-x-auto">
          <table className={cn(cls.tabella, 'min-w-[680px]')}>
            <thead className={cls.thead}>
              <tr>
                <th className={cls.th}>Frazione (calibro)</th>
                <th className={cls.th}>%</th>
                <th className={cls.th}>Quantità</th>
                <th className={cls.th}>Peso specifico</th>
                <th className={cls.th}>Scarto</th>
                <th className={cls.th} />
              </tr>
            </thead>
            <tbody>
              {frazioni.map((f, i) => (
                <tr key={i} className={cn(cls.riga, f.scarto && 'bg-red-500/5')}>
                  <td className="px-2 py-1.5">
                    <Input aria-label="Frazione" value={f.nome} onChange={(e) => aggiornaFrazione(i, { nome: e.target.value })} />
                  </td>
                  <td className="w-32 px-2 py-1.5">
                    <InputNumero valore={f.perc} unita="%" onChange={(v) => aggiornaFrazione(i, { perc: v, qta: '' })} />
                  </td>
                  <td className="w-40 px-2 py-1.5">
                    <InputNumero
                      valore={f.qta !== '' ? f.qta : f.qtaCalcolata !== null ? numeroInInput(f.qtaCalcolata) : ''}
                      unita={unita || null}
                      disabled={!(Q > 0)}
                      onChange={(v) => daQuantita(i, v)}
                    />
                  </td>
                  <td className="w-36 px-2 py-1.5">
                    <InputNumero valore={f.peso} unita="g/L" onChange={(v) => aggiornaFrazione(i, { peso: v })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-red-500"
                        checked={f.scarto}
                        onChange={(e) => aggiornaFrazione(i, { scarto: e.target.checked })}
                      />
                      {f.scarto ? <span className="text-red-400">scarto</span> : <span className="text-muted-foreground">no</span>}
                    </label>
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      title="Rimuovi frazione"
                      disabled={ed.frazioni.length <= 1}
                      onClick={() => setEd((p) => ({ ...p, frazioni: p.frazioni.filter((_, j) => j !== i) }))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEd((p) => ({ ...p, frazioni: [...p.frazioni, { nome: '', perc: '', qta: '', peso: '', scarto: false }] }))}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Aggiungi frazione
          </Button>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span className={cn(somma > 100 + 1e-6 ? 'font-semibold text-red-400' : 'text-foreground')}>
              Totale {fmtNum(somma)}%
            </span>
            <span className="text-muted-foreground">
              Calo non attribuito {fmtNum(calo)}%{Q > 0 ? ` (${fmtQta(arrot((Q * calo) / 100), unita)})` : ''}
            </span>
            <span className="text-emerald-400">Utile {fmtQta(utile, unita)}</span>
            <span className="text-red-400">Scarto {fmtQta(scarto, unita)}</span>
          </div>
        </div>
        {somma > 100 + 1e-6 && <ErroreBox messaggio="Le percentuali superano il 100%: correggile prima di salvare." />}
        <div className="grid gap-3 sm:grid-cols-2">
          <SceltaMateriaPrima
            id="cal-dest"
            categorie={['orzo_calibrato']}
            valore={ed.materia_prima_id}
            onChange={(v) => setEd((p) => ({ ...p, materia_prima_id: v }))}
            etichetta="Carica le frazioni come"
            categoriaNuova="orzo_calibrato"
            nomeSuggerito="Orzo calibrato"
            unitaAmmesse={['q', 'kg']}
            onUnita={setUnitaDest}
          />
          <CampoForm etichetta="Note" htmlFor="cal-note">
            <Input id="cal-note" value={ed.note} onChange={(e) => setEd((p) => ({ ...p, note: e.target.value }))} />
          </CampoForm>
        </div>
      </section>

      <section className={cn(cls.pannello, 'grid gap-2 p-5')}>
        <h4 className="text-sm font-semibold text-foreground">4. Lotti che verranno creati in magazzino</h4>
        {!lotto || !(Q > 0) ? (
          <p className="text-sm text-muted-foreground">Scegli il lotto e la quantità per vedere l&apos;anteprima.</p>
        ) : !frazioni.some((f) => !f.scarto && (f.qtaCalcolata ?? 0) > 0) ? (
          <p className="text-sm text-muted-foreground">Inserisci le percentuali delle frazioni per vedere i lotti.</p>
        ) : (
          <ul className="grid gap-1 text-sm">
            {frazioni
              .filter((f) => !f.scarto && (f.qtaCalcolata ?? 0) > 0)
              .map((f, i) => {
                const qDest = unitaDest ? convertiUnita(f.qtaCalcolata ?? 0, unita, unitaDest) : null
                return (
                  <li key={i} className="flex flex-wrap items-center gap-2">
                    <BadgeTono tono="ambra">Calibro {f.nome}</BadgeTono>
                    <span className="font-medium text-foreground">
                      {codiceGrezzo} {f.nome}
                    </span>
                    <span className="text-muted-foreground">
                      {qDest !== null && unitaDest ? fmtQta(qDest, unitaDest) : fmtQta(f.qtaCalcolata, unita)}
                    </span>
                  </li>
                )
              })}
            {scarto > 0 && (
              <li className="text-muted-foreground">
                Scarto registrato ma non messo in magazzino: {fmtQta(scarto, unita)}.
              </li>
            )}
          </ul>
        )}
      </section>

      <ErroreBox messaggio={errore} />
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onAnnulla} disabled={salvataggio}>
          Annulla
        </Button>
        <Button onClick={() => void salva()} disabled={salvataggio}>
          <Save className="mr-1.5 h-4 w-4" />
          {salvataggio ? 'Salvataggio…' : 'Salva analisi e calibratura'}
        </Button>
      </div>
    </div>
  )
}

// ── Dettaglio ────────────────────────────────────────────────────────────────

function DettaglioCalibratura({
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
  const [conferma, setConferma] = useState(false)
  const [erroreConferma, setErroreConferma] = useState<string | null>(null)

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

  if (!d) {
    return <p className="text-sm text-muted-foreground">{errore ?? 'Caricamento…'}</p>
  }

  const ingresso = d.input[0]
  const unitaIn = ingresso?.unita_misura ?? ''
  const kgIn = ingresso?.quantita_kg ?? null
  const scarto = d.output.filter((o) => o.scarto)
  const kgScarto = scarto.reduce((s, o) => s + (o.quantita_kg ?? 0), 0)
  const kgUtile = d.output.filter((o) => !o.scarto).reduce((s, o) => s + (o.quantita_kg ?? 0), 0)
  const modificata = bozzaModificata(d.gruppi, bozza, d.valori)

  const salvaAnalisi = async (): Promise<void> => {
    const p = payloadDaBozza(d.gruppi, bozza, d.valori)
    if (!p.ok) return setErrore(p.errore)
    setSalvando(true)
    setErrore(null)
    try {
      const r = await window.api.agri.salvaParametri(d.id, p.valori, p.date)
      const err = erroreDa(r)
      if (err) return setErrore(err)
      setMessaggio('Analisi salvata.')
      await carica()
    } catch (e) {
      setErrore(messaggioErrore(e))
    } finally {
      setSalvando(false)
    }
  }

  const elimina = async (): Promise<void> => {
    setSalvando(true)
    setErroreConferma(null)
    try {
      const r = await window.api.agri.lavorazioneElimina(d.id)
      const err = erroreDa(r)
      if (err) return setErroreConferma(err)
      setConferma(false)
      onIndietro()
    } catch (e) {
      setErroreConferma(messaggioErrore(e))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" className="-ml-2 mb-1" onClick={onIndietro}>
            <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Tutte le calibrature
          </Button>
          <h3 className="text-lg font-semibold text-foreground">Analisi e calibratura · lotto {d.codice}</h3>
          <p className="text-sm text-muted-foreground">
            {fmtData(d.data_inizio)} · stagione {d.stagione}
          </p>
        </div>
        <div className="flex gap-2">
          {d.bloccata ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" title={d.bloccata}>
              <Lock className="h-3.5 w-3.5" /> Frazioni già usate: si possono modificare solo le analisi
            </span>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => onModifica(d)}>
                <Pencil className="mr-1.5 h-3.5 w-3.5" /> Modifica
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setErroreConferma(null)
                  setConferma(true)
                }}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Elimina
              </Button>
            </>
          )}
        </div>
      </div>

      <div className={cn(cls.pannello, 'grid gap-4 p-5 sm:grid-cols-4')}>
        <Valore etichetta="Lotto grezzo">{ingresso ? `${ingresso.codice} · ${ingresso.materia_prima_nome}` : '—'}</Valore>
        <Valore etichetta="Quantità lavorata">
          {ingresso ? fmtQta(ingresso.quantita, unitaIn) : '—'}
          {kgIn !== null && unitaIn !== 'kg' && <span className="text-muted-foreground"> ({fmtNum(kgIn, 0)} kg)</span>}
        </Valore>
        <Valore etichetta="Scarto di calibratura">{kgIn ? fmtPerc(kgScarto / kgIn) : '—'}</Valore>
        <Valore etichetta="Calo non attribuito">{kgIn ? fmtPerc(Math.max(0, kgIn - kgUtile - kgScarto) / kgIn) : '—'}</Valore>
      </div>

      <section className={cn(cls.pannello, 'grid gap-3 p-5')}>
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-foreground">Analisi</h4>
          {modificata && <span className="text-xs text-amber-400">Modifiche non salvate</span>}
        </div>
        <ParametriFase idBase="dcal-par" gruppi={d.gruppi} bozza={bozza} onChange={(b) => {
          setMessaggio(null)
          setBozza(b)
        }} storici={d.valori_storici} />
        <ErroreBox messaggio={errore} />
        <div className="flex items-center justify-end gap-3">
          {messaggio && <span className="text-sm text-emerald-400">{messaggio}</span>}
          <Button size="sm" disabled={!modificata || salvando} onClick={() => void salvaAnalisi()}>
            <Save className="mr-1.5 h-3.5 w-3.5" /> Salva analisi
          </Button>
        </div>
      </section>

      <section className={cls.pannello}>
        <div className="border-b border-border px-4 py-3">
          <h4 className="text-sm font-semibold text-foreground">Frazioni</h4>
        </div>
        <div className="overflow-x-auto">
          <table className={cn(cls.tabella, 'min-w-[680px]')}>
            <thead className={cls.thead}>
              <tr>
                <th className={cls.th}>Frazione</th>
                <th className={cn(cls.th, 'text-right')}>%</th>
                <th className={cn(cls.th, 'text-right')}>Quantità</th>
                <th className={cn(cls.th, 'text-right')}>Peso specifico</th>
                <th className={cls.th}>Lotto in magazzino</th>
              </tr>
            </thead>
            <tbody>
              {d.output.map((o) => (
                <tr key={o.id} className={cn(cls.riga, o.scarto && 'bg-red-500/5')}>
                  <td className={cls.td}>
                    {o.nome} {o.scarto && <BadgeTono tono="rosso">scarto</BadgeTono>}
                  </td>
                  <td className={cn(cls.td, 'text-right tabular-nums')}>{fmtNum(o.percentuale)}%</td>
                  <td className={cn(cls.td, 'text-right tabular-nums')}>{fmtQta(o.quantita, o.unita_misura)}</td>
                  <td className={cn(cls.td, 'text-right tabular-nums')}>
                    {o.peso_specifico_gl !== null ? `${fmtNum(o.peso_specifico_gl)} g/L` : '—'}
                  </td>
                  <td className={cls.td}>
                    {o.lotto_id ? (
                      <>
                        <span className="font-medium text-foreground">{o.lotto_codice}</span>
                        <span className="text-muted-foreground"> · residuo {fmtQta(o.lotto_residuo, o.unita_misura)}</span>
                        {o.uso_a_valle && <div className="text-xs text-amber-400">{o.uso_a_valle}</div>}
                      </>
                    ) : (
                      <span className="text-muted-foreground">{o.scarto ? 'non a magazzino' : '—'}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {d.note && <p className="text-sm text-muted-foreground">Note: {d.note}</p>}

      <ConfermaDialog
        aperto={conferma}
        titolo="Eliminare questa calibratura?"
        testo="I lotti di orzo calibrato creati verranno tolti dal magazzino e la quantità tornerà nel lotto di orzo grezzo. Le analisi verranno perse."
        etichettaConferma="Elimina"
        pericoloso
        inCorso={salvando}
        errore={erroreConferma}
        onConferma={() => void elimina()}
        onChiudi={() => setConferma(false)}
      />
    </div>
  )
}
