import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Beer, Box, Gift, Pencil, Plus, ShoppingCart, Trash2, AlertCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
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
import { Label } from '@/components/ui/label'

type VenditaLista = {
  id: number
  cliente_id: number | null
  data: string
  note: string | null
  creato_il: string
  cliente_nome: string | null
  omaggio: number
  occasione: string | null
  totale_fusti: number
  totale_bottiglie: number
  totale_altri: number
}

type VenditaRiga = {
  id: number
  vendita_id: number
  cotta_id: number | null
  tipo_prodotto: 'bottiglia' | 'fusto' | 'altro'
  materiale_id: number | null
  altro_prodotto_id: number | null
  quantita: number
  birra_nome: string | null
  numero_lotto: string | null
  formato_nome: string | null
  altro_prodotto_nome: string | null
  omaggio: number
}

type GiacenzaRiga = {
  tipo: 'bottiglia' | 'fusto'
  cotta_id: number
  numero_lotto: string
  birra_nome: string
  quantita_disponibile: number
  data_scadenza: string
  materiale_id: number | null
  formato_nome: string | null
}

type GiacenzaPfLotto = {
  cotta_id: number
  numero_lotto: string
  birra_nome: string
  data_scadenza: string
  bottiglie_disponibili: number
}

type ClienteOpt = { id: number; nome: string }

type BirraOpt = { id: number; nome: string; stile: string | null }

type LottoBottigliaSuggerito = {
  cotta_id: number
  numero_lotto: string
  data_scadenza: string
  bottiglie_disponibili: number
}

type LottoFustoSuggerito = {
  cotta_id: number
  materiale_id: number
  numero_lotto: string
  formato_nome: string
  data_scadenza: string
  quantita_disponibile: number
}

type AltroProdotto = {
  id: number
  nome: string
  quantita_disponibile: number
}

type RigaFustoForm = {
  rowId: string
  tipo: 'fusto'
  birra_id: string
  key: string
  quantita: string
  suggerimenti: LottoFustoSuggerito[]
  caricamentoSuggerimenti: boolean
}

type RigaBottigliaForm = {
  rowId: string
  tipo: 'bottiglia'
  birra_id: string
  cotta_id: string
  quantita: string
  suggerimenti: LottoBottigliaSuggerito[]
  caricamentoSuggerimenti: boolean
}

type RigaAltroForm = {
  rowId: string
  tipo: 'altro'
  altro_prodotto_id: string
  quantita: string
  omaggio: boolean
}

type RigaForm = RigaFustoForm | RigaBottigliaForm | RigaAltroForm

type RigaFustoEditForm = {
  rowId: string
  tipo: 'fusto'
  key: string
  quantita: string
  omaggio: boolean
}

type RigaEsistenteForm = {
  id: number
  key: string
  label: string
  cotta_id: number | null
  tipo_prodotto: 'bottiglia' | 'fusto' | 'altro'
  materiale_id: number | null
  altro_prodotto_id: number | null
  omaggio: boolean
  quantitaOriginale: number
  quantita: string
  eliminata: boolean
}

const oggi = (): string => new Date().toISOString().split('T')[0]

function prodottoKey(
  tipo: 'bottiglia' | 'fusto' | 'altro',
  cotta_id: number | null,
  materiale_id: number | null,
  altro_prodotto_id?: number | null
): string {
  if (tipo === 'bottiglia') return `bottiglia:${cotta_id}`
  if (tipo === 'fusto') return `fusto:${cotta_id}:${materiale_id ?? 0}`
  return `altro:${altro_prodotto_id ?? 0}`
}

function prodottoKeyDaGiacenza(r: GiacenzaRiga): string {
  return prodottoKey(r.tipo, r.cotta_id, r.materiale_id, null)
}

function labelProdottoDaGiacenza(r: GiacenzaRiga): string {
  if (r.tipo === 'bottiglia') {
    return `${r.birra_nome} — ${r.numero_lotto} — bottiglie — disponibili ${r.quantita_disponibile}`
  }
  return `${r.birra_nome} — ${r.numero_lotto} — fusto (${r.formato_nome ?? '?'}) — disponibili ${r.quantita_disponibile}`
}

function labelProdottoDaRiga(r: VenditaRiga): string {
  if (r.tipo_prodotto === 'bottiglia') {
    return `${r.birra_nome ?? '-'} — ${r.numero_lotto ?? '-'} — bottiglie`
  }
  if (r.tipo_prodotto === 'fusto') {
    return `${r.birra_nome ?? '-'} — ${r.numero_lotto ?? '-'} — fusto (${r.formato_nome ?? '?'})`
  }
  return `${r.altro_prodotto_nome ?? 'Altro prodotto'}`
}

function parseProdottoKey(
  key: string
): {
  cotta_id: number | null
  tipo_prodotto: 'bottiglia' | 'fusto' | 'altro'
  materiale_id: number | null
  altro_prodotto_id: number | null
} {
  if (key.startsWith('bottiglia:')) {
    return {
      cotta_id: Number(key.split(':')[1]),
      tipo_prodotto: 'bottiglia',
      materiale_id: null,
      altro_prodotto_id: null
    }
  }
  if (key.startsWith('altro:')) {
    return {
      cotta_id: null,
      tipo_prodotto: 'altro',
      materiale_id: null,
      altro_prodotto_id: Number(key.split(':')[1])
    }
  }
  const p = key.split(':')
  return {
    cotta_id: Number(p[1]),
    tipo_prodotto: 'fusto',
    materiale_id: Number(p[2]),
    altro_prodotto_id: null
  }
}

function tipoEsistenteDaStringa(s: string): 'bottiglia' | 'fusto' | 'altro' {
  if (s === 'bottiglia' || s === 'fusto' || s === 'altro') return s
  return 'bottiglia'
}

function formatDataIt(s: string): string {
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleDateString('it-IT')
}

function newRowId(): string {
  return `r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function newRigaForm(): RigaForm {
  return {
    rowId: newRowId(),
    tipo: 'fusto',
    birra_id: '',
    key: '',
    quantita: '',
    suggerimenti: [],
    caricamentoSuggerimenti: false
  }
}

function newRigaBottigliaForm(): RigaBottigliaForm {
  return {
    rowId: newRowId(),
    tipo: 'bottiglia',
    birra_id: '',
    cotta_id: '',
    quantita: '',
    suggerimenti: [],
    caricamentoSuggerimenti: false
  }
}

function newRigaAltroForm(): RigaAltroForm {
  return {
    rowId: newRowId(),
    tipo: 'altro',
    altro_prodotto_id: '',
    quantita: '',
    omaggio: false
  }
}

function ModalError({ message }: { message: string }): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
      <AlertCircle className="h-4 w-4 shrink-0" />
      {message}
    </div>
  )
}

export default function Vendite(): React.JSX.Element {
  const [lista, setLista] = useState<VenditaLista[]>([])
  const [selezionata, setSelezionata] = useState<VenditaLista | null>(null)
  const [dettaglio, setDettaglio] = useState<VenditaRiga[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingDet, setLoadingDet] = useState(false)
  const [errore, setErrore] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [clienti, setClienti] = useState<ClienteOpt[]>([])
  const [giacenze, setGiacenze] = useState<GiacenzaRiga[]>([])
  const [giacenzePfBottiglie, setGiacenzePfBottiglie] = useState<GiacenzaPfLotto[]>([])
  const [altriProdotti, setAltriProdotti] = useState<AltroProdotto[]>([])
  const [birreAttive, setBirreAttive] = useState<BirraOpt[]>([])
  const [clienteId, setClienteId] = useState('')
  const [dataVendita, setDataVendita] = useState(oggi())
  const [noteVendita, setNoteVendita] = useState('')
  const [omaggio, setOmaggio] = useState(false)
  const [occasione, setOccasione] = useState('')
  const [righe, setRighe] = useState<RigaForm[]>([newRigaBottigliaForm()])
  const [erroreModal, setErroreModal] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [caricandoModal, setCaricandoModal] = useState(false)

  const [editOpen, setEditOpen] = useState(false)
  const [caricandoEdit, setCaricandoEdit] = useState(false)
  const [editClienteId, setEditClienteId] = useState('')
  const [editData, setEditData] = useState('')
  const [editNote, setEditNote] = useState('')
  const [editOmaggio, setEditOmaggio] = useState(false)
  const [editOccasione, setEditOccasione] = useState('')
  const [editRigheEsistenti, setEditRigheEsistenti] = useState<RigaEsistenteForm[]>([])
  const [editRigheNuove, setEditRigheNuove] = useState<RigaFustoEditForm[]>([])
  const [erroreEdit, setErroreEdit] = useState('')
  const [submittingEdit, setSubmittingEdit] = useState(false)

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [submittingDelete, setSubmittingDelete] = useState(false)
  const [erroreDelete, setErroreDelete] = useState('')

  const byKey = useMemo(() => {
    const m = new Map<string, { quantita_disponibile: number; label: string }>()
    for (const g of giacenze) {
      m.set(prodottoKeyDaGiacenza(g), {
        quantita_disponibile: g.quantita_disponibile,
        label: labelProdottoDaGiacenza(g)
      })
    }
    for (const a of altriProdotti) {
      m.set(prodottoKey('altro', null, null, a.id), {
        quantita_disponibile: a.quantita_disponibile,
        label: `${a.nome} — disponibili ${a.quantita_disponibile}`
      })
    }
    return m
  }, [giacenze, altriProdotti])

  const caricaLista = useCallback(async () => {
    setLoading(true)
    setErrore('')
    try {
      setLista((await window.api.vendite.lista()) as VenditaLista[])
    } catch (e) {
      setErrore(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  const caricaDettaglio = useCallback(async (id: number) => {
    setLoadingDet(true)
    try {
      setDettaglio((await window.api.vendite.dettaglio(id)) as VenditaRiga[])
    } catch {
      setDettaglio([])
    } finally {
      setLoadingDet(false)
    }
  }, [])

  useEffect(() => {
    void caricaLista()
  }, [caricaLista])

  const apriModal = async (): Promise<void> => {
    setErroreModal('')
    setClienteId('')
    setDataVendita(oggi())
    setNoteVendita('')
    setOmaggio(false)
    setOccasione('')
    setRighe([newRigaBottigliaForm()])
    setCaricandoModal(true)
    setModalOpen(true)
    try {
      const [c, g, b, pf, ap] = await Promise.all([
        window.api.vendite.clienti(),
        window.api.vendite.giacenzeDisponibili(),
        window.api.prod.birreAttive(),
        window.api.pf.giacenze(),
        window.api.pf.altriProdotti()
      ])
      setClienti(c as ClienteOpt[])
      setGiacenze(g as GiacenzaRiga[])
      setBirreAttive(b.map((x) => ({ id: x.id, nome: x.nome, stile: x.stile })))
      setAltriProdotti(ap as AltroProdotto[])
      setGiacenzePfBottiglie(
        pf.map((x) => ({
          cotta_id: x.cotta_id,
          numero_lotto: x.numero_lotto,
          birra_nome: x.birra_nome,
          data_scadenza: x.data_scadenza,
          bottiglie_disponibili: x.bottiglie_disponibili
        }))
      )
    } catch (e) {
      setErroreModal(e instanceof Error ? e.message : 'Errore caricamento')
    } finally {
      setCaricandoModal(false)
    }
  }

  const selezionaVendita = (v: VenditaLista): void => {
    setSelezionata(v)
    void caricaDettaglio(v.id)
  }

  const aggiungiRiga = (): void => {
    setRighe((p) => [...p, newRigaForm()])
  }

  const aggiungiRigaBottiglia = (): void => {
    setRighe((p) => [...p, newRigaBottigliaForm()])
  }

  const aggiungiRigaAltro = (): void => {
    setRighe((p) => [...p, newRigaAltroForm()])
  }

  const rimuoviRiga = (rowId: string): void => {
    setRighe((p) => (p.length <= 1 ? p : p.filter((r) => r.rowId !== rowId)))
  }

  const aggiornaRigaFusto = (
    rowId: string,
    patch: Partial<
      Pick<RigaFustoForm, 'birra_id' | 'key' | 'quantita' | 'suggerimenti' | 'caricamentoSuggerimenti'>
    >
  ): void => {
    setRighe((p) =>
      p.map((r) => (r.rowId === rowId && r.tipo === 'fusto' ? { ...r, ...patch } : r))
    )
  }

  const aggiornaRigaBottiglia = (rowId: string, patch: Partial<RigaBottigliaForm>): void => {
    setRighe((p) =>
      p.map((r) => (r.rowId === rowId && r.tipo === 'bottiglia' ? { ...r, ...patch } : r))
    )
  }

  const aggiornaRigaAltro = (rowId: string, patch: Partial<RigaAltroForm>): void => {
    setRighe((p) => p.map((r) => (r.rowId === rowId && r.tipo === 'altro' ? { ...r, ...patch } : r)))
  }

  const cambiaBirraRigaBottiglia = async (rowId: string, birra_id: string): Promise<void> => {
    aggiornaRigaBottiglia(rowId, {
      birra_id,
      cotta_id: '',
      quantita: '',
      suggerimenti: [],
      caricamentoSuggerimenti: Boolean(birra_id)
    })
    if (!birra_id) return
    try {
      const sugg = await window.api.pf.suggerisciLottoBottiglie(Number(birra_id))
      aggiornaRigaBottiglia(rowId, {
        suggerimenti: sugg,
        cotta_id: sugg.length > 0 ? String(sugg[0].cotta_id) : '',
        caricamentoSuggerimenti: false
      })
    } catch {
      aggiornaRigaBottiglia(rowId, { caricamentoSuggerimenti: false, suggerimenti: [] })
    }
  }

  const cambiaBirraRigaFusto = async (rowId: string, birra_id: string): Promise<void> => {
    aggiornaRigaFusto(rowId, {
      birra_id,
      key: '',
      quantita: '',
      suggerimenti: [],
      caricamentoSuggerimenti: Boolean(birra_id)
    })
    if (!birra_id) return
    try {
      const sugg = await window.api.pf.suggerisciLottoFusti(Number(birra_id))
      const primo = sugg[0]
      aggiornaRigaFusto(rowId, {
        suggerimenti: sugg,
        key: primo ? prodottoKey('fusto', primo.cotta_id, primo.materiale_id) : '',
        caricamentoSuggerimenti: false
      })
    } catch {
      aggiornaRigaFusto(rowId, { caricamentoSuggerimenti: false, suggerimenti: [] })
    }
  }

  const validaEInvia = async (): Promise<void> => {
    setErroreModal('')
    if (!omaggio && !clienteId) {
      setErroreModal('Seleziona un cliente')
      return
    }

    const righeFustoCompilate = righe.filter(
      (r): r is RigaFustoForm =>
        r.tipo === 'fusto' && r.key.trim() !== '' && (parseInt(r.quantita, 10) || 0) > 0
    )
    const righeBottigliaCompilate = righe.filter(
      (r): r is RigaBottigliaForm =>
        r.tipo === 'bottiglia' &&
        r.cotta_id.trim() !== '' &&
        (parseInt(r.quantita, 10) || 0) > 0
    )
    const righeAltroCompilate = righe.filter(
      (r): r is RigaAltroForm =>
        r.tipo === 'altro' &&
        r.altro_prodotto_id.trim() !== '' &&
        (parseInt(r.quantita, 10) || 0) > 0
    )

    if (
      righeFustoCompilate.length === 0 &&
      righeBottigliaCompilate.length === 0 &&
      righeAltroCompilate.length === 0
    ) {
      setErroreModal('Aggiungi almeno un prodotto con quantita')
      return
    }

    const somme = new Map<string, number>()
    for (const r of righeFustoCompilate) {
      const q = parseInt(r.quantita, 10) || 0
      somme.set(r.key, (somme.get(r.key) ?? 0) + q)
    }
    for (const [k, somma] of somme) {
      const g = byKey.get(k)
      if (!g) {
        setErroreModal('Riga prodotto non valida (giacenza aggiornata: chiudi e riapri).')
        return
      }
      if (somma > g.quantita_disponibile) {
        setErroreModal(
          `La quantita totale per "${g.label}" non puo superare ${g.quantita_disponibile}`
        )
        return
      }
    }

    const sommeBottigliePerCotta = new Map<number, number>()
    for (const r of righeBottigliaCompilate) {
      const cottaId = Number(r.cotta_id)
      const q = parseInt(r.quantita, 10) || 0
      sommeBottigliePerCotta.set(cottaId, (sommeBottigliePerCotta.get(cottaId) ?? 0) + q)
    }
    for (const r of righeBottigliaCompilate) {
      const cottaId = Number(r.cotta_id)
      const lotto = r.suggerimenti.find((s) => s.cotta_id === cottaId)
      const somma = sommeBottigliePerCotta.get(cottaId) ?? 0
      if (lotto && somma > lotto.bottiglie_disponibili) {
        setErroreModal(
          `Bottiglie totali per il lotto ${lotto.numero_lotto} superano il disponibile (${lotto.bottiglie_disponibili})`
        )
        return
      }
    }

    const sommeAltriPerProdotto = new Map<number, number>()
    for (const r of righeAltroCompilate) {
      const altroId = Number(r.altro_prodotto_id)
      const q = parseInt(r.quantita, 10) || 0
      sommeAltriPerProdotto.set(altroId, (sommeAltriPerProdotto.get(altroId) ?? 0) + q)
    }
    for (const [altroId, somma] of sommeAltriPerProdotto) {
      const key = prodottoKey('altro', null, null, altroId)
      const disponibile = byKey.get(key)?.quantita_disponibile ?? 0
      if (somma > disponibile) {
        const nome = altriProdotti.find((x) => x.id === altroId)?.nome ?? 'Prodotto'
        setErroreModal(`Quantita totale per "${nome}" supera il disponibile (${disponibile})`)
        return
      }
    }

    const righeApi: Array<{
      cotta_id: number | null
      tipo_prodotto: 'bottiglia' | 'fusto' | 'altro'
      materiale_id: number | null
      altro_prodotto_id?: number | null
      omaggio?: boolean
      quantita: number
    }> = []
    for (const r of righeFustoCompilate) {
      const p = parseProdottoKey(r.key)
      righeApi.push({ ...p, quantita: parseInt(r.quantita, 10) || 0 })
    }
    for (const r of righeBottigliaCompilate) {
      righeApi.push({
        cotta_id: Number(r.cotta_id),
        tipo_prodotto: 'bottiglia',
        materiale_id: null,
        altro_prodotto_id: null,
        quantita: parseInt(r.quantita, 10) || 0
      })
    }
    for (const r of righeAltroCompilate) {
      righeApi.push({
        cotta_id: null,
        tipo_prodotto: 'altro',
        materiale_id: null,
        altro_prodotto_id: Number(r.altro_prodotto_id),
        omaggio: r.omaggio,
        quantita: parseInt(r.quantita, 10) || 0
      })
    }

    setSubmitting(true)
    try {
      const res = await window.api.vendite.registra({
        cliente_id: clienteId ? Number(clienteId) : null,
        data: dataVendita,
        note: noteVendita.trim() || null,
        omaggio,
        occasione: omaggio ? occasione.trim() || null : null,
        righe: righeApi
      })
      if (!res.ok) {
        setErroreModal(res.errore)
        return
      }
      setModalOpen(false)
      await caricaLista()
    } catch (e) {
      setErroreModal(e instanceof Error ? e.message : 'Errore')
    } finally {
      setSubmitting(false)
    }
  }

  const apriDialogModifica = async (): Promise<void> => {
    if (!selezionata) return
    setErroreEdit('')
    setEditClienteId(selezionata.cliente_id != null ? String(selezionata.cliente_id) : '')
    setEditData(selezionata.data)
    setEditNote(selezionata.note ?? '')
    setEditOmaggio(selezionata.omaggio === 1)
    setEditOccasione(selezionata.occasione ?? '')
    setEditRigheEsistenti(
      dettaglio.map((r) => {
        const tp = tipoEsistenteDaStringa(r.tipo_prodotto)
        return {
          id: r.id,
          key: prodottoKey(tp, r.cotta_id, r.materiale_id, r.altro_prodotto_id),
          label: labelProdottoDaRiga(r),
          cotta_id: r.cotta_id,
          tipo_prodotto: tp,
          materiale_id: r.materiale_id,
          altro_prodotto_id: r.altro_prodotto_id,
          omaggio: r.omaggio === 1,
          quantitaOriginale: r.quantita,
          quantita: String(r.quantita),
          eliminata: false
        }
      })
    )
    setEditRigheNuove([])
    setCaricandoEdit(true)
    setEditOpen(true)
    try {
      const [c, g, pf, ap] = await Promise.all([
        window.api.vendite.clienti(),
        window.api.vendite.giacenzeDisponibili(),
        window.api.pf.giacenze(),
        window.api.pf.altriProdotti()
      ])
      setClienti(c as ClienteOpt[])
      setGiacenze(g as GiacenzaRiga[])
      setAltriProdotti(ap as AltroProdotto[])
      setGiacenzePfBottiglie(
        pf.map((x) => ({
          cotta_id: x.cotta_id,
          numero_lotto: x.numero_lotto,
          birra_nome: x.birra_nome,
          data_scadenza: x.data_scadenza,
          bottiglie_disponibili: x.bottiglie_disponibili
        }))
      )
    } catch (e) {
      setErroreEdit(e instanceof Error ? e.message : 'Errore caricamento')
    } finally {
      setCaricandoEdit(false)
    }
  }

  // Disponibilita' effettiva per il dialog di modifica:
  // giacenza attuale in DB + quantita' gia' allocata su questa vendita (perche' verra' liberata)
  const disponibilitaEdit = useMemo(() => {
    const map = new Map<string, { label: string; giacenza: number; originaleSuVendita: number }>()
    for (const g of giacenze) {
      map.set(prodottoKeyDaGiacenza(g), {
        label: labelProdottoDaGiacenza(g),
        giacenza: g.quantita_disponibile,
        originaleSuVendita: 0
      })
    }
    for (const pf of giacenzePfBottiglie) {
      const key = prodottoKey('bottiglia', pf.cotta_id, null, null)
      map.set(key, {
        label: `${pf.birra_nome} — ${pf.numero_lotto} — bottiglie — disponibili ${pf.bottiglie_disponibili}`,
        giacenza: pf.bottiglie_disponibili,
        originaleSuVendita: 0
      })
    }
    for (const ap of altriProdotti) {
      const key = prodottoKey('altro', null, null, ap.id)
      map.set(key, {
        label: `${ap.nome} — disponibili ${ap.quantita_disponibile}`,
        giacenza: ap.quantita_disponibile,
        originaleSuVendita: 0
      })
    }
    for (const r of editRigheEsistenti) {
      const prev = map.get(r.key)
      if (prev) {
        prev.originaleSuVendita += r.quantitaOriginale
      } else {
        map.set(r.key, {
          label: r.label,
          giacenza: 0,
          originaleSuVendita: r.quantitaOriginale
        })
      }
    }
    return map
  }, [giacenze, giacenzePfBottiglie, altriProdotti, editRigheEsistenti])

  const aggiornaRigaEsistente = (
    id: number,
    patch: Partial<Pick<RigaEsistenteForm, 'quantita' | 'eliminata' | 'omaggio'>>
  ): void => {
    setEditRigheEsistenti((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  const aggiungiRigaNuova = (): void => {
    setEditRigheNuove((p) => [
      ...p,
      { rowId: newRowId(), tipo: 'fusto', key: '', quantita: '', omaggio: false }
    ])
  }

  const rimuoviRigaNuova = (rowId: string): void => {
    setEditRigheNuove((p) => p.filter((r) => r.rowId !== rowId))
  }

  const aggiornaRigaNuova = (
    rowId: string,
    patch: Partial<Pick<RigaFustoEditForm, 'key' | 'quantita' | 'omaggio'>>
  ): void => {
    setEditRigheNuove((p) => p.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)))
  }

  const confermaModifica = async (): Promise<void> => {
    if (!selezionata) return
    setErroreEdit('')
    if (!editOmaggio && !editClienteId) {
      setErroreEdit('Seleziona un cliente')
      return
    }
    if (!editData) {
      setErroreEdit('Data obbligatoria')
      return
    }

    const righeAttiveEsistenti = editRigheEsistenti.filter((r) => !r.eliminata)
    const righeNuoveCompilate = editRigheNuove.filter(
      (r) => r.key.trim() && (parseInt(r.quantita, 10) || 0) > 0
    )

    if (righeAttiveEsistenti.length === 0 && righeNuoveCompilate.length === 0) {
      setErroreEdit('Aggiungi almeno un prodotto con quantità')
      return
    }

    for (const r of righeAttiveEsistenti) {
      const q = parseInt(r.quantita, 10)
      if (!Number.isFinite(q) || q <= 0) {
        setErroreEdit(`Quantità non valida per "${r.label}"`)
        return
      }
    }

    const somme = new Map<string, number>()
    for (const r of righeAttiveEsistenti) {
      const q = parseInt(r.quantita, 10) || 0
      somme.set(r.key, (somme.get(r.key) ?? 0) + q)
    }
    for (const r of righeNuoveCompilate) {
      const q = parseInt(r.quantita, 10) || 0
      somme.set(r.key, (somme.get(r.key) ?? 0) + q)
    }
    for (const [k, somma] of somme) {
      const d = disponibilitaEdit.get(k)
      const totaleDisponibile = (d?.giacenza ?? 0) + (d?.originaleSuVendita ?? 0)
      if (somma > totaleDisponibile) {
        setErroreEdit(
          `Quantità totale per "${d?.label ?? k}" supera il disponibile (${totaleDisponibile})`
        )
        return
      }
    }

    const righePayload: Array<{
      id: number | null
      cotta_id: number | null
      tipo_prodotto: 'bottiglia' | 'fusto' | 'altro'
      materiale_id: number | null
      altro_prodotto_id?: number | null
      omaggio?: boolean
      quantita: number
    }> = []
    for (const r of righeAttiveEsistenti) {
      righePayload.push({
        id: r.id,
        cotta_id: r.cotta_id,
        tipo_prodotto: r.tipo_prodotto,
        materiale_id: r.materiale_id,
        altro_prodotto_id: r.altro_prodotto_id,
        omaggio: r.omaggio,
        quantita: parseInt(r.quantita, 10) || 0
      })
    }
    for (const r of righeNuoveCompilate) {
      const p = parseProdottoKey(r.key)
      righePayload.push({
        id: null,
        cotta_id: p.cotta_id,
        tipo_prodotto: p.tipo_prodotto,
        materiale_id: p.materiale_id,
        altro_prodotto_id: p.altro_prodotto_id,
        omaggio: r.omaggio,
        quantita: parseInt(r.quantita, 10) || 0
      })
    }

    setSubmittingEdit(true)
    try {
      const res = await window.api.vendite.modifica(selezionata.id, {
        cliente_id: editClienteId ? Number(editClienteId) : null,
        data: editData,
        note: editNote.trim() || null,
        omaggio: editOmaggio,
        occasione: editOmaggio ? editOccasione.trim() || null : null,
        righe: righePayload
      })
      if (!res.ok) {
        setErroreEdit(res.errore)
        return
      }
      setEditOpen(false)
      await caricaLista()
      const aggiornata = (await window.api.vendite.lista()) as VenditaLista[]
      const nuova = aggiornata.find((v) => v.id === selezionata.id) ?? null
      if (nuova) {
        setSelezionata(nuova)
        await caricaDettaglio(nuova.id)
      } else {
        setSelezionata(null)
        setDettaglio([])
      }
    } catch (e) {
      setErroreEdit(e instanceof Error ? e.message : 'Errore')
    } finally {
      setSubmittingEdit(false)
    }
  }

  const apriDialogElimina = (): void => {
    setErroreDelete('')
    setDeleteOpen(true)
  }

  const confermaElimina = async (): Promise<void> => {
    if (!selezionata) return
    setErroreDelete('')
    setSubmittingDelete(true)
    try {
      const res = await window.api.vendite.elimina(selezionata.id)
      if (!res.ok) {
        setErroreDelete(res.errore)
        return
      }
      setDeleteOpen(false)
      setSelezionata(null)
      setDettaglio([])
      await caricaLista()
    } catch (e) {
      setErroreDelete(e instanceof Error ? e.message : 'Errore')
    } finally {
      setSubmittingDelete(false)
    }
  }

  if (selezionata) {
    return (
      <div className="space-y-6">
        <div className="flex items-center">
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setSelezionata(null)
              setDettaglio([])
            }}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Torna alla lista
          </Button>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Vendita</p>
              {selezionata.omaggio === 1 && (
                <Badge className="bg-amber-500/15 text-amber-400 hover:bg-amber-500/20">
                  <Gift className="mr-1 h-3 w-3" />
                  Omaggio
                </Badge>
              )}
            </div>
            <h2 className="text-2xl font-semibold text-foreground">{formatDataIt(selezionata.data)}</h2>
            <p className="mt-1 text-lg text-foreground/80">{selezionata.cliente_nome ?? '—'}</p>
            {selezionata.omaggio === 1 && selezionata.occasione && (
              <p className="mt-1 text-sm text-amber-400/80">
                Occasione: {selezionata.occasione}
              </p>
            )}
            {selezionata.note && <p className="mt-2 text-sm text-muted-foreground">Nota: {selezionata.note}</p>}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void apriDialogModifica()}
            >
              <Pencil className="mr-1.5 h-3.5 w-3.5" />
              Modifica vendita
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-red-400 hover:text-red-300"
              onClick={apriDialogElimina}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Elimina vendita
            </Button>
          </div>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-medium text-foreground">Righe</h3>
          {loadingDet ? (
            <p className="text-sm text-muted-foreground">Caricamento...</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="border-b border-border bg-secondary/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Prodotto</th>
                    <th className="px-4 py-2 text-left font-medium">Lotto</th>
                    <th className="px-4 py-2 text-left font-medium">Tipo</th>
                    <th className="px-4 py-2 text-left font-medium">Formato</th>
                    <th className="px-4 py-2 text-left font-medium">Omaggio</th>
                    <th className="px-4 py-2 text-right font-medium">Qtà</th>
                  </tr>
                </thead>
                <tbody>
                  {dettaglio.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-4 text-muted-foreground">
                        Nessuna riga
                      </td>
                    </tr>
                  ) : (
                    dettaglio.map((r) => (
                      <tr key={r.id} className="border-b border-border/50">
                        <td className="px-4 py-2 text-foreground/80">
                          {r.tipo_prodotto === 'altro' ? r.altro_prodotto_nome : r.birra_nome}
                        </td>
                        <td className="px-4 py-2 text-foreground/80">
                          {r.tipo_prodotto === 'altro' ? '-' : (r.numero_lotto ?? '-')}
                        </td>
                        <td className="px-4 py-2 text-foreground/80">{r.tipo_prodotto}</td>
                        <td className="px-4 py-2 text-foreground/80">
                          {r.tipo_prodotto === 'fusto' ? (r.formato_nome ?? '-') : '-'}
                        </td>
                        <td className="px-4 py-2 text-foreground/80">{r.omaggio === 1 ? 'Si' : '-'}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-foreground/80">{r.quantita}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Bottiglie: {selezionata.totale_bottiglie} — Fusti: {selezionata.totale_fusti} — Altri:{' '}
          {selezionata.totale_altri}
        </p>

        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent
            onOpenAutoFocus={(e) => e.preventDefault()}
            className="max-h-[90vh] max-w-2xl overflow-y-auto"
          >
            <DialogHeader>
              <DialogTitle>Modifica vendita</DialogTitle>
              <DialogDescription>
                Modifica cliente, data, quantità o rimuovi/aggiungi prodotti. Le giacenze verranno
                aggiornate automaticamente.
              </DialogDescription>
            </DialogHeader>

            {caricandoEdit && <p className="text-sm text-muted-foreground">Caricamento elenchi…</p>}

            <div className="grid gap-4">
              <label
                className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 ${
                  editOmaggio
                    ? 'border-amber-500/40 bg-amber-500/10'
                    : 'border-border bg-secondary/30'
                }`}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={editOmaggio}
                  onChange={(e) => {
                    setEditOmaggio(e.target.checked)
                    if (!e.target.checked) setEditOccasione('')
                  }}
                />
                <Gift
                  className={`h-4 w-4 ${
                    editOmaggio ? 'text-amber-400' : 'text-muted-foreground'
                  }`}
                />
                <div className="flex-1">
                  <div className="text-sm font-medium text-foreground">Vendita omaggio</div>
                  <div className="text-xs text-muted-foreground">
                    La giacenza viene scalata normalmente. Cliente opzionale.
                  </div>
                </div>
              </label>

              {editOmaggio && (
                <div className="grid gap-1.5">
                  <Label htmlFor="edit_occasione">Occasione</Label>
                  <Input
                    id="edit_occasione"
                    value={editOccasione}
                    onChange={(e) => setEditOccasione(e.target.value)}
                    placeholder="Es. Fiera Napoli, Evento, Omaggio cliente…"
                  />
                </div>
              )}

              <div className="grid gap-1.5">
                <Label htmlFor="edit_cliente">
                  Cliente{editOmaggio ? ' (opzionale per omaggi)' : ' *'}
                </Label>
                <select
                  id="edit_cliente"
                  className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  value={editClienteId}
                  onChange={(e) => setEditClienteId(e.target.value)}
                  disabled={caricandoEdit}
                >
                  <option value="">{editOmaggio ? 'Nessuno' : 'Seleziona…'}</option>
                  {clienti.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="edit_data">Data consegna *</Label>
                  <Input
                    id="edit_data"
                    type="date"
                    value={editData}
                    onChange={(e) => setEditData(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="edit_note">Note</Label>
                <Input
                  id="edit_note"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <Label>Righe esistenti</Label>
                </div>
                <div className="space-y-2">
                  {editRigheEsistenti.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nessuna riga esistente.</p>
                  ) : (
                    editRigheEsistenti.map((r) => {
                      const disp = disponibilitaEdit.get(r.key)
                      const maxQ = (disp?.giacenza ?? 0) + (disp?.originaleSuVendita ?? 0)
                      return (
                        <div
                          key={r.id}
                          className={`flex flex-col gap-2 rounded-md border px-2 py-2 sm:flex-row sm:items-center ${
                            r.eliminata
                              ? 'border-red-500/30 bg-red-500/5 opacity-60'
                              : 'border-border'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div
                              className={`truncate text-sm ${
                                r.eliminata ? 'line-through text-muted-foreground' : 'text-foreground/80'
                              }`}
                              title={r.label}
                            >
                              {r.label}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              originale: {r.quantitaOriginale} — max: {maxQ}
                            </div>
                            {r.tipo_prodotto === 'altro' && (
                              <label className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                                <input
                                  type="checkbox"
                                  checked={r.omaggio}
                                  onChange={(e) =>
                                    aggiornaRigaEsistente(r.id, { omaggio: e.target.checked })
                                  }
                                  disabled={r.eliminata}
                                />
                                Prodotto omaggio
                              </label>
                            )}
                          </div>
                          <div className="flex w-full items-center gap-2 sm:w-36">
                            <Input
                              type="number"
                              min={0}
                              max={maxQ}
                              className="h-9"
                              value={r.quantita}
                              disabled={r.eliminata}
                              onChange={(e) => aggiornaRigaEsistente(r.id, { quantita: e.target.value })}
                            />
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-9 w-9 shrink-0 p-0"
                            onClick={() => aggiornaRigaEsistente(r.id, { eliminata: !r.eliminata })}
                            title={r.eliminata ? 'Ripristina riga' : 'Rimuovi riga'}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <Label>Nuovi prodotti</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={aggiungiRigaNuova}
                    disabled={caricandoEdit}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Aggiungi prodotto
                  </Button>
                </div>
                <div className="space-y-2">
                  {editRigheNuove.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nessun prodotto aggiunto.</p>
                  ) : (
                    editRigheNuove.map((r) => {
                      const disp = r.key ? disponibilitaEdit.get(r.key) : undefined
                      const maxQ = (disp?.giacenza ?? 0) + (disp?.originaleSuVendita ?? 0)
                      return (
                        <div key={r.rowId} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                          <div className="min-w-0 flex-1">
                            <select
                              className="h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm"
                              value={r.key}
                              onChange={(e) =>
                                aggiornaRigaNuova(r.rowId, {
                                  key: e.target.value,
                                  quantita: '',
                                  omaggio: false
                                })
                              }
                            >
                              <option value="">Seleziona prodotto…</option>
                              {Array.from(disponibilitaEdit.entries()).map(([key, info]) => (
                                <option key={key} value={key}>
                                  {info.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="flex w-full items-center gap-2 sm:w-36">
                            <Input
                              type="number"
                              min={0}
                              max={r.key ? maxQ : undefined}
                              placeholder="Qtà"
                              className="h-9"
                              value={r.quantita}
                              onChange={(e) => aggiornaRigaNuova(r.rowId, { quantita: e.target.value })}
                            />
                            {r.key && (
                              <span className="whitespace-nowrap text-xs text-muted-foreground">
                                max {maxQ}
                              </span>
                            )}
                          </div>
                          {r.key.startsWith('altro:') && (
                            <label className="flex items-center gap-2 text-xs text-muted-foreground">
                              <input
                                type="checkbox"
                                checked={r.omaggio}
                                onChange={(e) =>
                                  aggiornaRigaNuova(r.rowId, { omaggio: e.target.checked })
                                }
                              />
                              Omaggio
                            </label>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-9 w-9 shrink-0 p-0"
                            onClick={() => rimuoviRigaNuova(r.rowId)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>

            {erroreEdit && <ModalError message={erroreEdit} />}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditOpen(false)}
                disabled={submittingEdit}
              >
                Annulla
              </Button>
              <Button
                type="button"
                onClick={() => void confermaModifica()}
                disabled={submittingEdit || caricandoEdit}
              >
                {submittingEdit ? 'Salvataggio…' : 'Salva modifiche'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogContent onOpenAutoFocus={(e) => e.preventDefault()} className="max-w-md">
            <DialogHeader>
              <DialogTitle>Elimina vendita</DialogTitle>
              <DialogDescription>
                Sei sicuro? Questa operazione ripristinerà le giacenze dei prodotti contenuti nella
                vendita.
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-md border border-border bg-secondary/30 p-3 text-sm">
              <div className="text-foreground">
                <span className="text-muted-foreground">Data:</span>{' '}
                {formatDataIt(selezionata.data)}
              </div>
              <div className="text-foreground">
                <span className="text-muted-foreground">Cliente:</span>{' '}
                {selezionata.cliente_nome ?? '—'}
                {selezionata.omaggio === 1 && (
                  <span className="ml-2 text-amber-400">(omaggio)</span>
                )}
              </div>
              <div className="text-foreground">
                <span className="text-muted-foreground">Totali:</span>{' '}
                {selezionata.totale_bottiglie} bottiglie · {selezionata.totale_fusti} fusti ·{' '}
                {selezionata.totale_altri} altri
              </div>
            </div>

            {erroreDelete && <ModalError message={erroreDelete} />}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDeleteOpen(false)}
                disabled={submittingDelete}
              >
                Annulla
              </Button>
              <Button
                type="button"
                onClick={() => void confermaElimina()}
                disabled={submittingDelete}
                className="bg-red-500 text-white hover:bg-red-600"
              >
                {submittingDelete ? 'Eliminazione…' : 'Elimina'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Vendite</h2>
          <p className="text-sm text-muted-foreground">Storico e registrazione vendite</p>
        </div>
        <Button onClick={() => void apriModal()} size="sm" type="button">
          <Plus className="mr-1.5 h-4 w-4" />
          Nuova vendita
        </Button>
      </div>

      {errore && !loading && (
        <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">{errore}</div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Caricamento...</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-border bg-secondary/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Data</th>
                <th className="px-4 py-2 text-left font-medium">Cliente</th>
                <th className="px-4 py-2 text-right font-medium">Bottiglie</th>
                <th className="px-4 py-2 text-right font-medium">Fusti</th>
                <th className="px-4 py-2 text-right font-medium">Altri</th>
                <th className="px-4 py-2 text-left font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {lista.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    <ShoppingCart className="mx-auto mb-1 h-8 w-8 text-muted-foreground/40" />
                    Nessuna vendita registrata
                  </td>
                </tr>
              ) : (
                lista.map((v) => (
                  <tr
                    key={v.id}
                    onClick={() => selezionaVendita(v)}
                    className="cursor-pointer border-b border-border/50 hover:bg-secondary/40"
                  >
                    <td className="px-4 py-2.5 text-foreground/80">
                      <div className="flex items-center gap-2">
                        <span>{formatDataIt(v.data)}</span>
                        {v.omaggio === 1 && (
                          <Badge className="bg-amber-500/15 text-amber-400 hover:bg-amber-500/20">
                            <Gift className="mr-1 h-3 w-3" />
                            Omaggio
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-medium text-foreground">
                      <div>{v.cliente_nome ?? '—'}</div>
                      {v.omaggio === 1 && v.occasione && (
                        <div className="text-xs font-normal text-amber-400/80">
                          {v.occasione}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-foreground/80">{v.totale_bottiglie}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-foreground/80">{v.totale_fusti}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-foreground/80">{v.totale_altri}</td>
                    <td className="max-w-[200px] truncate px-4 py-2.5 text-muted-foreground">{v.note || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="max-h-[90vh] max-w-2xl overflow-y-auto"
        >
          <DialogHeader>
            <DialogTitle>Nuova vendita</DialogTitle>
            <DialogDescription>Seleziona cliente, data e almeno un prodotto disponibile.</DialogDescription>
          </DialogHeader>

          {caricandoModal && <p className="text-sm text-muted-foreground">Caricamento elenchi…</p>}

          <div className="grid gap-4">
            <label
              className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 ${
                omaggio
                  ? 'border-amber-500/40 bg-amber-500/10'
                  : 'border-border bg-secondary/30'
              }`}
            >
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={omaggio}
                onChange={(e) => {
                  setOmaggio(e.target.checked)
                  if (!e.target.checked) setOccasione('')
                }}
              />
              <Gift
                className={`h-4 w-4 ${omaggio ? 'text-amber-400' : 'text-muted-foreground'}`}
              />
              <div className="flex-1">
                <div className="text-sm font-medium text-foreground">Vendita omaggio</div>
                <div className="text-xs text-muted-foreground">
                  La giacenza viene scalata normalmente. Cliente opzionale.
                </div>
              </div>
            </label>

            {omaggio && (
              <div className="grid gap-1.5">
                <Label htmlFor="v_occasione">Occasione</Label>
                <Input
                  id="v_occasione"
                  value={occasione}
                  onChange={(e) => setOccasione(e.target.value)}
                  placeholder="Es. Fiera Napoli, Evento, Omaggio cliente…"
                />
              </div>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="v_cliente">
                Cliente{omaggio ? ' (opzionale per omaggi)' : ' *'}
              </Label>
              <select
                id="v_cliente"
                className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                value={clienteId}
                onChange={(e) => setClienteId(e.target.value)}
                disabled={caricandoModal}
              >
                <option value="">{omaggio ? 'Nessuno' : 'Seleziona…'}</option>
                {clienti.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="v_data">Data consegna *</Label>
                <Input
                  id="v_data"
                  type="date"
                  value={dataVendita}
                  onChange={(e) => setDataVendita(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="v_note">Note</Label>
              <Input id="v_note" value={noteVendita} onChange={(e) => setNoteVendita(e.target.value)} />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <Label>Prodotti</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={aggiungiRigaBottiglia}
                    disabled={caricandoModal}
                  >
                    <Beer className="mr-1 h-3.5 w-3.5" />
                    Bottiglie
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={aggiungiRiga}
                    disabled={caricandoModal}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Fusti
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={aggiungiRigaAltro}
                    disabled={caricandoModal}
                  >
                    <Box className="mr-1 h-3.5 w-3.5" />
                    Altri prodotti
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                {righe.map((r) => {
                  if (r.tipo === 'fusto') {
                    const fustoSelezionato = r.suggerimenti.find(
                      (s) => prodottoKey('fusto', s.cotta_id, s.materiale_id) === r.key
                    )
                    const maxQ = fustoSelezionato?.quantita_disponibile ?? 0
                    return (
                      <div
                        key={r.rowId}
                        className="flex flex-col gap-2 rounded-md border border-sky-500/20 bg-sky-500/5 p-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium uppercase tracking-wide text-sky-400">
                            <Beer className="mr-1 inline h-3.5 w-3.5" />
                            Fusti
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 shrink-0 p-0"
                            onClick={() => rimuoviRiga(r.rowId)}
                            disabled={righe.length <= 1}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Birra *</Label>
                            <select
                              className="h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm"
                              value={r.birra_id}
                              onChange={(e) => void cambiaBirraRigaFusto(r.rowId, e.target.value)}
                            >
                              <option value="">Seleziona birra…</option>
                              {birreAttive.map((b) => (
                                <option key={b.id} value={b.id}>
                                  {b.nome}
                                  {b.stile ? ` (${b.stile})` : ''}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Fusti *</Label>
                            <Input
                              type="number"
                              min={0}
                              max={maxQ || undefined}
                              placeholder="Numero fusti"
                              className="h-9"
                              value={r.quantita}
                              disabled={!r.key}
                              onChange={(e) =>
                                aggiornaRigaFusto(r.rowId, { quantita: e.target.value })
                              }
                            />
                            {r.key && (
                              <span className="text-xs text-muted-foreground">max {maxQ}</span>
                            )}
                          </div>
                        </div>

                        {r.birra_id && (
                          <div className="space-y-1">
                            <Label className="text-xs">Lotto/Formato di provenienza *</Label>
                            {r.caricamentoSuggerimenti ? (
                              <p className="text-xs text-muted-foreground">Caricamento lotti…</p>
                            ) : r.suggerimenti.length === 0 ? (
                              <p className="text-xs text-red-400">
                                Nessun lotto con fusti disponibili per questa birra.
                              </p>
                            ) : (
                              <div className="space-y-1">
                                {r.suggerimenti.map((s, idx) => {
                                  const key = prodottoKey('fusto', s.cotta_id, s.materiale_id)
                                  const checked = key === r.key
                                  return (
                                    <label
                                      key={key}
                                      className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-xs ${
                                        checked
                                          ? 'border-sky-500/50 bg-sky-500/10'
                                          : 'border-border bg-background/40'
                                      }`}
                                    >
                                      <input
                                        type="radio"
                                        name={`fusto-${r.rowId}`}
                                        checked={checked}
                                        onChange={() =>
                                          aggiornaRigaFusto(r.rowId, {
                                            key,
                                            quantita: ''
                                          })
                                        }
                                      />
                                      <div className="flex flex-1 flex-wrap items-center gap-2">
                                        <span className="font-medium text-foreground">
                                          {s.numero_lotto}
                                        </span>
                                        <span className="text-muted-foreground">
                                          {s.formato_nome}
                                        </span>
                                        {idx === 0 && (
                                          <Badge className="bg-sky-500/15 text-sky-300">
                                            Consigliato
                                          </Badge>
                                        )}
                                        <span className="text-muted-foreground">
                                          scad. {formatDataIt(s.data_scadenza)}
                                        </span>
                                        <span className="ml-auto text-muted-foreground">
                                          <span className="font-medium text-foreground">
                                            {s.quantita_disponibile}
                                          </span>{' '}
                                          fusti
                                        </span>
                                      </div>
                                    </label>
                                  )
                                })}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  }

                  if (r.tipo === 'altro') {
                    const altroId = Number(r.altro_prodotto_id)
                    const maxAltro =
                      byKey.get(prodottoKey('altro', null, null, altroId))?.quantita_disponibile ?? 0
                    return (
                      <div
                        key={r.rowId}
                        className="flex flex-col gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium uppercase tracking-wide text-emerald-400">
                            <Box className="mr-1 inline h-3.5 w-3.5" />
                            Altri prodotti
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 shrink-0 p-0"
                            onClick={() => rimuoviRiga(r.rowId)}
                            disabled={righe.length <= 1}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Tipologia *</Label>
                            <select
                              className="h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm"
                              value={r.altro_prodotto_id}
                              onChange={(e) =>
                                aggiornaRigaAltro(r.rowId, {
                                  altro_prodotto_id: e.target.value,
                                  quantita: ''
                                })
                              }
                            >
                              <option value="">Seleziona prodotto…</option>
                              {altriProdotti.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.nome} — disponibili {a.quantita_disponibile}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Quantita *</Label>
                            <Input
                              type="number"
                              min={0}
                              max={maxAltro || undefined}
                              placeholder="Quantita"
                              className="h-9"
                              value={r.quantita}
                              disabled={!r.altro_prodotto_id}
                              onChange={(e) =>
                                aggiornaRigaAltro(r.rowId, { quantita: e.target.value })
                              }
                            />
                            {r.altro_prodotto_id && (
                              <span className="text-xs text-muted-foreground">max {maxAltro}</span>
                            )}
                          </div>
                        </div>
                        <label className="flex items-center gap-2 text-xs text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={r.omaggio}
                            onChange={(e) =>
                              aggiornaRigaAltro(r.rowId, { omaggio: e.target.checked })
                            }
                          />
                          Prodotto omaggio
                        </label>
                      </div>
                    )
                  }

                  const lottoSelezionato = r.suggerimenti.find(
                    (s) => s.cotta_id === Number(r.cotta_id)
                  )
                  const maxBottiglie = lottoSelezionato?.bottiglie_disponibili ?? 0
                  return (
                    <div
                      key={r.rowId}
                      className="flex flex-col gap-2 rounded-md border border-amber-500/20 bg-amber-500/5 p-3"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium uppercase tracking-wide text-amber-400">
                          <Beer className="mr-1 inline h-3.5 w-3.5" />
                          Bottiglie
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 shrink-0 p-0"
                          onClick={() => rimuoviRiga(r.rowId)}
                          disabled={righe.length <= 1}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        <div className="space-y-1">
                          <Label className="text-xs">Birra *</Label>
                          <select
                            className="h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm"
                            value={r.birra_id}
                            onChange={(e) =>
                              void cambiaBirraRigaBottiglia(r.rowId, e.target.value)
                            }
                          >
                            <option value="">Seleziona birra…</option>
                            {birreAttive.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.nome}
                                {b.stile ? ` (${b.stile})` : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Bottiglie *</Label>
                          <Input
                            type="number"
                            min={0}
                            max={maxBottiglie || undefined}
                            placeholder="Numero bottiglie"
                            className="h-9"
                            value={r.quantita}
                            disabled={!r.cotta_id}
                            onChange={(e) =>
                              aggiornaRigaBottiglia(r.rowId, { quantita: e.target.value })
                            }
                          />
                          {r.cotta_id && (
                            <span className="text-xs text-muted-foreground">
                              max {maxBottiglie}
                            </span>
                          )}
                        </div>
                      </div>

                      {r.birra_id && (
                        <div className="space-y-1">
                          <Label className="text-xs">Lotto di provenienza *</Label>
                          {r.caricamentoSuggerimenti ? (
                            <p className="text-xs text-muted-foreground">Caricamento lotti…</p>
                          ) : r.suggerimenti.length === 0 ? (
                            <p className="text-xs text-red-400">
                              Nessun lotto con bottiglie disponibili per questa birra.
                            </p>
                          ) : (
                            <div className="space-y-1">
                              {r.suggerimenti.map((s, idx) => {
                                const checked = String(s.cotta_id) === r.cotta_id
                                return (
                                  <label
                                    key={s.cotta_id}
                                    className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-xs ${
                                      checked
                                        ? 'border-amber-500/50 bg-amber-500/10'
                                        : 'border-border bg-background/40'
                                    }`}
                                  >
                                    <input
                                      type="radio"
                                      name={`lotto-${r.rowId}`}
                                      checked={checked}
                                      onChange={() =>
                                        aggiornaRigaBottiglia(r.rowId, {
                                          cotta_id: String(s.cotta_id),
                                          quantita: ''
                                        })
                                      }
                                    />
                                    <div className="flex flex-1 flex-wrap items-center gap-2">
                                      <span className="font-medium text-foreground">
                                        {s.numero_lotto}
                                      </span>
                                      {idx === 0 && (
                                        <Badge className="bg-amber-500/15 text-amber-400">
                                          Consigliato
                                        </Badge>
                                      )}
                                      <span className="text-muted-foreground">
                                        scad. {formatDataIt(s.data_scadenza)}
                                      </span>
                                      <span className="ml-auto text-muted-foreground">
                                        <span className="font-medium text-foreground">
                                          {s.bottiglie_disponibili}
                                        </span>{' '}
                                        bott.
                                      </span>
                                    </div>
                                  </label>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {erroreModal && <ModalError message={erroreModal} />}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setModalOpen(false)}
              disabled={submitting}
            >
              Annulla
            </Button>
            <Button
              type="button"
              onClick={() => void validaEInvia()}
              disabled={submitting || caricandoModal}
            >
              {submitting ? 'Registrazione…' : 'Registra vendita'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
