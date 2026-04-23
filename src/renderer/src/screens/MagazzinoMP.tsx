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

type MateriaPrima = {
  id: number
  nome: string
  categoria: string
  unita_misura: string
  soglia_riordino_fissa: number | null
  soglia_riordino_dinamica_cotte: number | null
  fornitore_preferito: string | null
  note: string | null
  giacenza_totale: number
}

type LottoMateriaPrima = {
  id: number
  lotto_fornitore: string
  fornitore_nome: string | null
  data_carico: string
  data_scadenza: string
  quantita_iniziale: number
  quantita_residua: number
  note: string | null
}

type ModificaLottoForm = {
  lotto_fornitore: string
  data_scadenza: string
  quantita_residua: string
  note: string
}

type FornitoreOption = {
  id: number
  nome: string
}

type MateriaPrimaForm = {
  nome: string
  categoria: 'malto' | 'luppolo' | 'lievito' | 'altro'
  unita_misura: 'kg' | 'g'
  soglia_riordino_fissa: string
  soglia_riordino_dinamica_cotte: string
  fornitore_preferito: string
  note: string
}

type CaricoForm = {
  lotto_fornitore: string
  fornitore_id: string
  data_carico: string
  data_scadenza: string
  quantita: string
}

const TODAY = new Date().toISOString().split('T')[0]
const SOGLIA_SCADENZA_DEFAULT = 60

const defaultMateriaPrimaForm: MateriaPrimaForm = {
  nome: '',
  categoria: 'malto',
  unita_misura: 'kg',
  soglia_riordino_fissa: '',
  soglia_riordino_dinamica_cotte: '',
  fornitore_preferito: '',
  note: ''
}

const defaultCaricoForm: CaricoForm = {
  lotto_fornitore: '',
  fornitore_id: '',
  data_carico: TODAY,
  data_scadenza: '',
  quantita: ''
}

function categoryBadgeClass(categoria: string): string {
  switch (categoria) {
    case 'malto':
      return 'bg-amber-500/15 text-amber-400 border-amber-500/25'
    case 'luppolo':
      return 'bg-green-500/15 text-green-400 border-green-500/25'
    case 'lievito':
      return 'bg-blue-500/15 text-blue-400 border-blue-500/25'
    default:
      return 'bg-secondary text-muted-foreground border-border'
  }
}

function isNearExpiry(dataScadenza: string, sogliaGiorni: number): boolean {
  const oggi = new Date()
  const scadenza = new Date(dataScadenza)
  const diffMs = scadenza.getTime() - oggi.getTime()
  const diffGiorni = diffMs / (1000 * 60 * 60 * 24)
  return diffGiorni <= sogliaGiorni
}

export default function MagazzinoMP(): React.JSX.Element {
  const [materiePrime, setMateriePrime] = useState<MateriaPrima[]>([])
  const [lotti, setLotti] = useState<LottoMateriaPrima[]>([])
  const [fornitori, setFornitori] = useState<FornitoreOption[]>([])
  const [materiaSelezionataId, setMateriaSelezionataId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingLotti, setLoadingLotti] = useState(false)
  const [errore, setErrore] = useState('')
  const [erroreModal, setErroreModal] = useState('')
  const [dialogNuovaOpen, setDialogNuovaOpen] = useState(false)
  const [dialogModificaOpen, setDialogModificaOpen] = useState(false)
  const [dialogEliminaMateriaOpen, setDialogEliminaMateriaOpen] = useState(false)
  const [dialogCaricoOpen, setDialogCaricoOpen] = useState(false)
  const [materiaForm, setMateriaForm] = useState<MateriaPrimaForm>(defaultMateriaPrimaForm)
  const [caricoForm, setCaricoForm] = useState<CaricoForm>(defaultCaricoForm)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [dialogModificaLottoOpen, setDialogModificaLottoOpen] = useState(false)
  const [dialogEliminaLottoOpen, setDialogEliminaLottoOpen] = useState(false)
  const [lottoSelezionato, setLottoSelezionato] = useState<LottoMateriaPrima | null>(null)
  const [modificaLottoForm, setModificaLottoForm] = useState<ModificaLottoForm>({
    lotto_fornitore: '',
    data_scadenza: '',
    quantita_residua: '',
    note: ''
  })

  const materiaSelezionata = useMemo(
    () => materiePrime.find((materiaPrima) => materiaPrima.id === materiaSelezionataId) ?? null,
    [materiePrime, materiaSelezionataId]
  )

  const loadMateriePrime = async (): Promise<void> => {
    setLoading(true)
    setErrore('')
    try {
      const lista = await window.api.mp.lista()
      setMateriePrime(lista)

      if (lista.length === 0) {
        setMateriaSelezionataId(null)
      } else if (!materiaSelezionataId || !lista.some((item) => item.id === materiaSelezionataId)) {
        setMateriaSelezionataId(lista[0].id)
      }
    } catch (err) {
      setErrore(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const loadFornitori = async (): Promise<void> => {
    try {
      const listaFornitori = await window.api.mp.fornitori()
      setFornitori(listaFornitori)
    } catch {
      setFornitori([])
    }
  }

  const loadLotti = async (materiaPrimaId: number): Promise<void> => {
    setLoadingLotti(true)
    try {
      const lottiDb = await window.api.mp.lotti(materiaPrimaId)
      setLotti(lottiDb)
    } catch {
      setLotti([])
    } finally {
      setLoadingLotti(false)
    }
  }

  useEffect(() => {
    void loadMateriePrime()
    void loadFornitori()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!materiaSelezionataId) {
      setLotti([])
      return
    }

    void loadLotti(materiaSelezionataId)
  }, [materiaSelezionataId])

  const buildMateriaPayload = (): {
    nome: string
    categoria: string
    unita_misura: string
    soglia_riordino_fissa?: number | null
    soglia_riordino_dinamica_cotte?: number | null
    fornitore_preferito?: string | null
    note?: string | null
  } => {
    return {
      nome: materiaForm.nome.trim(),
      categoria: materiaForm.categoria,
      unita_misura: materiaForm.unita_misura,
      soglia_riordino_fissa: materiaForm.soglia_riordino_fissa ? Number(materiaForm.soglia_riordino_fissa) : null,
      soglia_riordino_dinamica_cotte: materiaForm.soglia_riordino_dinamica_cotte
        ? Number(materiaForm.soglia_riordino_dinamica_cotte)
        : null,
      fornitore_preferito: materiaForm.fornitore_preferito.trim() || null,
      note: materiaForm.note.trim() || null
    }
  }

  const openNuovaMateriaDialog = (): void => {
    setErroreModal('')
    setMateriaForm(defaultMateriaPrimaForm)
    setDialogNuovaOpen(true)
  }

  const openModificaDialog = (): void => {
    if (!materiaSelezionata) return
    setErroreModal('')
    setMateriaForm({
      nome: materiaSelezionata.nome,
      categoria: (materiaSelezionata.categoria as MateriaPrimaForm['categoria']) || 'altro',
      unita_misura: (materiaSelezionata.unita_misura as MateriaPrimaForm['unita_misura']) || 'kg',
      soglia_riordino_fissa: materiaSelezionata.soglia_riordino_fissa?.toString() ?? '',
      soglia_riordino_dinamica_cotte: materiaSelezionata.soglia_riordino_dinamica_cotte?.toString() ?? '',
      fornitore_preferito: materiaSelezionata.fornitore_preferito ?? '',
      note: materiaSelezionata.note ?? ''
    })
    setDialogModificaOpen(true)
  }

  const openEliminaMateriaDialog = (): void => {
    if (!materiaSelezionataId) return
    setErroreModal('')
    setDialogEliminaMateriaOpen(true)
  }

  const openCaricoDialog = (): void => {
    if (!materiaSelezionataId) return
    setErroreModal('')
    setCaricoForm(defaultCaricoForm)
    setDialogCaricoOpen(true)
  }

  const handleCreaMateriaPrima = async (): Promise<void> => {
    if (!materiaForm.nome.trim()) {
      setErroreModal('Il nome e obbligatorio')
      return
    }

    setIsSubmitting(true)
    setErroreModal('')
    try {
      const result = await window.api.mp.crea(buildMateriaPayload())
      setDialogNuovaOpen(false)
      await loadMateriePrime()
      setMateriaSelezionataId(result.id)
    } catch {
      setErroreModal('Errore durante il salvataggio')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAggiornaMateriaPrima = async (): Promise<void> => {
    if (!materiaSelezionataId) return
    if (!materiaForm.nome.trim()) {
      setErroreModal('Il nome e obbligatorio')
      return
    }

    setIsSubmitting(true)
    setErroreModal('')
    try {
      await window.api.mp.aggiorna(materiaSelezionataId, buildMateriaPayload())
      setDialogModificaOpen(false)
      await loadMateriePrime()
      await loadLotti(materiaSelezionataId)
    } catch {
      setErroreModal("Errore durante l'aggiornamento")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEliminaMateriaPrima = async (): Promise<void> => {
    if (!materiaSelezionataId) return
    setIsSubmitting(true)
    setErroreModal('')
    try {
      const result = await window.api.mp.eliminaMateria(materiaSelezionataId)
      if (!result.ok) {
        setErroreModal(result.errore)
        return
      }
      setDialogEliminaMateriaOpen(false)
      setDialogModificaOpen(false)
      await loadMateriePrime()
    } catch {
      setErroreModal("Errore durante l'eliminazione della materia prima")
    } finally {
      setIsSubmitting(false)
    }
  }

  const openModificaLottoDialog = (lotto: LottoMateriaPrima): void => {
    setErroreModal('')
    setLottoSelezionato(lotto)
    setModificaLottoForm({
      lotto_fornitore: lotto.lotto_fornitore ?? '',
      data_scadenza: lotto.data_scadenza ?? '',
      quantita_residua: lotto.quantita_residua?.toString() ?? '',
      note: lotto.note ?? ''
    })
    setDialogModificaLottoOpen(true)
  }

  const openEliminaLottoDialog = (lotto: LottoMateriaPrima): void => {
    setErroreModal('')
    setLottoSelezionato(lotto)
    setDialogEliminaLottoOpen(true)
  }

  const handleModificaLotto = async (): Promise<void> => {
    if (!lottoSelezionato || !materiaSelezionataId) return
    if (!modificaLottoForm.lotto_fornitore.trim()) {
      setErroreModal('Il lotto fornitore e obbligatorio')
      return
    }
    if (!modificaLottoForm.data_scadenza) {
      setErroreModal('La data di scadenza e obbligatoria')
      return
    }
    const quantita = Number(modificaLottoForm.quantita_residua)
    if (!Number.isFinite(quantita) || quantita < 0) {
      setErroreModal('Inserisci una quantita residua valida')
      return
    }

    setIsSubmitting(true)
    setErroreModal('')
    try {
      const result = await window.api.mp.modificaLotto(lottoSelezionato.id, {
        lotto_fornitore: modificaLottoForm.lotto_fornitore.trim(),
        data_scadenza: modificaLottoForm.data_scadenza,
        quantita_residua: quantita,
        note: modificaLottoForm.note.trim() || null
      })
      if (!result.ok) {
        setErroreModal(result.errore)
        return
      }
      setDialogModificaLottoOpen(false)
      setLottoSelezionato(null)
      await loadMateriePrime()
      await loadLotti(materiaSelezionataId)
    } catch {
      setErroreModal('Errore durante il salvataggio del lotto')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleEliminaLotto = async (): Promise<void> => {
    if (!lottoSelezionato || !materiaSelezionataId) return
    setIsSubmitting(true)
    setErroreModal('')
    try {
      const result = await window.api.mp.eliminaLotto(lottoSelezionato.id)
      if (!result.ok) {
        setErroreModal(result.errore)
        return
      }
      setDialogEliminaLottoOpen(false)
      setLottoSelezionato(null)
      await loadMateriePrime()
      await loadLotti(materiaSelezionataId)
    } catch {
      setErroreModal("Errore durante l'eliminazione del lotto")
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCarico = async (): Promise<void> => {
    if (!materiaSelezionataId) return
    if (!caricoForm.lotto_fornitore.trim() || !caricoForm.data_scadenza || !caricoForm.quantita) {
      setErroreModal('Compila tutti i campi obbligatori')
      return
    }

    setIsSubmitting(true)
    setErroreModal('')
    try {
      await window.api.mp.carico({
        materia_prima_id: materiaSelezionataId,
        fornitore_id: caricoForm.fornitore_id ? Number(caricoForm.fornitore_id) : null,
        lotto_fornitore: caricoForm.lotto_fornitore.trim(),
        data_carico: caricoForm.data_carico,
        data_scadenza: caricoForm.data_scadenza,
        quantita_iniziale: Number(caricoForm.quantita)
      })
      setDialogCaricoOpen(false)
      await loadMateriePrime()
      await loadLotti(materiaSelezionataId)
    } catch {
      setErroreModal('Errore durante la registrazione del carico')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="grid min-h-[calc(100vh-9rem)] grid-cols-1 gap-4 xl:grid-cols-[1.2fr_1fr]">
      <section className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">Materie prime</h3>
          <Button size="sm" onClick={openNuovaMateriaDialog}>
            <Plus className="mr-1 h-4 w-4" />
            Nuova materia prima
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
                  <th className="px-4 py-2 font-medium">Unita</th>
                  <th className="px-4 py-2 font-medium">Giacenza totale</th>
                  <th className="px-4 py-2 font-medium">Soglia riordino</th>
                  <th className="px-4 py-2 font-medium">Stato</th>
                </tr>
              </thead>
              <tbody>
                {materiePrime.map((materiaPrima) => {
                  const attiva = materiaPrima.id === materiaSelezionataId
                  const haSoglia = materiaPrima.soglia_riordino_fissa !== null
                  const sottoSoglia = haSoglia && materiaPrima.giacenza_totale <= (materiaPrima.soglia_riordino_fissa ?? 0)

                  return (
                    <tr
                      key={materiaPrima.id}
                      className={`cursor-pointer border-b border-border/50 ${
                        attiva ? 'bg-secondary' : 'hover:bg-secondary/40'
                      }`}
                      onClick={() => setMateriaSelezionataId(materiaPrima.id)}
                    >
                      <td className="px-4 py-2">{materiaPrima.nome}</td>
                      <td className="px-4 py-2">
                        <Badge variant="outline" className={categoryBadgeClass(materiaPrima.categoria)}>
                          {materiaPrima.categoria}
                        </Badge>
                      </td>
                      <td className="px-4 py-2">{materiaPrima.unita_misura}</td>
                      <td className="px-4 py-2">{materiaPrima.giacenza_totale}</td>
                      <td className="px-4 py-2">{materiaPrima.soglia_riordino_fissa ?? '-'}</td>
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
        {!materiaSelezionata ? (
          <div className="flex h-full min-h-[320px] items-center justify-center text-sm text-muted-foreground">
            Seleziona una materia prima per vedere il dettaglio
          </div>
        ) : (
          <div className="space-y-4 p-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-semibold text-foreground">{materiaSelezionata.nome}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {materiaSelezionata.categoria} - {materiaSelezionata.unita_misura}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={openModificaDialog}>
                Modifica
              </Button>
            </div>

            <div className="grid gap-2 rounded-md border border-border bg-secondary/30 p-3 text-sm">
              <div>
                <span className="font-medium text-foreground/80">Soglia riordino fissa:</span>{' '}
                {materiaSelezionata.soglia_riordino_fissa ?? '-'}
              </div>
              <div>
                <span className="font-medium text-foreground/80">Note:</span> {materiaSelezionata.note || '-'}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-foreground">Lotti in magazzino</h4>
              <Button size="sm" onClick={openCaricoDialog}>
                <Plus className="mr-1 h-4 w-4" />
                Nuovo carico
              </Button>
            </div>

            {loadingLotti ? (
              <p className="text-sm text-muted-foreground">Caricamento lotti...</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-secondary/40 text-left text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Lotto fornitore</th>
                      <th className="px-3 py-2 font-medium">Fornitore</th>
                      <th className="px-3 py-2 font-medium">Data carico</th>
                      <th className="px-3 py-2 font-medium">Scadenza</th>
                      <th className="px-3 py-2 font-medium">Q.ta iniziale</th>
                      <th className="px-3 py-2 font-medium">Q.ta residua</th>
                      <th className="px-3 py-2 font-medium text-right">Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lotti.map((lotto) => (
                      <tr
                        key={lotto.id}
                        className={`border-b border-border/50 ${
                          isNearExpiry(lotto.data_scadenza, SOGLIA_SCADENZA_DEFAULT) ? 'bg-amber-500/10' : ''
                        }`}
                      >
                        <td className="px-3 py-2">{lotto.lotto_fornitore}</td>
                        <td className="px-3 py-2">{lotto.fornitore_nome || '-'}</td>
                        <td className="px-3 py-2">{lotto.data_carico}</td>
                        <td className="px-3 py-2">{lotto.data_scadenza}</td>
                        <td className="px-3 py-2">{lotto.quantita_iniziale}</td>
                        <td className="px-3 py-2">{lotto.quantita_residua}</td>
                        <td className="px-3 py-2">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openModificaLottoDialog(lotto)}
                              title="Modifica lotto"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openEliminaLottoDialog(lotto)}
                              title="Elimina lotto"
                              className="text-red-400 hover:text-red-300"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {lotti.length === 0 && (
                      <tr>
                        <td className="px-3 py-3 text-muted-foreground" colSpan={7}>
                          Nessun lotto presente
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

      <Dialog open={dialogNuovaOpen} onOpenChange={setDialogNuovaOpen}>
        <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Nuova materia prima</DialogTitle>
            <DialogDescription>Inserisci i dati principali della materia prima.</DialogDescription>
          </DialogHeader>
          <MateriaPrimaFormFields form={materiaForm} onChange={setMateriaForm} />
          {erroreModal && <ModalError message={erroreModal} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogNuovaOpen(false)}>
              Annulla
            </Button>
            <Button onClick={handleCreaMateriaPrima} disabled={isSubmitting}>
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogModificaOpen} onOpenChange={setDialogModificaOpen}>
        <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Modifica materia prima</DialogTitle>
            <DialogDescription>Aggiorna i dati della materia prima selezionata.</DialogDescription>
          </DialogHeader>
          <MateriaPrimaFormFields form={materiaForm} onChange={setMateriaForm} />
          {erroreModal && <ModalError message={erroreModal} />}
          <DialogFooter>
            <Button
              variant="outline"
              className="mr-auto text-red-400 hover:text-red-300"
              onClick={openEliminaMateriaDialog}
              disabled={isSubmitting}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Elimina
            </Button>
            <Button variant="outline" onClick={() => setDialogModificaOpen(false)}>
              Annulla
            </Button>
            <Button onClick={handleAggiornaMateriaPrima} disabled={isSubmitting}>
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialogEliminaMateriaOpen}
        onOpenChange={(open) => {
          setDialogEliminaMateriaOpen(open)
        }}
      >
        <DialogContent className="max-w-sm" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Elimina materia prima</DialogTitle>
            <DialogDescription>
              Confermi l&apos;eliminazione della materia prima selezionata? L&apos;operazione e consentita solo se non
              usata in ricette, produzione o lotti.
            </DialogDescription>
          </DialogHeader>
          {materiaSelezionata && (
            <div className="rounded-md border border-border bg-secondary/30 p-3 text-sm">
              <div>
                <span className="font-medium text-foreground/80">Nome:</span> {materiaSelezionata.nome}
              </div>
              <div>
                <span className="font-medium text-foreground/80">Categoria:</span> {materiaSelezionata.categoria}
              </div>
            </div>
          )}
          {erroreModal && <ModalError message={erroreModal} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogEliminaMateriaOpen(false)}>
              Annulla
            </Button>
            <Button
              onClick={handleEliminaMateriaPrima}
              disabled={isSubmitting}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Elimina
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialogModificaLottoOpen}
        onOpenChange={(open) => {
          setDialogModificaLottoOpen(open)
          if (!open) setLottoSelezionato(null)
        }}
      >
        <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Modifica lotto</DialogTitle>
            <DialogDescription>
              Aggiorna i dati del lotto selezionato. La quantita iniziale resta invariata come dato storico.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="mod_lotto_fornitore">Lotto fornitore</Label>
              <Input
                id="mod_lotto_fornitore"
                value={modificaLottoForm.lotto_fornitore}
                onChange={(event) =>
                  setModificaLottoForm((prev) => ({ ...prev, lotto_fornitore: event.target.value }))
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mod_lotto_scadenza">Data scadenza</Label>
              <Input
                id="mod_lotto_scadenza"
                type="date"
                value={modificaLottoForm.data_scadenza}
                onChange={(event) =>
                  setModificaLottoForm((prev) => ({ ...prev, data_scadenza: event.target.value }))
                }
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mod_lotto_residua">Quantita residua</Label>
              <Input
                id="mod_lotto_residua"
                type="number"
                step="any"
                value={modificaLottoForm.quantita_residua}
                onChange={(event) =>
                  setModificaLottoForm((prev) => ({ ...prev, quantita_residua: event.target.value }))
                }
              />
              {lottoSelezionato && (
                <p className="text-xs text-muted-foreground">
                  Quantita iniziale (storica): {lottoSelezionato.quantita_iniziale}
                </p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mod_lotto_note">Note</Label>
              <textarea
                id="mod_lotto_note"
                className="min-h-[80px] rounded-md border border-input bg-input px-3 py-2 text-sm text-foreground"
                value={modificaLottoForm.note}
                onChange={(event) =>
                  setModificaLottoForm((prev) => ({ ...prev, note: event.target.value }))
                }
              />
            </div>
          </div>
          {erroreModal && <ModalError message={erroreModal} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogModificaLottoOpen(false)}>
              Annulla
            </Button>
            <Button onClick={handleModificaLotto} disabled={isSubmitting}>
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialogEliminaLottoOpen}
        onOpenChange={(open) => {
          setDialogEliminaLottoOpen(open)
          if (!open) setLottoSelezionato(null)
        }}
      >
        <DialogContent className="max-w-sm" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Elimina lotto</DialogTitle>
            <DialogDescription>
              Sei sicuro di voler eliminare questo lotto? L&apos;operazione e consentita solo se il lotto non e mai stato
              utilizzato in produzione.
            </DialogDescription>
          </DialogHeader>
          {lottoSelezionato && (
            <div className="rounded-md border border-border bg-secondary/30 p-3 text-sm">
              <div>
                <span className="font-medium text-foreground/80">Lotto fornitore:</span>{' '}
                {lottoSelezionato.lotto_fornitore}
              </div>
              <div>
                <span className="font-medium text-foreground/80">Scadenza:</span>{' '}
                {lottoSelezionato.data_scadenza}
              </div>
              <div>
                <span className="font-medium text-foreground/80">Quantita:</span>{' '}
                {lottoSelezionato.quantita_residua} / {lottoSelezionato.quantita_iniziale}
              </div>
            </div>
          )}
          {erroreModal && <ModalError message={erroreModal} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogEliminaLottoOpen(false)}>
              Annulla
            </Button>
            <Button
              onClick={handleEliminaLotto}
              disabled={isSubmitting}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              Elimina
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogCaricoOpen} onOpenChange={setDialogCaricoOpen}>
        <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Nuovo carico</DialogTitle>
            <DialogDescription>Registra un nuovo lotto in ingresso.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="lotto_fornitore">Lotto fornitore</Label>
              <Input
                id="lotto_fornitore"
                value={caricoForm.lotto_fornitore}
                onChange={(event) => setCaricoForm((prev) => ({ ...prev, lotto_fornitore: event.target.value }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="fornitore">Fornitore</Label>
              <select
                id="fornitore"
                className="h-9 rounded-md border border-input px-3 py-1 text-sm"
                value={caricoForm.fornitore_id}
                onChange={(event) => setCaricoForm((prev) => ({ ...prev, fornitore_id: event.target.value }))}
              >
                <option value="">Nessuno</option>
                {fornitori.map((fornitore) => (
                  <option key={fornitore.id} value={fornitore.id}>
                    {fornitore.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="data_carico">Data carico</Label>
              <Input
                id="data_carico"
                type="date"
                value={caricoForm.data_carico}
                onChange={(event) => setCaricoForm((prev) => ({ ...prev, data_carico: event.target.value }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="data_scadenza">Data scadenza</Label>
              <Input
                id="data_scadenza"
                type="date"
                value={caricoForm.data_scadenza}
                onChange={(event) => setCaricoForm((prev) => ({ ...prev, data_scadenza: event.target.value }))}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="quantita">Quantita</Label>
              <Input
                id="quantita"
                type="number"
                value={caricoForm.quantita}
                onChange={(event) => setCaricoForm((prev) => ({ ...prev, quantita: event.target.value }))}
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

function MateriaPrimaFormFields({
  form,
  onChange
}: {
  form: MateriaPrimaForm
  onChange: React.Dispatch<React.SetStateAction<MateriaPrimaForm>>
}): React.JSX.Element {
  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="mp_nome">Nome</Label>
        <Input id="mp_nome" value={form.nome} onChange={(event) => onChange((prev) => ({ ...prev, nome: event.target.value }))} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="mp_categoria">Categoria</Label>
        <select
          id="mp_categoria"
          className="h-9 rounded-md border border-input px-3 py-1 text-sm"
          value={form.categoria}
          onChange={(event) => onChange((prev) => ({ ...prev, categoria: event.target.value as MateriaPrimaForm['categoria'] }))}
        >
          <option value="malto">malto</option>
          <option value="luppolo">luppolo</option>
          <option value="lievito">lievito</option>
          <option value="altro">altro</option>
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="mp_unita">Unita di misura</Label>
        <select
          id="mp_unita"
          className="h-9 rounded-md border border-input px-3 py-1 text-sm"
          value={form.unita_misura}
          onChange={(event) => onChange((prev) => ({ ...prev, unita_misura: event.target.value as MateriaPrimaForm['unita_misura'] }))}
        >
          <option value="kg">kg</option>
          <option value="g">g</option>
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="mp_soglia_fissa">Soglia riordino fissa</Label>
        <Input
          id="mp_soglia_fissa"
          type="number"
          value={form.soglia_riordino_fissa}
          onChange={(event) => onChange((prev) => ({ ...prev, soglia_riordino_fissa: event.target.value }))}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="mp_soglia_dinamica">Soglia riordino dinamica cotte</Label>
        <Input
          id="mp_soglia_dinamica"
          type="number"
          value={form.soglia_riordino_dinamica_cotte}
          onChange={(event) => onChange((prev) => ({ ...prev, soglia_riordino_dinamica_cotte: event.target.value }))}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="mp_fornitore_pref">Fornitore preferito</Label>
        <Input
          id="mp_fornitore_pref"
          value={form.fornitore_preferito}
          onChange={(event) => onChange((prev) => ({ ...prev, fornitore_preferito: event.target.value }))}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="mp_note">Note</Label>
        <textarea
          id="mp_note"
          className="min-h-[90px] rounded-md border border-input bg-input px-3 py-2 text-sm text-foreground"
          value={form.note}
          onChange={(event) => onChange((prev) => ({ ...prev, note: event.target.value }))}
        />
      </div>
    </div>
  )
}
