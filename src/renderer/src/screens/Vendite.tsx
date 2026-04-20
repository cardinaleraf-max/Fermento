import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Pencil, Plus, ShoppingCart, Trash2, AlertCircle } from 'lucide-react'
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
  cliente_id: number
  data: string
  note: string | null
  creato_il: string
  cliente_nome: string
  totale_cartoni: number
  totale_fusti: number
}

type VenditaRiga = {
  id: number
  vendita_id: number
  cotta_id: number
  tipo_prodotto: string
  materiale_id: number | null
  quantita: number
  birra_nome: string
  numero_lotto: string
  formato_nome: string | null
}

type GiacenzaRiga = {
  tipo: 'cartone' | 'fusto'
  cotta_id: number
  numero_lotto: string
  birra_nome: string
  quantita_disponibile: number
  data_scadenza: string
  materiale_id: number | null
  formato_nome: string | null
}

type ClienteOpt = { id: number; nome: string }

type RigaForm = { rowId: string; key: string; quantita: string }

type RigaEsistenteForm = {
  id: number
  key: string
  label: string
  cotta_id: number
  tipo_prodotto: 'cartone' | 'fusto'
  materiale_id: number | null
  quantitaOriginale: number
  quantita: string
  eliminata: boolean
}

const oggi = (): string => new Date().toISOString().split('T')[0]

function prodottoKey(
  tipo: 'cartone' | 'fusto',
  cotta_id: number,
  materiale_id: number | null
): string {
  if (tipo === 'cartone') return `cartone:${cotta_id}`
  return `fusto:${cotta_id}:${materiale_id ?? 0}`
}

function prodottoKeyDaGiacenza(r: GiacenzaRiga): string {
  return prodottoKey(r.tipo, r.cotta_id, r.materiale_id)
}

function labelProdottoDaGiacenza(r: GiacenzaRiga): string {
  if (r.tipo === 'cartone') {
    return `${r.birra_nome} — ${r.numero_lotto} — cartone — disponibili ${r.quantita_disponibile}`
  }
  return `${r.birra_nome} — ${r.numero_lotto} — fusto (${r.formato_nome ?? '?'}) — disponibili ${r.quantita_disponibile}`
}

function labelProdottoDaRiga(r: VenditaRiga): string {
  if (r.tipo_prodotto === 'cartone') {
    return `${r.birra_nome} — ${r.numero_lotto} — cartone`
  }
  return `${r.birra_nome} — ${r.numero_lotto} — fusto (${r.formato_nome ?? '?'})`
}

function parseProdottoKey(
  key: string
): { cotta_id: number; tipo_prodotto: 'cartone' | 'fusto'; materiale_id: number | null } {
  if (key.startsWith('cartone:')) {
    return { cotta_id: Number(key.split(':')[1]), tipo_prodotto: 'cartone', materiale_id: null }
  }
  const p = key.split(':')
  return { cotta_id: Number(p[1]), tipo_prodotto: 'fusto', materiale_id: Number(p[2]) }
}

function formatDataIt(s: string): string {
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleDateString('it-IT')
}

function newRigaForm(): RigaForm {
  return { rowId: `r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, key: '', quantita: '' }
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
  const [clienteId, setClienteId] = useState('')
  const [dataVendita, setDataVendita] = useState(oggi())
  const [noteVendita, setNoteVendita] = useState('')
  const [righe, setRighe] = useState<RigaForm[]>([newRigaForm()])
  const [erroreModal, setErroreModal] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [caricandoModal, setCaricandoModal] = useState(false)

  const [editOpen, setEditOpen] = useState(false)
  const [caricandoEdit, setCaricandoEdit] = useState(false)
  const [editClienteId, setEditClienteId] = useState('')
  const [editData, setEditData] = useState('')
  const [editNote, setEditNote] = useState('')
  const [editRigheEsistenti, setEditRigheEsistenti] = useState<RigaEsistenteForm[]>([])
  const [editRigheNuove, setEditRigheNuove] = useState<RigaForm[]>([])
  const [erroreEdit, setErroreEdit] = useState('')
  const [submittingEdit, setSubmittingEdit] = useState(false)

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [submittingDelete, setSubmittingDelete] = useState(false)
  const [erroreDelete, setErroreDelete] = useState('')

  const byKey = useMemo(() => {
    const m = new Map<string, GiacenzaRiga>()
    for (const g of giacenze) {
      m.set(prodottoKeyDaGiacenza(g), g)
    }
    return m
  }, [giacenze])

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
    setRighe([newRigaForm()])
    setCaricandoModal(true)
    setModalOpen(true)
    try {
      const [c, g] = await Promise.all([
        window.api.vendite.clienti(),
        window.api.vendite.giacenzeDisponibili()
      ])
      setClienti(c as ClienteOpt[])
      setGiacenze(g as GiacenzaRiga[])
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

  const rimuoviRiga = (rowId: string): void => {
    setRighe((p) => (p.length <= 1 ? p : p.filter((r) => r.rowId !== rowId)))
  }

  const aggiornaRiga = (rowId: string, patch: Partial<Pick<RigaForm, 'key' | 'quantita'>>): void => {
    setRighe((p) => p.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)))
  }

  const validaEInvia = async (): Promise<void> => {
    setErroreModal('')
    if (!clienteId) {
      setErroreModal('Seleziona un cliente')
      return
    }
    const righeCompilate = righe.filter((r) => r.key.trim() && (parseInt(r.quantita, 10) || 0) > 0)
    if (righeCompilate.length === 0) {
      setErroreModal('Aggiungi almeno un prodotto con quantità')
      return
    }

    const somme = new Map<string, number>()
    for (const r of righeCompilate) {
      if (!r.key) continue
      const q = parseInt(r.quantita, 10) || 0
      if (q <= 0) continue
      const prev = somme.get(r.key) ?? 0
      somme.set(r.key, prev + q)
    }
    for (const [k, somma] of somme) {
      const g = byKey.get(k)
      if (!g) {
        setErroreModal('Riga prodotto non valida (giacenza aggiornata: chiudi e riapri).')
        return
      }
      if (somma > g.quantita_disponibile) {
        setErroreModal(`La quantità totale per un prodotto non può superare ${g.quantita_disponibile} (riga: ${k})`)
        return
      }
    }

    const righeApi: Array<{
      cotta_id: number
      tipo_prodotto: 'cartone' | 'fusto'
      materiale_id: number | null
      quantita: number
    }> = []
    for (const r of righeCompilate) {
      const p = parseProdottoKey(r.key)
      righeApi.push({ ...p, quantita: parseInt(r.quantita, 10) || 0 })
    }

    setSubmitting(true)
    try {
      const res = await window.api.vendite.registra({
        cliente_id: Number(clienteId),
        data: dataVendita,
        note: noteVendita.trim() || null,
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
    setEditClienteId(String(selezionata.cliente_id))
    setEditData(selezionata.data)
    setEditNote(selezionata.note ?? '')
    setEditRigheEsistenti(
      dettaglio.map((r) => ({
        id: r.id,
        key: prodottoKey(
          r.tipo_prodotto === 'cartone' ? 'cartone' : 'fusto',
          r.cotta_id,
          r.materiale_id
        ),
        label: labelProdottoDaRiga(r),
        cotta_id: r.cotta_id,
        tipo_prodotto: r.tipo_prodotto === 'cartone' ? 'cartone' : 'fusto',
        materiale_id: r.materiale_id,
        quantitaOriginale: r.quantita,
        quantita: String(r.quantita),
        eliminata: false
      }))
    )
    setEditRigheNuove([])
    setCaricandoEdit(true)
    setEditOpen(true)
    try {
      const [c, g] = await Promise.all([
        window.api.vendite.clienti(),
        window.api.vendite.giacenzeDisponibili()
      ])
      setClienti(c as ClienteOpt[])
      setGiacenze(g as GiacenzaRiga[])
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
  }, [giacenze, editRigheEsistenti])

  const aggiornaRigaEsistente = (
    id: number,
    patch: Partial<Pick<RigaEsistenteForm, 'quantita' | 'eliminata'>>
  ): void => {
    setEditRigheEsistenti((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  const aggiungiRigaNuova = (): void => {
    setEditRigheNuove((p) => [...p, newRigaForm()])
  }

  const rimuoviRigaNuova = (rowId: string): void => {
    setEditRigheNuove((p) => p.filter((r) => r.rowId !== rowId))
  }

  const aggiornaRigaNuova = (
    rowId: string,
    patch: Partial<Pick<RigaForm, 'key' | 'quantita'>>
  ): void => {
    setEditRigheNuove((p) => p.map((r) => (r.rowId === rowId ? { ...r, ...patch } : r)))
  }

  const confermaModifica = async (): Promise<void> => {
    if (!selezionata) return
    setErroreEdit('')
    if (!editClienteId) {
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
      cotta_id: number
      tipo_prodotto: 'cartone' | 'fusto'
      materiale_id: number | null
      quantita: number
    }> = []
    for (const r of righeAttiveEsistenti) {
      righePayload.push({
        id: r.id,
        cotta_id: r.cotta_id,
        tipo_prodotto: r.tipo_prodotto,
        materiale_id: r.materiale_id,
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
        quantita: parseInt(r.quantita, 10) || 0
      })
    }

    setSubmittingEdit(true)
    try {
      const res = await window.api.vendite.modifica(selezionata.id, {
        cliente_id: Number(editClienteId),
        data: editData,
        note: editNote.trim() || null,
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
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Vendita</p>
            <h2 className="text-2xl font-semibold text-foreground">{formatDataIt(selezionata.data)}</h2>
            <p className="mt-1 text-lg text-foreground/80">{selezionata.cliente_nome}</p>
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
                    <th className="px-4 py-2 text-left font-medium">Birra</th>
                    <th className="px-4 py-2 text-left font-medium">Lotto</th>
                    <th className="px-4 py-2 text-left font-medium">Tipo</th>
                    <th className="px-4 py-2 text-left font-medium">Formato</th>
                    <th className="px-4 py-2 text-right font-medium">Qtà</th>
                  </tr>
                </thead>
                <tbody>
                  {dettaglio.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-4 text-muted-foreground">
                        Nessuna riga
                      </td>
                    </tr>
                  ) : (
                    dettaglio.map((r) => (
                      <tr key={r.id} className="border-b border-border/50">
                        <td className="px-4 py-2 text-foreground/80">{r.birra_nome}</td>
                        <td className="px-4 py-2 text-foreground/80">{r.numero_lotto}</td>
                        <td className="px-4 py-2 text-foreground/80">{r.tipo_prodotto}</td>
                        <td className="px-4 py-2 text-foreground/80">{r.tipo_prodotto === 'fusto' ? (r.formato_nome ?? '-') : '-'}</td>
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
          Cartoni: {selezionata.totale_cartoni} — Fusti: {selezionata.totale_fusti}
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
              <div className="grid gap-1.5">
                <Label htmlFor="edit_cliente">Cliente *</Label>
                <select
                  id="edit_cliente"
                  className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                  value={editClienteId}
                  onChange={(e) => setEditClienteId(e.target.value)}
                  disabled={caricandoEdit}
                >
                  <option value="">Seleziona…</option>
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
                              onChange={(e) => aggiornaRigaNuova(r.rowId, { key: e.target.value })}
                            >
                              <option value="">Seleziona prodotto…</option>
                              {giacenze.map((g) => (
                                <option key={prodottoKeyDaGiacenza(g)} value={prodottoKeyDaGiacenza(g)}>
                                  {labelProdottoDaGiacenza(g)}
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
                <span className="text-muted-foreground">Cliente:</span> {selezionata.cliente_nome}
              </div>
              <div className="text-foreground">
                <span className="text-muted-foreground">Totali:</span>{' '}
                {selezionata.totale_cartoni} cartoni · {selezionata.totale_fusti} fusti
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
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-border bg-secondary/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Data</th>
                <th className="px-4 py-2 text-left font-medium">Cliente</th>
                <th className="px-4 py-2 text-right font-medium">Cartoni</th>
                <th className="px-4 py-2 text-right font-medium">Fusti</th>
                <th className="px-4 py-2 text-left font-medium">Note</th>
              </tr>
            </thead>
            <tbody>
              {lista.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
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
                    <td className="px-4 py-2.5 text-foreground/80">{formatDataIt(v.data)}</td>
                    <td className="px-4 py-2.5 font-medium text-foreground">{v.cliente_nome}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-foreground/80">{v.totale_cartoni}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-foreground/80">{v.totale_fusti}</td>
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
            <div className="grid gap-1.5">
              <Label htmlFor="v_cliente">Cliente *</Label>
              <select
                id="v_cliente"
                className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                value={clienteId}
                onChange={(e) => setClienteId(e.target.value)}
                disabled={caricandoModal}
              >
                <option value="">Seleziona…</option>
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
                <Button type="button" variant="outline" size="sm" onClick={aggiungiRiga} disabled={caricandoModal}>
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Aggiungi prodotto
                </Button>
              </div>
              <div className="space-y-2">
                {righe.map((r) => {
                  const maxQ = r.key && byKey.has(r.key) ? (byKey.get(r.key)!.quantita_disponibile ?? 0) : 0
                  return (
                    <div key={r.rowId} className="flex flex-col gap-2 sm:flex-row sm:items-end">
                      <div className="min-w-0 flex-1">
                        <select
                          className="h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm"
                          value={r.key}
                          onChange={(e) => aggiornaRiga(r.rowId, { key: e.target.value })}
                        >
                          <option value="">Seleziona prodotto…</option>
                          {giacenze.map((g) => (
                            <option key={prodottoKeyDaGiacenza(g)} value={prodottoKeyDaGiacenza(g)}>
                              {labelProdottoDaGiacenza(g)}
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
                          onChange={(e) => aggiornaRiga(r.rowId, { quantita: e.target.value })}
                        />
                        {r.key && <span className="whitespace-nowrap text-xs text-muted-foreground">max {maxQ}</span>}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-9 w-9 shrink-0 p-0"
                        onClick={() => rimuoviRiga(r.rowId)}
                        disabled={righe.length <= 1}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
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
