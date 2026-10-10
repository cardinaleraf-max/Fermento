import { useCallback, useEffect, useMemo, useState } from 'react'
import { Boxes, PackagePlus, Pencil, Plus, Trash2 } from 'lucide-react'
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
import { cn } from '@/lib/utils'
import {
  CATEGORIE_INPUT_AGRICOLI,
  ETICHETTE_UNITA,
  erroreDa,
  etichettaCategoria,
  fmtData,
  fmtNum,
  fmtQta,
  isCategoriaInputAgricolo,
  messaggioErrore,
  numeroInInput,
  oggiIso,
  parseNumero,
  type CategoriaInputAgricolo
} from '@/lib/agricolo'

type Prodotto = Awaited<ReturnType<typeof window.api.mp.lista>>[number]
type Lotto = Awaited<ReturnType<typeof window.api.mp.lotti>>[number]

type Filtro = 'tutti' | CategoriaInputAgricolo

const FILTRI: Array<{ valore: Filtro; etichetta: string }> = [
  { valore: 'tutti', etichetta: 'Tutti' },
  { valore: 'semente', etichetta: 'Sementi' },
  { valore: 'concime', etichetta: 'Concimi' },
  { valore: 'fitofarmaco', etichetta: 'Fitofarmaci' },
  { valore: 'input_altro', etichetta: 'Altro' }
]

const UNITA_INPUT = ['kg', 'q', 'g', 'L'] as const

type ProdottoForm = {
  nome: string
  categoria: CategoriaInputAgricolo
  unita: string
  fornitore: string
  soglia: string
  note: string
  numero_registrazione: string
  principio_attivo: string
  carenza: string
}

const prodottoVuoto = (categoria: CategoriaInputAgricolo): ProdottoForm => ({
  nome: '',
  categoria,
  unita: categoria === 'fitofarmaco' ? 'L' : 'kg',
  fornitore: '',
  soglia: '',
  note: '',
  numero_registrazione: '',
  principio_attivo: '',
  carenza: ''
})

type CaricoForm = {
  codice: string
  data_carico: string
  scadenza: string
  quantita: string
  note: string
}
type LottoForm = { codice: string; scadenza: string; residuo: string; note: string }

function tonoCategoria(c: string): 'ambra' | 'verde' | 'rosso' | 'grigio' {
  if (c === 'semente') return 'ambra'
  if (c === 'concime') return 'verde'
  if (c === 'fitofarmaco') return 'rosso'
  return 'grigio'
}

export default function InputAgricoli(): React.JSX.Element {
  const [prodotti, setProdotti] = useState<Prodotto[]>([])
  const [lotti, setLotti] = useState<Lotto[]>([])
  const [filtro, setFiltro] = useState<Filtro>('tutti')
  const [selezionatoId, setSelezionatoId] = useState<number | null>(null)
  const [caricamento, setCaricamento] = useState(true)
  const [errore, setErrore] = useState<string | null>(null)

  const [prodottoDialog, setProdottoDialog] = useState<{ id: number | null } | null>(null)
  const [prodottoForm, setProdottoForm] = useState<ProdottoForm>(prodottoVuoto('semente'))
  const [caricoAperto, setCaricoAperto] = useState(false)
  const [caricoForm, setCaricoForm] = useState<CaricoForm>({
    codice: '',
    data_carico: oggiIso(),
    scadenza: '',
    quantita: '',
    note: ''
  })
  const [lottoDialog, setLottoDialog] = useState<Lotto | null>(null)
  const [lottoForm, setLottoForm] = useState<LottoForm>({
    codice: '',
    scadenza: '',
    residuo: '',
    note: ''
  })
  const [erroreDialog, setErroreDialog] = useState<string | null>(null)
  const [salvataggio, setSalvataggio] = useState(false)
  const [conferma, setConferma] = useState<
    { tipo: 'prodotto'; p: Prodotto } | { tipo: 'lotto'; l: Lotto } | null
  >(null)
  const [erroreConferma, setErroreConferma] = useState<string | null>(null)

  const caricaProdotti = useCallback(async () => {
    try {
      const lista = (await window.api.mp.lista()).filter((m) =>
        isCategoriaInputAgricolo(m.categoria)
      )
      setProdotti(lista)
      setSelezionatoId((att) =>
        att !== null && lista.some((p) => p.id === att) ? att : (lista[0]?.id ?? null)
      )
    } catch (e) {
      setErrore(messaggioErrore(e, 'Impossibile caricare il magazzino'))
    } finally {
      setCaricamento(false)
    }
  }, [])

  const caricaLotti = useCallback(async () => {
    if (selezionatoId === null) {
      setLotti([])
      return
    }
    try {
      setLotti(await window.api.mp.lotti(selezionatoId))
    } catch {
      setLotti([])
    }
  }, [selezionatoId])

  useEffect(() => {
    void caricaProdotti()
  }, [caricaProdotti])
  useEffect(() => {
    void caricaLotti()
  }, [caricaLotti])

  const visibili = useMemo(
    () => prodotti.filter((p) => filtro === 'tutti' || p.categoria === filtro),
    [prodotti, filtro]
  )
  const selezionato = prodotti.find((p) => p.id === selezionatoId) ?? null

  // ── Prodotto ───────────────────────────────────────────────────────────────

  const apriProdotto = (p: Prodotto | null): void => {
    setErroreDialog(null)
    setProdottoForm(
      p
        ? {
            nome: p.nome,
            categoria: (isCategoriaInputAgricolo(p.categoria)
              ? p.categoria
              : 'input_altro') as CategoriaInputAgricolo,
            unita: p.unita_misura,
            fornitore: p.fornitore_preferito ?? '',
            soglia: numeroInInput(p.soglia_riordino_fissa),
            note: p.note ?? '',
            numero_registrazione: p.numero_registrazione ?? '',
            principio_attivo: p.principio_attivo ?? '',
            carenza: p.tempo_carenza_giorni !== null ? String(p.tempo_carenza_giorni) : ''
          }
        : prodottoVuoto(filtro === 'tutti' ? 'semente' : filtro)
    )
    setProdottoDialog({ id: p?.id ?? null })
  }

  const salvaProdotto = async (): Promise<void> => {
    if (!prodottoDialog) return
    const f = prodottoForm
    if (!f.nome.trim()) {
      setErroreDialog('Il nome del prodotto è obbligatorio.')
      return
    }
    const soglia = parseNumero(f.soglia)
    if (soglia !== null && (Number.isNaN(soglia) || soglia < 0)) {
      setErroreDialog('Soglia di riordino: inserisci un numero (o lascia vuoto).')
      return
    }
    const fito = f.categoria === 'fitofarmaco'
    const carenza = f.carenza.trim() === '' ? null : Number(f.carenza.trim())
    if (fito && carenza !== null && (!Number.isInteger(carenza) || carenza < 0)) {
      setErroreDialog('Tempo di carenza: inserisci un numero intero di giorni.')
      return
    }
    setSalvataggio(true)
    setErroreDialog(null)
    try {
      const dati = {
        nome: f.nome.trim(),
        categoria: f.categoria,
        unita_misura: f.unita,
        soglia_riordino_fissa: soglia,
        soglia_riordino_dinamica_cotte: null,
        fornitore_preferito: f.fornitore.trim() || null,
        note: f.note.trim() || null,
        // I dati del fitofarmaco si inviano sempre da qui (svuotati se la categoria non lo è).
        numero_registrazione: fito ? f.numero_registrazione : null,
        principio_attivo: fito ? f.principio_attivo : null,
        tempo_carenza_giorni: fito ? carenza : null
      }
      if (prodottoDialog.id === null) {
        const r = await window.api.mp.crea(dati)
        setSelezionatoId(r.id)
      } else {
        await window.api.mp.aggiorna(prodottoDialog.id, dati)
      }
      setProdottoDialog(null)
      await caricaProdotti()
    } catch (e) {
      setErroreDialog(messaggioErrore(e))
    } finally {
      setSalvataggio(false)
    }
  }

  // ── Lotti ──────────────────────────────────────────────────────────────────

  const apriCarico = (): void => {
    setErroreDialog(null)
    setCaricoForm({ codice: '', data_carico: oggiIso(), scadenza: '', quantita: '', note: '' })
    setCaricoAperto(true)
  }

  const salvaCarico = async (): Promise<void> => {
    if (!selezionato) return
    const q = parseNumero(caricoForm.quantita)
    if (!caricoForm.codice.trim())
      return setErroreDialog('Il codice lotto è obbligatorio (quello scritto sulla confezione).')
    if (!caricoForm.data_carico) return setErroreDialog('La data di carico è obbligatoria.')
    if (q === null || Number.isNaN(q) || q <= 0)
      return setErroreDialog('Inserisci una quantità maggiore di zero.')
    setSalvataggio(true)
    setErroreDialog(null)
    try {
      await window.api.mp.carico({
        materia_prima_id: selezionato.id,
        fornitore_id: null,
        lotto_fornitore: caricoForm.codice.trim(),
        data_carico: caricoForm.data_carico,
        data_scadenza: caricoForm.scadenza || null,
        quantita_iniziale: q,
        note: caricoForm.note.trim() || null
      })
      setCaricoAperto(false)
      await Promise.all([caricaProdotti(), caricaLotti()])
    } catch (e) {
      setErroreDialog(messaggioErrore(e))
    } finally {
      setSalvataggio(false)
    }
  }

  const apriLotto = (l: Lotto): void => {
    setErroreDialog(null)
    setLottoForm({
      codice: l.lotto_fornitore ?? '',
      scadenza: l.data_scadenza ?? '',
      residuo: numeroInInput(l.quantita_residua),
      note: l.note ?? ''
    })
    setLottoDialog(l)
  }

  const salvaLotto = async (): Promise<void> => {
    if (!lottoDialog) return
    const r = parseNumero(lottoForm.residuo)
    if (!lottoForm.codice.trim()) return setErroreDialog('Il codice lotto è obbligatorio.')
    if (r === null || Number.isNaN(r) || r < 0)
      return setErroreDialog('Quantità residua non valida.')
    setSalvataggio(true)
    setErroreDialog(null)
    try {
      const res = await window.api.mp.modificaLotto(lottoDialog.id, {
        lotto_fornitore: lottoForm.codice.trim(),
        data_scadenza: lottoForm.scadenza || null,
        quantita_residua: r,
        note: lottoForm.note.trim() || null
      })
      const err = erroreDa(res)
      if (err) return setErroreDialog(err)
      setLottoDialog(null)
      await Promise.all([caricaProdotti(), caricaLotti()])
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
        conferma.tipo === 'prodotto'
          ? await window.api.mp.eliminaMateria(conferma.p.id)
          : await window.api.mp.eliminaLotto(conferma.l.id)
      const err = erroreDa(r)
      if (err) return setErroreConferma(err)
      setConferma(null)
      await Promise.all([caricaProdotti(), caricaLotti()])
    } catch (e) {
      setErroreConferma(messaggioErrore(e))
    } finally {
      setSalvataggio(false)
    }
  }

  const unitaSel = selezionato?.unita_misura ?? ''

  return (
    <div className="space-y-4">
      <Intestazione
        titolo="Magazzino input agricoli"
        sottotitolo="Sementi, concimi, fitofarmaci e altri prodotti per il campo: lotti, carichi e scadenze."
        azioni={
          <Button size="sm" onClick={() => apriProdotto(null)}>
            <Plus className="mr-1.5 h-4 w-4" /> Nuovo prodotto
          </Button>
        }
      />
      <ErroreBox messaggio={errore} />
      <SceltaPulsanti opzioni={FILTRI} valore={filtro} onChange={setFiltro} />

      {caricamento ? (
        <p className="text-sm text-muted-foreground">Caricamento…</p>
      ) : prodotti.length === 0 ? (
        <StatoVuoto
          icona={Boxes}
          titolo="Nessun prodotto in magazzino"
          testo="Aggiungi le sementi, i concimi e i fitofarmaci che usi in campo. Poi carica i lotti: verranno scaricati automaticamente quando registri semine e operazioni."
          azione={
            <Button size="sm" onClick={() => apriProdotto(null)}>
              <Plus className="mr-1.5 h-4 w-4" /> Aggiungi il primo prodotto
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 [&>*]:min-w-0 xl:grid-cols-[minmax(260px,1fr)_1.6fr]">
          <div className={cn(cls.pannello, 'self-start')}>
            {visibili.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                Nessun prodotto in questa categoria.
              </p>
            ) : (
              <ul className="divide-y divide-border/60">
                {visibili.map((p) => {
                  const sottoSoglia =
                    p.soglia_riordino_fissa !== null && p.giacenza_totale <= p.soglia_riordino_fissa
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => setSelezionatoId(p.id)}
                        className={cn(
                          'flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/30',
                          p.id === selezionatoId && 'bg-amber-500/10'
                        )}
                      >
                        <div className="min-w-0">
                          <p
                            className={cn(
                              'truncate text-sm font-medium',
                              p.id === selezionatoId ? 'text-amber-400' : 'text-foreground'
                            )}
                          >
                            {p.nome}
                          </p>
                          <div className="mt-1">
                            <BadgeTono tono={tonoCategoria(p.categoria)}>
                              {etichettaCategoria(p.categoria)}
                            </BadgeTono>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <p
                            className={cn(
                              'text-sm tabular-nums',
                              sottoSoglia ? 'text-red-400' : 'text-foreground'
                            )}
                          >
                            {fmtQta(p.giacenza_totale, p.unita_misura)}
                          </p>
                          {sottoSoglia && <p className="text-[11px] text-red-400">sotto soglia</p>}
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div className="space-y-4">
            {!selezionato ? (
              <StatoVuoto icona={Boxes} titolo="Seleziona un prodotto" />
            ) : (
              <>
                <div className={cn(cls.pannello, 'p-5')}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h4 className="text-xl font-semibold text-foreground">{selezionato.nome}</h4>
                      <div className="mt-1">
                        <BadgeTono tono={tonoCategoria(selezionato.categoria)}>
                          {etichettaCategoria(selezionato.categoria)}
                        </BadgeTono>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => apriProdotto(selezionato)}>
                        <Pencil className="mr-1.5 h-3.5 w-3.5" /> Modifica
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setErroreConferma(null)
                          setConferma({ tipo: 'prodotto', p: selezionato })
                        }}
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Elimina
                      </Button>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-4 sm:grid-cols-3">
                    <Valore etichetta="Giacenza">
                      {fmtQta(selezionato.giacenza_totale, selezionato.unita_misura)}
                    </Valore>
                    <Valore etichetta="Fornitore abituale">
                      {selezionato.fornitore_preferito || '—'}
                    </Valore>
                    <Valore etichetta="Soglia di riordino">
                      {selezionato.soglia_riordino_fissa !== null
                        ? fmtQta(selezionato.soglia_riordino_fissa, unitaSel)
                        : '—'}
                    </Valore>
                    {selezionato.categoria === 'fitofarmaco' && (
                      <>
                        <Valore etichetta="N. registrazione">
                          {selezionato.numero_registrazione || '—'}
                        </Valore>
                        <Valore etichetta="Principio attivo">
                          {selezionato.principio_attivo || '—'}
                        </Valore>
                        <Valore etichetta="Tempo di carenza">
                          {selezionato.tempo_carenza_giorni !== null
                            ? `${selezionato.tempo_carenza_giorni} giorni`
                            : '—'}
                        </Valore>
                      </>
                    )}
                  </div>
                  {selezionato.note && (
                    <p className="mt-3 text-sm text-muted-foreground">{selezionato.note}</p>
                  )}
                </div>

                <div className={cls.pannello}>
                  <div className="flex items-center justify-between border-b border-border px-4 py-3">
                    <h4 className="text-sm font-semibold text-foreground">Lotti</h4>
                    <Button size="sm" onClick={apriCarico}>
                      <PackagePlus className="mr-1.5 h-4 w-4" /> Nuovo carico
                    </Button>
                  </div>
                  {lotti.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                      Nessun lotto: registra il primo carico.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className={cn(cls.tabella, 'min-w-[560px]')}>
                        <thead className={cls.thead}>
                          <tr>
                            <th className={cls.th}>Lotto</th>
                            <th className={cls.th}>Carico</th>
                            <th className={cls.th}>Scadenza</th>
                            <th className={cn(cls.th, 'text-right')}>Iniziale</th>
                            <th className={cn(cls.th, 'text-right')}>Residuo</th>
                            <th className={cls.th} />
                          </tr>
                        </thead>
                        <tbody>
                          {lotti.map((l) => {
                            const finito = l.quantita_residua <= 1e-9
                            return (
                              <tr key={l.id} className={cn(cls.riga, finito && 'opacity-55')}>
                                <td className={cls.td}>
                                  {l.lotto_fornitore || '—'}
                                  {l.note && (
                                    <div className="text-xs text-muted-foreground">{l.note}</div>
                                  )}
                                </td>
                                <td className={cn(cls.td, 'tabular-nums')}>
                                  {fmtData(l.data_carico)}
                                </td>
                                <td className={cn(cls.td, 'tabular-nums')}>
                                  {fmtData(l.data_scadenza)}
                                </td>
                                <td className={cn(cls.td, 'text-right tabular-nums')}>
                                  {fmtQta(l.quantita_iniziale, unitaSel)}
                                </td>
                                <td className={cn(cls.td, 'text-right tabular-nums')}>
                                  {finito ? (
                                    <span className="text-muted-foreground">esaurito</span>
                                  ) : (
                                    fmtQta(l.quantita_residua, unitaSel)
                                  )}
                                </td>
                                <td className={cn(cls.td, 'whitespace-nowrap text-right')}>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    title="Modifica lotto"
                                    onClick={() => apriLotto(l)}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    title="Elimina lotto"
                                    onClick={() => {
                                      setErroreConferma(null)
                                      setConferma({ tipo: 'lotto', l })
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

      {/* Dialog prodotto */}
      <Dialog
        open={prodottoDialog !== null}
        onOpenChange={(o) => (!o ? setProdottoDialog(null) : undefined)}
      >
        <DialogContent
          className={cn('max-w-lg', cls.dialogLungo)}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>{prodottoDialog?.id ? 'Modifica prodotto' : 'Nuovo prodotto'}</DialogTitle>
            <DialogDescription>
              Un prodotto che usi in campo e che tieni a magazzino.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <CampoForm etichetta="Nome" htmlFor="inp-nome" obbligatorio>
              <Input
                id="inp-nome"
                value={prodottoForm.nome}
                placeholder="es. Orzo da seme Concerto, Nitrato ammonico 27%, Fungicida…"
                onChange={(e) => setProdottoForm((p) => ({ ...p, nome: e.target.value }))}
              />
            </CampoForm>
            <div className="grid gap-3 sm:grid-cols-2">
              <CampoForm etichetta="Categoria" htmlFor="inp-cat" obbligatorio>
                <select
                  id="inp-cat"
                  className={cls.select}
                  value={prodottoForm.categoria}
                  onChange={(e) => {
                    const categoria = e.target.value as CategoriaInputAgricolo
                    setProdottoForm((p) => ({
                      ...p,
                      categoria,
                      // in un prodotto nuovo, se l'unità è ancora quella proposta la adeguiamo alla categoria
                      unita:
                        prodottoDialog?.id === null && p.unita === prodottoVuoto(p.categoria).unita
                          ? prodottoVuoto(categoria).unita
                          : p.unita
                    }))
                  }}
                >
                  {CATEGORIE_INPUT_AGRICOLI.map((c) => (
                    <option key={c} value={c}>
                      {etichettaCategoria(c)}
                    </option>
                  ))}
                </select>
              </CampoForm>
              <CampoForm etichetta="Unità di misura" htmlFor="inp-unita" obbligatorio>
                <select
                  id="inp-unita"
                  className={cls.select}
                  value={prodottoForm.unita}
                  onChange={(e) => setProdottoForm((p) => ({ ...p, unita: e.target.value }))}
                >
                  {UNITA_INPUT.map((u) => (
                    <option key={u} value={u}>
                      {ETICHETTE_UNITA[u] ?? u}
                    </option>
                  ))}
                </select>
              </CampoForm>
            </div>
            {prodottoForm.categoria === 'fitofarmaco' && (
              <div className="grid gap-3 rounded-md border border-red-500/20 bg-red-500/5 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-red-300">
                  Dati del fitofarmaco
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <CampoForm etichetta="N. registrazione" htmlFor="inp-reg">
                    <Input
                      id="inp-reg"
                      value={prodottoForm.numero_registrazione}
                      onChange={(e) =>
                        setProdottoForm((p) => ({ ...p, numero_registrazione: e.target.value }))
                      }
                    />
                  </CampoForm>
                  <CampoForm
                    etichetta="Tempo di carenza"
                    htmlFor="inp-car"
                    aiuto="Giorni tra trattamento e raccolta."
                  >
                    <InputNumero
                      id="inp-car"
                      valore={prodottoForm.carenza}
                      unita="giorni"
                      onChange={(v) => setProdottoForm((p) => ({ ...p, carenza: v }))}
                    />
                  </CampoForm>
                </div>
                <CampoForm etichetta="Principio attivo" htmlFor="inp-pa">
                  <Input
                    id="inp-pa"
                    value={prodottoForm.principio_attivo}
                    onChange={(e) =>
                      setProdottoForm((p) => ({ ...p, principio_attivo: e.target.value }))
                    }
                  />
                </CampoForm>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <CampoForm etichetta="Fornitore abituale" htmlFor="inp-forn">
                <Input
                  id="inp-forn"
                  value={prodottoForm.fornitore}
                  onChange={(e) => setProdottoForm((p) => ({ ...p, fornitore: e.target.value }))}
                />
              </CampoForm>
              <CampoForm
                etichetta="Soglia di riordino"
                htmlFor="inp-soglia"
                aiuto="Facoltativa: avviso quando scende sotto."
              >
                <InputNumero
                  id="inp-soglia"
                  valore={prodottoForm.soglia}
                  unita={prodottoForm.unita}
                  onChange={(v) => setProdottoForm((p) => ({ ...p, soglia: v }))}
                />
              </CampoForm>
            </div>
            <CampoForm etichetta="Note" htmlFor="inp-note">
              <textarea
                id="inp-note"
                className={cls.textarea}
                value={prodottoForm.note}
                onChange={(e) => setProdottoForm((p) => ({ ...p, note: e.target.value }))}
              />
            </CampoForm>
            <ErroreBox messaggio={erroreDialog} />
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setProdottoDialog(null)}
              disabled={salvataggio}
            >
              Annulla
            </Button>
            <Button onClick={() => void salvaProdotto()} disabled={salvataggio}>
              {salvataggio ? 'Salvataggio…' : 'Salva prodotto'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog carico */}
      <Dialog open={caricoAperto} onOpenChange={setCaricoAperto}>
        <DialogContent className="max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Nuovo carico</DialogTitle>
            <DialogDescription>{selezionato?.nome}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <CampoForm
              etichetta="Codice lotto"
              htmlFor="car-cod"
              obbligatorio
              aiuto="Quello scritto sulla confezione o sul documento di consegna."
            >
              <Input
                id="car-cod"
                value={caricoForm.codice}
                onChange={(e) => setCaricoForm((p) => ({ ...p, codice: e.target.value }))}
              />
            </CampoForm>
            <CampoForm etichetta="Quantità" htmlFor="car-q" obbligatorio>
              <InputNumero
                id="car-q"
                valore={caricoForm.quantita}
                unita={unitaSel}
                onChange={(v) => setCaricoForm((p) => ({ ...p, quantita: v }))}
              />
            </CampoForm>
            <div className="grid gap-3 sm:grid-cols-2">
              <CampoForm etichetta="Data di carico" htmlFor="car-data" obbligatorio>
                <Input
                  id="car-data"
                  type="date"
                  value={caricoForm.data_carico}
                  onChange={(e) => setCaricoForm((p) => ({ ...p, data_carico: e.target.value }))}
                />
              </CampoForm>
              <CampoForm etichetta="Scadenza" htmlFor="car-scad" aiuto="Se prevista.">
                <Input
                  id="car-scad"
                  type="date"
                  value={caricoForm.scadenza}
                  onChange={(e) => setCaricoForm((p) => ({ ...p, scadenza: e.target.value }))}
                />
              </CampoForm>
            </div>
            <CampoForm etichetta="Note" htmlFor="car-note">
              <Input
                id="car-note"
                value={caricoForm.note}
                placeholder="es. fornitore, documento di trasporto"
                onChange={(e) => setCaricoForm((p) => ({ ...p, note: e.target.value }))}
              />
            </CampoForm>
            <ErroreBox messaggio={erroreDialog} />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCaricoAperto(false)} disabled={salvataggio}>
              Annulla
            </Button>
            <Button onClick={() => void salvaCarico()} disabled={salvataggio}>
              {salvataggio ? 'Salvataggio…' : 'Registra carico'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog modifica lotto */}
      <Dialog
        open={lottoDialog !== null}
        onOpenChange={(o) => (!o ? setLottoDialog(null) : undefined)}
      >
        <DialogContent className="max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Modifica lotto</DialogTitle>
            <DialogDescription>
              Iniziale {fmtNum(lottoDialog?.quantita_iniziale)} {unitaSel}. Correggi la giacenza
              solo per allinearla a un inventario: gli scarichi di semine e operazioni sono
              automatici.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <CampoForm etichetta="Codice lotto" htmlFor="lot-cod" obbligatorio>
              <Input
                id="lot-cod"
                value={lottoForm.codice}
                onChange={(e) => setLottoForm((p) => ({ ...p, codice: e.target.value }))}
              />
            </CampoForm>
            <div className="grid gap-3 sm:grid-cols-2">
              <CampoForm etichetta="Quantità residua" htmlFor="lot-res" obbligatorio>
                <InputNumero
                  id="lot-res"
                  valore={lottoForm.residuo}
                  unita={unitaSel}
                  onChange={(v) => setLottoForm((p) => ({ ...p, residuo: v }))}
                />
              </CampoForm>
              <CampoForm etichetta="Scadenza" htmlFor="lot-scad">
                <Input
                  id="lot-scad"
                  type="date"
                  value={lottoForm.scadenza}
                  onChange={(e) => setLottoForm((p) => ({ ...p, scadenza: e.target.value }))}
                />
              </CampoForm>
            </div>
            <CampoForm etichetta="Note" htmlFor="lot-note">
              <Input
                id="lot-note"
                value={lottoForm.note}
                onChange={(e) => setLottoForm((p) => ({ ...p, note: e.target.value }))}
              />
            </CampoForm>
            <ErroreBox messaggio={erroreDialog} />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setLottoDialog(null)} disabled={salvataggio}>
              Annulla
            </Button>
            <Button onClick={() => void salvaLotto()} disabled={salvataggio}>
              {salvataggio ? 'Salvataggio…' : 'Salva'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfermaDialog
        aperto={conferma !== null}
        titolo={conferma?.tipo === 'prodotto' ? 'Eliminare il prodotto?' : 'Eliminare il lotto?'}
        testo={
          conferma?.tipo === 'prodotto'
            ? `"${conferma.p.nome}" verrà eliminato. Si può eliminare solo un prodotto senza lotti.`
            : conferma?.tipo === 'lotto'
              ? `Il lotto ${conferma.l.lotto_fornitore || ''} verrà eliminato. Si può eliminare solo un lotto mai usato.`
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
