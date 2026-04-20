import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Pencil, Plus, Trash2 } from 'lucide-react'
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

type MaterialeConfezionamento = {
  id: number
  nome: string
  categoria: string
  birra_id: number | null
  birra_nome: string | null
  capacita_cl: number | null
  capacita_litri: number | null
  soglia_riordino: number | null
  giacenza: number
}

type MovimentoConfezionamento = {
  id: number
  tipo_movimento: string
  quantita: number
  data: string
  causale: string | null
  note: string | null
}

type ModificaMovimentoForm = {
  quantita: string
  note: string
}

type CaricoForm = {
  quantita: string
  note: string
}

type NuovoMaterialeForm = {
  nome: string
  categoria: 'bottiglia' | 'etichetta' | 'tappo' | 'fusto'
  birra_id: string
  capacita_cl: string
  capacita_litri: string
  soglia_riordino: string
}

type BirraOption = Awaited<ReturnType<typeof window.api.impostazioni.birre>>[number]

const defaultCaricoForm: CaricoForm = {
  quantita: '',
  note: ''
}

const defaultNuovoMaterialeForm: NuovoMaterialeForm = {
  nome: '',
  categoria: 'bottiglia',
  birra_id: '',
  capacita_cl: '',
  capacita_litri: '',
  soglia_riordino: ''
}

function categoriaBadgeClass(categoria: string): string {
  switch (categoria) {
    case 'bottiglia':
      return 'bg-blue-500/15 text-blue-400 border-blue-500/25'
    case 'etichetta':
      return 'bg-purple-500/15 text-purple-400 border-purple-500/25'
    case 'tappo':
      return 'bg-secondary text-muted-foreground border-border'
    case 'fusto':
      return 'bg-orange-500/15 text-orange-400 border-orange-500/25'
    default:
      return 'bg-secondary text-muted-foreground border-border'
  }
}

export default function MagazzinoConf(): React.JSX.Element {
  const [materiali, setMateriali] = useState<MaterialeConfezionamento[]>([])
  const [movimenti, setMovimenti] = useState<MovimentoConfezionamento[]>([])
  const [materialeSelezionatoId, setMaterialeSelezionatoId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMovimenti, setLoadingMovimenti] = useState(false)
  const [errore, setErrore] = useState('')
  const [erroreModal, setErroreModal] = useState('')
  const [dialogCaricoOpen, setDialogCaricoOpen] = useState(false)
  const [dialogSogliaOpen, setDialogSogliaOpen] = useState(false)
  const [dialogNuovoMaterialeOpen, setDialogNuovoMaterialeOpen] = useState(false)
  const [caricoForm, setCaricoForm] = useState<CaricoForm>(defaultCaricoForm)
  const [nuovoMaterialeForm, setNuovoMaterialeForm] = useState<NuovoMaterialeForm>(defaultNuovoMaterialeForm)
  const [sogliaInput, setSogliaInput] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [birre, setBirre] = useState<BirraOption[]>([])
  const [dialogModificaMovimentoOpen, setDialogModificaMovimentoOpen] = useState(false)
  const [dialogEliminaMovimentoOpen, setDialogEliminaMovimentoOpen] = useState(false)
  const [movimentoSelezionato, setMovimentoSelezionato] = useState<MovimentoConfezionamento | null>(null)
  const [modificaMovimentoForm, setModificaMovimentoForm] = useState<ModificaMovimentoForm>({
    quantita: '',
    note: ''
  })

  const materialeSelezionato = useMemo(
    () => materiali.find((materiale) => materiale.id === materialeSelezionatoId) ?? null,
    [materialeSelezionatoId, materiali]
  )

  const loadMateriali = async (): Promise<void> => {
    setLoading(true)
    setErrore('')
    try {
      const lista = await window.api.conf.lista()
      setMateriali(lista)

      if (lista.length === 0) {
        setMaterialeSelezionatoId(null)
      } else if (!materialeSelezionatoId || !lista.some((item) => item.id === materialeSelezionatoId)) {
        setMaterialeSelezionatoId(lista[0].id)
      }
    } catch (err) {
      setErrore(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const loadMovimenti = async (materialeId: number): Promise<void> => {
    setLoadingMovimenti(true)
    try {
      const movimentiDb = await window.api.conf.movimenti(materialeId)
      setMovimenti(movimentiDb)
    } catch {
      setMovimenti([])
    } finally {
      setLoadingMovimenti(false)
    }
  }

  useEffect(() => {
    void loadMateriali()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        const birreDb = await window.api.impostazioni.birre()
        setBirre(birreDb)
      } catch {
        setBirre([])
      }
    })()
  }, [])

  useEffect(() => {
    if (!materialeSelezionatoId) {
      setMovimenti([])
      return
    }

    void loadMovimenti(materialeSelezionatoId)
  }, [materialeSelezionatoId])

  const openCaricoDialog = (): void => {
    if (!materialeSelezionatoId) return
    setErroreModal('')
    setCaricoForm(defaultCaricoForm)
    setDialogCaricoOpen(true)
  }

  const openSogliaDialog = (): void => {
    if (!materialeSelezionato) return
    setErroreModal('')
    setSogliaInput(materialeSelezionato.soglia_riordino?.toString() ?? '')
    setDialogSogliaOpen(true)
  }

  const openNuovoMaterialeDialog = (): void => {
    setErroreModal('')
    setNuovoMaterialeForm(defaultNuovoMaterialeForm)
    setDialogNuovoMaterialeOpen(true)
  }

  const handleCarico = async (): Promise<void> => {
    if (!materialeSelezionatoId) return
    if (!caricoForm.quantita || Number(caricoForm.quantita) <= 0) {
      setErroreModal('Inserisci una quantita valida')
      return
    }

    setIsSubmitting(true)
    setErroreModal('')
    try {
      await window.api.conf.carico({
        materiale_id: materialeSelezionatoId,
        quantita: Number(caricoForm.quantita),
        note: caricoForm.note.trim() || null
      })

      setDialogCaricoOpen(false)
      await loadMateriali()
      await loadMovimenti(materialeSelezionatoId)
    } catch {
      setErroreModal('Errore durante la registrazione del carico')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAggiornaSoglia = async (): Promise<void> => {
    if (!materialeSelezionatoId) return
    if (!sogliaInput || Number(sogliaInput) < 0) {
      setErroreModal('Inserisci una soglia valida')
      return
    }

    setIsSubmitting(true)
    setErroreModal('')
    try {
      await window.api.conf.aggiornaSoglia({
        materiale_id: materialeSelezionatoId,
        soglia_riordino: Number(sogliaInput)
      })

      setDialogSogliaOpen(false)
      await loadMateriali()
      await loadMovimenti(materialeSelezionatoId)
    } catch {
      setErroreModal("Errore durante l'aggiornamento della soglia")
    } finally {
      setIsSubmitting(false)
    }
  }

  const openModificaMovimentoDialog = (movimento: MovimentoConfezionamento): void => {
    if (movimento.tipo_movimento !== 'carico') {
      setErrore('Solo i movimenti di carico sono modificabili')
      return
    }
    setErroreModal('')
    setMovimentoSelezionato(movimento)
    setModificaMovimentoForm({
      quantita: movimento.quantita?.toString() ?? '',
      note: movimento.note ?? ''
    })
    setDialogModificaMovimentoOpen(true)
  }

  const openEliminaMovimentoDialog = (movimento: MovimentoConfezionamento): void => {
    if (movimento.tipo_movimento !== 'carico') {
      setErrore('I movimenti di scarico non sono eliminabili')
      return
    }
    setErroreModal('')
    setMovimentoSelezionato(movimento)
    setDialogEliminaMovimentoOpen(true)
  }

  const handleModificaMovimento = async (): Promise<void> => {
    if (!movimentoSelezionato || !materialeSelezionatoId) return
    const q = Number(modificaMovimentoForm.quantita)
    if (!Number.isFinite(q) || q <= 0) {
      setErroreModal('Inserisci una quantita valida')
      return
    }

    setIsSubmitting(true)
    setErroreModal('')
    try {
      const result = await window.api.conf.modificaMovimento(movimentoSelezionato.id, {
        quantita: q,
        note: modificaMovimentoForm.note.trim() || null
      })
      if (!result.ok) {
        setErroreModal(result.errore)
        return
      }
      setDialogModificaMovimentoOpen(false)
      setMovimentoSelezionato(null)
      await loadMateriali()
      await loadMovimenti(materialeSelezionatoId)
    } catch {
      setErroreModal('Errore durante la modifica del movimento')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEliminaMovimento = async (): Promise<void> => {
    if (!movimentoSelezionato || !materialeSelezionatoId) return
    setIsSubmitting(true)
    setErroreModal('')
    try {
      const result = await window.api.conf.eliminaMovimento(movimentoSelezionato.id)
      if (!result.ok) {
        setErroreModal(result.errore)
        return
      }
      setDialogEliminaMovimentoOpen(false)
      setMovimentoSelezionato(null)
      await loadMateriali()
      await loadMovimenti(materialeSelezionatoId)
    } catch {
      setErroreModal("Errore durante l'eliminazione del movimento")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleNuovoMateriale = async (): Promise<void> => {
    if (!nuovoMaterialeForm.nome.trim()) {
      setErroreModal('Inserisci il nome del materiale')
      return
    }
    if (!nuovoMaterialeForm.soglia_riordino || Number(nuovoMaterialeForm.soglia_riordino) < 0) {
      setErroreModal('Inserisci una soglia riordino valida')
      return
    }
    if (nuovoMaterialeForm.categoria === 'etichetta' && !nuovoMaterialeForm.birra_id) {
      setErroreModal('Seleziona la birra associata per l’etichetta')
      return
    }
    if (nuovoMaterialeForm.categoria === 'bottiglia' && !nuovoMaterialeForm.capacita_cl) {
      setErroreModal('Inserisci la capacità in cl')
      return
    }
    if (nuovoMaterialeForm.categoria === 'fusto' && !nuovoMaterialeForm.capacita_litri) {
      setErroreModal('Inserisci la capacità in litri')
      return
    }

    const confApi = window.api.conf as typeof window.api.conf & {
      creaMateriale?: (payload: {
        nome: string
        categoria: string
        birra_id: number | null
        capacita_cl: number | null
        capacita_litri: number | null
        soglia_riordino: number
      }) => Promise<{ ok: true; id: number }>
    }

    if (!confApi.creaMateriale) {
      setErroreModal("Manca l'handler IPC `conf:crea-materiale` (e quindi anche la creazione automatica in `giacenza_confezionamento`).")
      return
    }

    setIsSubmitting(true)
    setErroreModal('')
    try {
      await confApi.creaMateriale({
        nome: nuovoMaterialeForm.nome.trim(),
        categoria: nuovoMaterialeForm.categoria,
        birra_id: nuovoMaterialeForm.categoria === 'etichetta' ? Number(nuovoMaterialeForm.birra_id) : null,
        capacita_cl: nuovoMaterialeForm.categoria === 'bottiglia' ? Number(nuovoMaterialeForm.capacita_cl) : null,
        capacita_litri: nuovoMaterialeForm.categoria === 'fusto' ? Number(nuovoMaterialeForm.capacita_litri) : null,
        soglia_riordino: Number(nuovoMaterialeForm.soglia_riordino)
      })
      setDialogNuovoMaterialeOpen(false)
      await loadMateriali()
    } catch {
      setErroreModal('Errore durante la creazione del materiale')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="grid min-h-[calc(100vh-9rem)] grid-cols-1 gap-4 xl:grid-cols-[1.2fr_1fr]">
      <section className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">Materiali confezionamento</h3>
          <Button size="sm" onClick={openNuovoMaterialeDialog}>
            <Plus className="mr-1 h-4 w-4" />
            Nuovo materiale
          </Button>
        </div>

        {loading ? (
          <div className="p-4 text-sm text-muted-foreground">Caricamento...</div>
        ) : errore ? (
          <div className="p-4 text-sm text-destructive">{errore}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-secondary/40 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Nome</th>
                  <th className="px-4 py-2 font-medium">Categoria</th>
                  <th className="px-4 py-2 font-medium">Giacenza</th>
                  <th className="px-4 py-2 font-medium">Soglia riordino</th>
                  <th className="px-4 py-2 font-medium">Stato</th>
                </tr>
              </thead>
              <tbody>
                {materiali.map((materiale) => {
                  const attivo = materiale.id === materialeSelezionatoId
                  const haSoglia = materiale.soglia_riordino !== null
                  const sottoSoglia = haSoglia && materiale.giacenza <= (materiale.soglia_riordino ?? 0)

                  return (
                    <tr
                      key={materiale.id}
                      className={`cursor-pointer border-b border-border/50 ${attivo ? 'bg-secondary' : 'hover:bg-secondary/40'}`}
                      onClick={() => setMaterialeSelezionatoId(materiale.id)}
                    >
                      <td className="px-4 py-2">{materiale.nome}</td>
                      <td className="px-4 py-2">
                        <Badge variant="outline" className={categoriaBadgeClass(materiale.categoria)}>
                          {materiale.categoria}
                        </Badge>
                      </td>
                      <td className="px-4 py-2">{materiale.giacenza}</td>
                      <td className="px-4 py-2">{materiale.soglia_riordino ?? '-'}</td>
                      <td className="px-4 py-2">
                        {haSoglia ? (
                          <Badge className={sottoSoglia ? 'bg-red-500/15 text-red-400' : 'bg-emerald-500/15 text-emerald-400'}>
                            {sottoSoglia ? 'Sotto soglia' : 'OK'}
                          </Badge>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card">
        {!materialeSelezionato ? (
          <div className="flex h-full min-h-[320px] items-center justify-center text-sm text-muted-foreground">
            Seleziona un materiale per vedere il dettaglio
          </div>
        ) : (
          <div className="space-y-4 p-4">
            <div>
              <h3 className="text-base font-semibold text-foreground">{materialeSelezionato.nome}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{materialeSelezionato.categoria}</p>
            </div>

            <div className="grid gap-2 rounded-md border border-border bg-secondary/30 p-3 text-sm">
              <div>
                <span className="font-medium text-foreground/80">Capacita:</span>{' '}
                {materialeSelezionato.categoria === 'bottiglia' && materialeSelezionato.capacita_cl
                  ? `${materialeSelezionato.capacita_cl} cl`
                  : materialeSelezionato.categoria === 'fusto' && materialeSelezionato.capacita_litri
                    ? `${materialeSelezionato.capacita_litri} L`
                    : '-'}
              </div>
              <div>
                <span className="font-medium text-foreground/80">Birra associata:</span> {materialeSelezionato.birra_nome ?? '-'}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-foreground/80">Soglia riordino:</span>{' '}
                {materialeSelezionato.soglia_riordino ?? '-'}
                <Button variant="outline" size="sm" onClick={openSogliaDialog}>
                  <Pencil className="mr-1 h-3.5 w-3.5" />
                  Modifica soglia
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-foreground">Movimenti</h4>
              <Button size="sm" onClick={openCaricoDialog}>
                <Plus className="mr-1 h-4 w-4" />
                Nuovo carico
              </Button>
            </div>

            {loadingMovimenti ? (
              <p className="text-sm text-muted-foreground">Caricamento movimenti...</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-secondary/40 text-left text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Data</th>
                      <th className="px-3 py-2 font-medium">Tipo</th>
                      <th className="px-3 py-2 font-medium">Quantita</th>
                      <th className="px-3 py-2 font-medium">Causale</th>
                      <th className="px-3 py-2 font-medium">Note</th>
                      <th className="px-3 py-2 font-medium text-right">Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movimenti.map((movimento) => {
                      const isCarico = movimento.tipo_movimento === 'carico'
                      return (
                        <tr key={movimento.id} className="border-b border-border/50">
                          <td className="px-3 py-2">{movimento.data}</td>
                          <td className={`px-3 py-2 font-medium ${isCarico ? 'text-emerald-400' : 'text-red-400'}`}>
                            {movimento.tipo_movimento}
                          </td>
                          <td className="px-3 py-2">{movimento.quantita}</td>
                          <td className="px-3 py-2">{movimento.causale ?? '-'}</td>
                          <td className="px-3 py-2">{movimento.note ?? '-'}</td>
                          <td className="px-3 py-2">
                            {isCarico ? (
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openModificaMovimentoDialog(movimento)}
                                  title="Modifica movimento"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => openEliminaMovimentoDialog(movimento)}
                                  title="Elimina movimento"
                                  className="text-red-400 hover:text-red-300"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            ) : (
                              <div className="text-right text-xs text-muted-foreground">-</div>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                    {movimenti.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-3 text-muted-foreground">
                          Nessun movimento disponibile
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>

      <Dialog open={dialogCaricoOpen} onOpenChange={setDialogCaricoOpen}>
        <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Nuovo carico</DialogTitle>
            <DialogDescription>Registra il carico per il materiale selezionato.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="conf_quantita">Quantita</Label>
              <Input
                id="conf_quantita"
                type="number"
                value={caricoForm.quantita}
                onChange={(event) => setCaricoForm((prev) => ({ ...prev, quantita: event.target.value }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="conf_note">Note</Label>
              <Input
                id="conf_note"
                value={caricoForm.note}
                onChange={(event) => setCaricoForm((prev) => ({ ...prev, note: event.target.value }))}
              />
            </div>
          </div>
          {erroreModal && <ModalError message={erroreModal} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogCaricoOpen(false)}>
              Annulla
            </Button>
            <Button onClick={handleCarico} disabled={isSubmitting}>
              Registra carico
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogSogliaOpen} onOpenChange={setDialogSogliaOpen}>
        <DialogContent className="max-w-sm" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Modifica soglia</DialogTitle>
            <DialogDescription>Aggiorna la soglia di riordino del materiale.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="conf_soglia">Soglia riordino</Label>
            <Input
              id="conf_soglia"
              type="number"
              value={sogliaInput}
              onChange={(event) => setSogliaInput(event.target.value)}
            />
          </div>
          {erroreModal && <ModalError message={erroreModal} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogSogliaOpen(false)}>
              Annulla
            </Button>
            <Button onClick={handleAggiornaSoglia} disabled={isSubmitting}>
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialogModificaMovimentoOpen}
        onOpenChange={(open) => {
          setDialogModificaMovimentoOpen(open)
          if (!open) setMovimentoSelezionato(null)
        }}
      >
        <DialogContent className="max-w-sm" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Modifica movimento</DialogTitle>
            <DialogDescription>
              Aggiorna il carico selezionato. La giacenza sara ricalcolata automaticamente.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="mov_quantita">Quantita</Label>
              <Input
                id="mov_quantita"
                type="number"
                value={modificaMovimentoForm.quantita}
                onChange={(event) =>
                  setModificaMovimentoForm((prev) => ({ ...prev, quantita: event.target.value }))
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mov_note">Note</Label>
              <Input
                id="mov_note"
                value={modificaMovimentoForm.note}
                onChange={(event) =>
                  setModificaMovimentoForm((prev) => ({ ...prev, note: event.target.value }))
                }
              />
            </div>
          </div>
          {erroreModal && <ModalError message={erroreModal} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogModificaMovimentoOpen(false)}>
              Annulla
            </Button>
            <Button onClick={handleModificaMovimento} disabled={isSubmitting}>
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialogEliminaMovimentoOpen}
        onOpenChange={(open) => {
          setDialogEliminaMovimentoOpen(open)
          if (!open) setMovimentoSelezionato(null)
        }}
      >
        <DialogContent className="max-w-sm" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Elimina movimento</DialogTitle>
            <DialogDescription>
              Sei sicuro di voler eliminare questo carico? La giacenza sara aggiornata sottraendo la quantita.
            </DialogDescription>
          </DialogHeader>
          {movimentoSelezionato && (
            <div className="rounded-md border border-border bg-secondary/30 p-3 text-sm">
              <div>
                <span className="font-medium text-foreground/80">Data:</span> {movimentoSelezionato.data}
              </div>
              <div>
                <span className="font-medium text-foreground/80">Quantita:</span> {movimentoSelezionato.quantita}
              </div>
              <div>
                <span className="font-medium text-foreground/80">Note:</span>{' '}
                {movimentoSelezionato.note ?? '-'}
              </div>
            </div>
          )}
          {erroreModal && <ModalError message={erroreModal} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogEliminaMovimentoOpen(false)}>
              Annulla
            </Button>
            <Button
              onClick={handleEliminaMovimento}
              disabled={isSubmitting}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Elimina
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogNuovoMaterialeOpen} onOpenChange={setDialogNuovoMaterialeOpen}>
        <DialogContent className="max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Nuovo materiale</DialogTitle>
            <DialogDescription>Aggiungi un nuovo materiale di confezionamento.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="conf_new_nome">Nome</Label>
              <Input
                id="conf_new_nome"
                value={nuovoMaterialeForm.nome}
                onChange={(event) => setNuovoMaterialeForm((prev) => ({ ...prev, nome: event.target.value }))}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="conf_new_categoria">Categoria</Label>
              <select
                id="conf_new_categoria"
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={nuovoMaterialeForm.categoria}
                onChange={(event) =>
                  setNuovoMaterialeForm((prev) => ({
                    ...prev,
                    categoria: event.target.value as NuovoMaterialeForm['categoria'],
                    birra_id: '',
                    capacita_cl: '',
                    capacita_litri: ''
                  }))
                }
              >
                <option value="bottiglia">bottiglia</option>
                <option value="etichetta">etichetta</option>
                <option value="tappo">tappo</option>
                <option value="fusto">fusto</option>
              </select>
            </div>

            {nuovoMaterialeForm.categoria === 'etichetta' && (
              <div className="grid gap-1.5">
                <Label htmlFor="conf_new_birra">Birra associata</Label>
                <select
                  id="conf_new_birra"
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  value={nuovoMaterialeForm.birra_id}
                  onChange={(event) => setNuovoMaterialeForm((prev) => ({ ...prev, birra_id: event.target.value }))}
                >
                  <option value="">Seleziona birra</option>
                  {birre.map((birra) => (
                    <option key={birra.id} value={birra.id}>
                      {birra.nome}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {nuovoMaterialeForm.categoria === 'bottiglia' && (
              <div className="grid gap-1.5">
                <Label htmlFor="conf_new_capacita_cl">Capacità cl</Label>
                <Input
                  id="conf_new_capacita_cl"
                  type="number"
                  value={nuovoMaterialeForm.capacita_cl}
                  onChange={(event) =>
                    setNuovoMaterialeForm((prev) => ({ ...prev, capacita_cl: event.target.value }))
                  }
                />
              </div>
            )}

            {nuovoMaterialeForm.categoria === 'fusto' && (
              <div className="grid gap-1.5">
                <Label htmlFor="conf_new_capacita_litri">Capacità litri</Label>
                <Input
                  id="conf_new_capacita_litri"
                  type="number"
                  value={nuovoMaterialeForm.capacita_litri}
                  onChange={(event) =>
                    setNuovoMaterialeForm((prev) => ({ ...prev, capacita_litri: event.target.value }))
                  }
                />
              </div>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="conf_new_soglia">Soglia riordino</Label>
              <Input
                id="conf_new_soglia"
                type="number"
                value={nuovoMaterialeForm.soglia_riordino}
                onChange={(event) =>
                  setNuovoMaterialeForm((prev) => ({ ...prev, soglia_riordino: event.target.value }))
                }
              />
            </div>
          </div>

          {erroreModal && <ModalError message={erroreModal} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogNuovoMaterialeOpen(false)}>
              Annulla
            </Button>
            <Button onClick={handleNuovoMateriale} disabled={isSubmitting}>
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ModalError({ message }: { message: string }): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
      <AlertCircle className="h-4 w-4" />
      <span>{message}</span>
    </div>
  )
}
