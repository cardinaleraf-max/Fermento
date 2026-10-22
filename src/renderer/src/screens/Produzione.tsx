import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, FlaskConical, Package, Pencil, Plus, AlertTriangle } from 'lucide-react'
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
import { RiquadroLottiImballi, SezioneLottiImballi } from '@/components/LottiImballi'
import { IngredientiCottaTabella, type MateriaElenco } from '@/components/IngredientiCottaTabella'
import {
  insufficiente,
  payloadDaRighe,
  righeDaCotta,
  righeDaRicetta,
  righeModificate,
  type RigaBozza
} from '@/lib/ingredientiCotta'

type Cotta = {
  id: number
  numero_lotto: string
  birra_id: number
  ricetta_id: number
  data_inizio: string
  data_confezionamento: string | null
  litri_teorici: number
  stato: string
  note: string | null
  birra_nome: string
  birra_stile: string | null
  bottiglie_prodotte: number | null
  data_scadenza: string | null
}

type DettaglioCotta = Cotta & {
  scarto_litri: number | null
  confezionamento_data_scadenza: string | null
}

type BirraAttiva = {
  id: number
  nome: string
  stile: string | null
  ricetta_id: number
  versione: number
  cotta_litri_riferimento: number
}

type IngredienteRicetta = {
  id: number
  ricetta_id: number
  materia_prima_id: number
  quantita: number
  mp_nome: string
  unita_misura: string
  giacenza_totale: number
}

type MaterialeCotta = {
  id: number
  cotta_id: number
  lotto_materia_prima_id: number
  materia_prima_id: number
  quantita_usata: number
  mp_nome: string
  unita_misura: string
  lotto_fornitore: string
  data_scadenza: string
}

type MaterialeConfezionamento = {
  id: number
  nome: string
  categoria: string
  capacita_litri: number | null
}

type RicettaBirra = {
  id: number
  versione: number
  attiva: number
  cotta_litri_riferimento: number
}

type AggiungiCottaForm = {
  ricetta_id: string
  litri_aggiuntivi: string
}

type NuovaCottaForm = {
  numero_lotto: string
  birra_id: string
  data_inizio: string
}

type ConfezionamentoForm = {
  bottiglie_prodotte: string
  scarto_litri: string
  data_scadenza: string
  fusti: Record<number, string>
}

type ModificaConfezionamentoForm = {
  bottiglie_prodotte: string
  scarto_litri: string
  data_scadenza: string
  data_confezionamento: string
  fusti: Record<number, string>
}

type FustoConfezionamentoRiga = {
  materiale_id: number
  quantita: number
  formato_nome: string
  capacita_litri: number | null
}

const oggiIso = (): string => new Date().toISOString().split('T')[0]

/** Righe di nota che segnano un evento della cotta (evidenziate). */
const NOTA_EVENTO = /^(Aggiunta produzione|Modifica ingredienti|Variazioni rispetto alla ricetta)/

/** Quantità totale per materia prima. */
function totaliPerMateria(
  righe: Array<{ materia_prima_id: number; quantita: number }>
): Map<number, number> {
  const m = new Map<number, number>()
  for (const r of righe) m.set(r.materia_prima_id, (m.get(r.materia_prima_id) ?? 0) + r.quantita)
  return m
}

const NESSUNO = new Map<number, number>()

const defaultNuovaCottaForm = (): NuovaCottaForm => ({
  numero_lotto: '',
  birra_id: '',
  data_inizio: oggiIso()
})

const defaultConfezionamentoForm = (): ConfezionamentoForm => ({
  bottiglie_prodotte: '',
  scarto_litri: '',
  data_scadenza: '',
  fusti: {}
})

function statoBadgeClass(stato: string): string {
  switch (stato) {
    case 'in_corso':
      return 'bg-blue-500/15 text-blue-400 border-blue-500/25'
    case 'confezionata':
      return 'bg-green-500/15 text-green-400 border-green-500/25'
    case 'esaurita':
      return 'bg-secondary text-muted-foreground border-border'
    default:
      return 'bg-secondary text-muted-foreground border-border'
  }
}

function statoLabel(stato: string): string {
  switch (stato) {
    case 'in_corso':
      return 'In corso'
    case 'confezionata':
      return 'Confezionata'
    case 'esaurita':
      return 'Esaurita'
    default:
      return stato
  }
}

function formatData(data: string | null): string {
  if (!data) return '-'
  const date = new Date(data)
  if (Number.isNaN(date.getTime())) return data
  return date.toLocaleDateString('it-IT')
}

export default function Produzione(): React.JSX.Element {
  const [cotte, setCotte] = useState<Cotta[]>([])
  const [loading, setLoading] = useState(true)
  const [errore, setErrore] = useState('')
  const [cottaSelezionataId, setCottaSelezionataId] = useState<number | null>(null)
  const [dettaglio, setDettaglio] = useState<DettaglioCotta | null>(null)
  const [materialiCotta, setMaterialiCotta] = useState<MaterialeCotta[]>([])
  const [loadingDettaglio, setLoadingDettaglio] = useState(false)

  const [dialogNuovaCottaOpen, setDialogNuovaCottaOpen] = useState(false)
  const [birreAttive, setBirreAttive] = useState<BirraAttiva[]>([])
  const [ingredientiRicetta, setIngredientiRicetta] = useState<IngredienteRicetta[]>([])
  const [nuovaCottaForm, setNuovaCottaForm] = useState<NuovaCottaForm>(defaultNuovaCottaForm())
  const [erroreNuovaCotta, setErroreNuovaCotta] = useState('')
  const [avvisiNuovaCotta, setAvvisiNuovaCotta] = useState<string[]>([])
  const [submittingNuovaCotta, setSubmittingNuovaCotta] = useState(false)
  /** Ingredienti della nuova cotta, modificabili (partono dalla ricetta). */
  const [righeNuova, setRigheNuova] = useState<RigaBozza[]>([])
  const [inizialiNuova, setInizialiNuova] = useState<RigaBozza[]>([])
  const [materie, setMaterie] = useState<MateriaElenco[]>([])

  const [dialogModIngOpen, setDialogModIngOpen] = useState(false)
  const [righeModIng, setRigheModIng] = useState<RigaBozza[]>([])
  const [inizialiModIng, setInizialiModIng] = useState<RigaBozza[]>([])
  const [usatiModIng, setUsatiModIng] = useState<Map<number, number>>(new Map())
  const [erroreModIng, setErroreModIng] = useState('')
  const [submittingModIng, setSubmittingModIng] = useState(false)

  const [dialogConfezionamentoOpen, setDialogConfezionamentoOpen] = useState(false)
  const [fustiDisponibili, setFustiDisponibili] = useState<MaterialeConfezionamento[]>([])
  /** Facoltativo (HACCP): carichi di bottiglie/tappi/fusti usati per la cotta. */
  const [lottiImballi, setLottiImballi] = useState<number[]>([])
  /** Formati di fusto confezionati nella cotta selezionata (per i lotti imballi). */
  const [fustiCottaIds, setFustiCottaIds] = useState<number[]>([])
  const [confezionamentoForm, setConfezionamentoForm] = useState<ConfezionamentoForm>(defaultConfezionamentoForm())
  const [erroreConfezionamento, setErroreConfezionamento] = useState('')
  const [submittingConfezionamento, setSubmittingConfezionamento] = useState(false)

  const [dialogModificaConfOpen, setDialogModificaConfOpen] = useState(false)
  const [fustiConfezionamento, setFustiConfezionamento] = useState<FustoConfezionamentoRiga[]>([])
  const [modificaConfForm, setModificaConfForm] = useState<ModificaConfezionamentoForm>({
    bottiglie_prodotte: '',
    scarto_litri: '',
    data_scadenza: '',
    data_confezionamento: '',
    fusti: {}
  })
  const [erroreModificaConf, setErroreModificaConf] = useState('')
  const [submittingModificaConf, setSubmittingModificaConf] = useState(false)

  const [dialogAggiungiCottaOpen, setDialogAggiungiCottaOpen] = useState(false)
  const [cottaPerAggiunta, setCottaPerAggiunta] = useState<Cotta | null>(null)
  const [ricetteBirra, setRicetteBirra] = useState<RicettaBirra[]>([])
  const [aggiungiCottaForm, setAggiungiCottaForm] = useState<AggiungiCottaForm>({
    ricetta_id: '',
    litri_aggiuntivi: ''
  })
  const [ingredientiAggiungiCotta, setIngredientiAggiungiCotta] = useState<IngredienteRicetta[]>([])
  const [erroreAggiungiCotta, setErroreAggiungiCotta] = useState('')
  const [avvisiAggiungiCotta, setAvvisiAggiungiCotta] = useState<string[]>([])
  const [submittingAggiungiCotta, setSubmittingAggiungiCotta] = useState(false)

  const birraSelezionata = useMemo(
    () => birreAttive.find((birra) => String(birra.id) === nuovaCottaForm.birra_id) ?? null,
    [birreAttive, nuovaCottaForm.birra_id]
  )

  const riferimentiNuova = useMemo(() => totaliPerMateria(ingredientiRicetta), [ingredientiRicetta])

  const ricettaAggiungiSelezionata = useMemo(
    () => ricetteBirra.find((r) => String(r.id) === aggiungiCottaForm.ricetta_id) ?? null,
    [ricetteBirra, aggiungiCottaForm.ricetta_id]
  )

  async function caricaCotte(): Promise<void> {
    setLoading(true)
    setErrore('')
    try {
      const lista = await window.api.prod.listaCotte()
      setCotte(lista)
    } catch (err) {
      setErrore(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  async function caricaDettaglio(cottaId: number): Promise<void> {
    setLoadingDettaglio(true)
    setErrore('')
    try {
      const [det, materiali] = await Promise.all([
        window.api.prod.dettaglioCotta(cottaId),
        window.api.prod.materialiCotta(cottaId)
      ])
      setDettaglio(det ?? null)
      setMaterialiCotta(materiali)
      if (det?.stato === 'confezionata') {
        window.api.prod
          .confezionamentoFusti(cottaId)
          .then((righe) => setFustiCottaIds(righe.filter((r) => r.quantita > 0).map((r) => r.materiale_id)))
          .catch(() => setFustiCottaIds([]))
      } else {
        setFustiCottaIds([])
      }
    } catch (err) {
      setErrore(err instanceof Error ? err.message : String(err))
    } finally {
      setLoadingDettaglio(false)
    }
  }

  async function caricaBirreAttive(): Promise<void> {
    try {
      const birre = await window.api.prod.birreAttive()
      setBirreAttive(birre)
    } catch (err) {
      setErroreNuovaCotta(err instanceof Error ? err.message : String(err))
    }
  }

  /** Ingredienti della ricetta scelta: la bozza modificabile riparte da questi. */
  function impostaRicetta(ingredienti: IngredienteRicetta[]): void {
    const righe = righeDaRicetta(ingredienti)
    setIngredientiRicetta(ingredienti)
    setRigheNuova(righe)
    setInizialiNuova(righe)
  }

  async function caricaIngredientiRicetta(ricettaId: number): Promise<void> {
    try {
      const ingredienti = await window.api.prod.ingredientiRicetta(ricettaId)
      impostaRicetta(ingredienti)
    } catch (err) {
      setErroreNuovaCotta(err instanceof Error ? err.message : String(err))
    }
  }

  async function caricaMaterie(): Promise<void> {
    try {
      const lista = await window.api.mp.lista()
      setMaterie(
        lista.map((m) => ({
          id: m.id,
          nome: m.nome,
          categoria: m.categoria ?? '',
          unita_misura: m.unita_misura,
          giacenza_totale: m.giacenza_totale
        }))
      )
    } catch {
      setMaterie([])
    }
  }

  async function caricaFustiDisponibili(): Promise<void> {
    try {
      const lista = await window.api.conf.lista()
      setFustiDisponibili(
        lista
          .filter((m) => m.categoria === 'fusto')
          .map((m) => ({
            id: m.id,
            nome: m.nome,
            categoria: m.categoria,
            capacita_litri: m.capacita_litri
          }))
      )
    } catch (err) {
      setErroreConfezionamento(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => {
    void caricaCotte()
  }, [])

  useEffect(() => {
    if (cottaSelezionataId === null) {
      setDettaglio(null)
      setMaterialiCotta([])
      return
    }
    void caricaDettaglio(cottaSelezionataId)
  }, [cottaSelezionataId])

  useEffect(() => {
    if (!birraSelezionata) {
      impostaRicetta([])
      return
    }
    void caricaIngredientiRicetta(birraSelezionata.ricetta_id)
  }, [birraSelezionata])

  useEffect(() => {
    if (!ricettaAggiungiSelezionata) {
      setIngredientiAggiungiCotta([])
      return
    }
    void window.api.prod
      .ingredientiRicetta(ricettaAggiungiSelezionata.id)
      .then((ing) => setIngredientiAggiungiCotta(ing))
      .catch(() => setIngredientiAggiungiCotta([]))
  }, [ricettaAggiungiSelezionata])

  function apriDialogNuovaCotta(): void {
    setNuovaCottaForm(defaultNuovaCottaForm())
    impostaRicetta([])
    setErroreNuovaCotta('')
    setAvvisiNuovaCotta([])
    void caricaBirreAttive()
    void caricaMaterie()
    setDialogNuovaCottaOpen(true)
  }

  async function apriDialogModificaIngredienti(): Promise<void> {
    if (!dettaglio) return
    setErroreModIng('')
    try {
      const [ingredienti] = await Promise.all([
        window.api.prod.ingredientiCotta(dettaglio.id),
        caricaMaterie()
      ])
      const righe = righeDaCotta(ingredienti)
      setRigheModIng(righe)
      setInizialiModIng(righe)
      setUsatiModIng(totaliPerMateria(ingredienti))
      setDialogModIngOpen(true)
    } catch (err) {
      setErrore(err instanceof Error ? err.message : String(err))
    }
  }

  async function confermaModificaIngredienti(): Promise<void> {
    if (!dettaglio) return
    setErroreModIng('')
    if (!righeModificate(righeModIng, inizialiModIng)) {
      setDialogModIngOpen(false)
      return
    }
    const p = payloadDaRighe(righeModIng)
    if (!p.ok) {
      setErroreModIng(p.errore)
      return
    }
    setSubmittingModIng(true)
    try {
      const esito = await window.api.prod.modificaIngredientiCotta(dettaglio.id, p.ingredienti)
      if (!esito.ok) {
        setErroreModIng(esito.errore)
        return
      }
      setDialogModIngOpen(false)
      await Promise.all([caricaDettaglio(dettaglio.id), caricaCotte()])
    } catch (err) {
      setErroreModIng(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmittingModIng(false)
    }
  }

  async function apriDialogAggiungiCotta(cotta: Cotta, e: React.MouseEvent): Promise<void> {
    e.stopPropagation()
    setCottaPerAggiunta(cotta)
    setAggiungiCottaForm({
      ricetta_id: String(cotta.ricetta_id),
      litri_aggiuntivi: String(cotta.litri_teorici)
    })
    setErroreAggiungiCotta('')
    setAvvisiAggiungiCotta([])
    try {
      const ricette = await window.api.prod.ricetteBirra(cotta.birra_id)
      setRicetteBirra(ricette)
    } catch {
      setRicetteBirra([])
    }
    setDialogAggiungiCottaOpen(true)
  }

  async function confermaAggiungiCotta(): Promise<void> {
    if (!cottaPerAggiunta) return
    setErroreAggiungiCotta('')
    setAvvisiAggiungiCotta([])

    const litri = Number(aggiungiCottaForm.litri_aggiuntivi)
    if (!Number.isFinite(litri) || litri <= 0) {
      setErroreAggiungiCotta('Litri aggiuntivi devono essere > 0')
      return
    }
    const ricettaId = Number(aggiungiCottaForm.ricetta_id)
    if (!ricettaId) {
      setErroreAggiungiCotta('Seleziona una ricetta')
      return
    }

    setSubmittingAggiungiCotta(true)
    try {
      const result = await window.api.prod.aggiungiCottaALotto({
        cotta_id: cottaPerAggiunta.id,
        ricetta_id: ricettaId,
        litri_aggiuntivi: litri
      })
      if (!result.ok) {
        setErroreAggiungiCotta(result.errore ?? 'Errore sconosciuto')
        return
      }
      if (result.avvisi && result.avvisi.length > 0) {
        setAvvisiAggiungiCotta(result.avvisi)
      }
      setDialogAggiungiCottaOpen(false)
      await caricaCotte()
      if (cottaSelezionataId === cottaPerAggiunta.id) {
        await caricaDettaglio(cottaPerAggiunta.id)
      }
    } catch (err) {
      setErroreAggiungiCotta(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmittingAggiungiCotta(false)
    }
  }

  async function avviaCotta(): Promise<void> {
    setErroreNuovaCotta('')
    setAvvisiNuovaCotta([])
    if (!nuovaCottaForm.numero_lotto.trim()) {
      setErroreNuovaCotta('Numero lotto obbligatorio')
      return
    }
    if (!birraSelezionata) {
      setErroreNuovaCotta('Seleziona una birra')
      return
    }
    if (!nuovaCottaForm.data_inizio) {
      setErroreNuovaCotta('Data inizio obbligatoria')
      return
    }

    // Ingredienti inviati solo se modificati: altrimenti si scarica la ricetta come sempre.
    let ingredienti: Array<{ materia_prima_id: number; quantita: number }> | undefined
    if (righeModificate(righeNuova, inizialiNuova)) {
      const p = payloadDaRighe(righeNuova)
      if (!p.ok) {
        setErroreNuovaCotta(p.errore)
        return
      }
      ingredienti = p.ingredienti
    }

    setSubmittingNuovaCotta(true)
    try {
      const result = await window.api.prod.avviaCotta({
        numero_lotto: nuovaCottaForm.numero_lotto.trim(),
        birra_id: birraSelezionata.id,
        ricetta_id: birraSelezionata.ricetta_id,
        data_inizio: nuovaCottaForm.data_inizio,
        litri_teorici: birraSelezionata.cotta_litri_riferimento,
        ...(ingredienti ? { ingredienti } : {})
      })
      if (!result.ok) {
        setErroreNuovaCotta(result.errore)
        return
      }
      if (result.avvisi.length > 0) {
        setAvvisiNuovaCotta(result.avvisi)
      }
      setDialogNuovaCottaOpen(false)
      await caricaCotte()
    } catch (err) {
      setErroreNuovaCotta(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmittingNuovaCotta(false)
    }
  }

  function apriDialogConfezionamento(): void {
    setConfezionamentoForm(defaultConfezionamentoForm())
    setLottiImballi([])
    setErroreConfezionamento('')
    void caricaFustiDisponibili()
    void window.api.prod
      .scadenzaDefault()
      .then((scadenza) => {
        setConfezionamentoForm((prev) =>
          prev.data_scadenza === '' ? { ...prev, data_scadenza: scadenza } : prev
        )
      })
      .catch(() => {
        // il campo resta vuoto: la validazione al submit lo richiede comunque
      })
    setDialogConfezionamentoOpen(true)
  }

  async function apriDialogModificaConfezionamento(): Promise<void> {
    if (dettaglio === null) return
    setErroreModificaConf('')
    try {
      const fusti = (await window.api.prod.confezionamentoFusti(dettaglio.id)) as Array<{
        materiale_id: number
        quantita: number
        formato_nome: string
        capacita_litri: number | null
      }>
      setFustiConfezionamento(
        fusti.map((fusto) => ({
          materiale_id: fusto.materiale_id,
          quantita: fusto.quantita,
          formato_nome: fusto.formato_nome,
          capacita_litri: fusto.capacita_litri
        }))
      )
      const fustiIniziali: Record<number, string> = {}
      for (const fusto of fusti) {
        fustiIniziali[fusto.materiale_id] = String(fusto.quantita ?? 0)
      }
      setModificaConfForm({
        bottiglie_prodotte: String(dettaglio.bottiglie_prodotte ?? 0),
        scarto_litri:
          dettaglio.scarto_litri != null ? String(dettaglio.scarto_litri) : '',
        data_scadenza:
          dettaglio.confezionamento_data_scadenza ?? dettaglio.data_scadenza ?? '',
        data_confezionamento: dettaglio.data_confezionamento ?? oggiIso(),
        fusti: fustiIniziali
      })
      setDialogModificaConfOpen(true)
    } catch (err) {
      setErroreModificaConf(err instanceof Error ? err.message : String(err))
      setDialogModificaConfOpen(true)
    }
  }

  async function confermaModificaConfezionamento(): Promise<void> {
    if (dettaglio === null) return
    setErroreModificaConf('')

    const bottiglie = Number(modificaConfForm.bottiglie_prodotte)
    if (!Number.isFinite(bottiglie) || bottiglie < 0) {
      setErroreModificaConf('Bottiglie prodotte non valide')
      return
    }
    if (!modificaConfForm.data_scadenza) {
      setErroreModificaConf('Data scadenza obbligatoria')
      return
    }
    if (!modificaConfForm.data_confezionamento) {
      setErroreModificaConf('Data confezionamento obbligatoria')
      return
    }

    const fusti = fustiConfezionamento.map((fusto) => ({
      materiale_id: fusto.materiale_id,
      quantita: Number(modificaConfForm.fusti[fusto.materiale_id] ?? 0) || 0
    }))

    const scarto = modificaConfForm.scarto_litri.trim()
      ? Number(modificaConfForm.scarto_litri)
      : null

    setSubmittingModificaConf(true)
    try {
      const result = await window.api.prod.modificaConfezionamento(dettaglio.id, {
        bottiglie_prodotte: bottiglie,
        fusti,
        scarto_litri: scarto,
        data_scadenza: modificaConfForm.data_scadenza,
        data_confezionamento: modificaConfForm.data_confezionamento
      })
      if (!result.ok) {
        setErroreModificaConf(result.errore)
        return
      }
      setDialogModificaConfOpen(false)
      await caricaCotte()
      await caricaDettaglio(dettaglio.id)
    } catch (err) {
      setErroreModificaConf(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmittingModificaConf(false)
    }
  }

  async function confermaConfezionamento(): Promise<void> {
    setErroreConfezionamento('')
    if (dettaglio === null) return

    const bottiglie = Number(confezionamentoForm.bottiglie_prodotte)
    if (!Number.isFinite(bottiglie) || bottiglie < 0) {
      setErroreConfezionamento('Bottiglie prodotte non valide')
      return
    }

    const fusti = Object.entries(confezionamentoForm.fusti)
      .map(([materialeId, quantita]) => ({
        materiale_id: Number(materialeId),
        quantita: Number(quantita) || 0
      }))
      .filter((fusto) => fusto.quantita > 0)

    const scarto = confezionamentoForm.scarto_litri.trim()
      ? Number(confezionamentoForm.scarto_litri)
      : null

    if (!confezionamentoForm.data_scadenza) {
      setErroreConfezionamento('Data scadenza obbligatoria')
      return
    }

    setSubmittingConfezionamento(true)
    try {
      const result = await window.api.prod.confeziona({
        cotta_id: dettaglio.id,
        bottiglie_prodotte: bottiglie,
        fusti,
        scarto_litri: scarto,
        data_scadenza: confezionamentoForm.data_scadenza,
        ...(lottiImballi.length > 0 ? { lotti_imballi: lottiImballi } : {})
      })
      if (!result.ok) {
        setErroreConfezionamento(result.errore)
        return
      }
      setDialogConfezionamentoOpen(false)
      await caricaCotte()
      await caricaDettaglio(dettaglio.id)
    } catch (err) {
      setErroreConfezionamento(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmittingConfezionamento(false)
    }
  }

  if (cottaSelezionataId !== null) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => setCottaSelezionataId(null)} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-2 h-4 w-4" /> Torna alla lista
          </Button>
        </div>

        {errore && (
          <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
            {errore}
          </div>
        )}

        {loadingDettaglio && (
          <div className="text-sm text-muted-foreground">Caricamento dettaglio...</div>
        )}

        {dettaglio && (
          <>
            <div className="rounded-lg border border-border bg-card p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">
                    Numero lotto
                  </div>
                  <div className="text-2xl font-semibold text-foreground">
                    {dettaglio.numero_lotto}
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    {dettaglio.birra_nome}
                    {dettaglio.birra_stile ? ` · ${dettaglio.birra_stile}` : ''}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Data inizio: {formatData(dettaglio.data_inizio)} · Litri teorici:{' '}
                    {dettaglio.litri_teorici}
                  </div>
                  {dettaglio.note && (
                    <div className="mt-2 space-y-0.5">
                      {dettaglio.note.split('\n').map((riga, idx) => (
                        <div
                          key={idx}
                          className={
                            NOTA_EVENTO.test(riga)
                              ? 'text-xs text-amber-400'
                              : 'text-xs text-muted-foreground'
                          }
                        >
                          {riga}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <Badge className={`${statoBadgeClass(dettaglio.stato)} shrink-0 whitespace-nowrap`}>
                  {statoLabel(dettaglio.stato)}
                </Badge>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card">
              <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-4">
                <h3 className="font-semibold text-foreground">Materie prime utilizzate</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void apriDialogModificaIngredienti()}
                >
                  <Pencil className="mr-2 h-3.5 w-3.5" /> Modifica ingredienti
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-6 py-3 font-medium">Materia prima</th>
                      <th className="px-6 py-3 font-medium">Lotto fornitore</th>
                      <th className="px-6 py-3 font-medium">Scadenza</th>
                      <th className="px-6 py-3 font-medium text-right">Quantità usata</th>
                    </tr>
                  </thead>
                  <tbody>
                    {materialiCotta.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-6 text-center text-muted-foreground">
                          Nessun materiale registrato.
                        </td>
                      </tr>
                    ) : (
                      materialiCotta.map((mat) => (
                        <tr key={mat.id} className="border-t border-border/50 text-foreground/80">
                          <td className="px-6 py-3">{mat.mp_nome}</td>
                          <td className="px-6 py-3">{mat.lotto_fornitore}</td>
                          <td className="px-6 py-3">{formatData(mat.data_scadenza)}</td>
                          <td className="px-6 py-3 text-right tabular-nums">
                            {Number(mat.quantita_usata).toLocaleString('it-IT', { maximumFractionDigits: 3 })}{' '}
                            {mat.unita_misura}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {dettaglio.stato === 'in_corso' && (
              <div className="flex justify-end">
                <Button onClick={apriDialogConfezionamento}>
                  <Package className="mr-2 h-4 w-4" /> Registra confezionamento
                </Button>
              </div>
            )}

            {dettaglio.stato === 'confezionata' && (
              <div className="rounded-lg border border-border bg-card p-6">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <h3 className="font-semibold text-foreground">Dati confezionamento</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void apriDialogModificaConfezionamento()}
                  >
                    <Pencil className="mr-2 h-3.5 w-3.5" /> Modifica confezionamento
                  </Button>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Bottiglie prodotte
                    </div>
                    <div className="text-2xl font-semibold text-foreground">
                      {dettaglio.bottiglie_prodotte ?? 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">
                      Data scadenza
                    </div>
                    <div className="text-2xl font-semibold text-foreground">
                      {formatData(dettaglio.confezionamento_data_scadenza ?? dettaglio.data_scadenza)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {dettaglio.stato === 'confezionata' && (
              <RiquadroLottiImballi
                key={dettaglio.id}
                cottaId={dettaglio.id}
                bottiglie={(dettaglio.bottiglie_prodotte ?? 0) > 0}
                fusti={fustiCottaIds}
              />
            )}
          </>
        )}

        <Dialog open={dialogModIngOpen} onOpenChange={setDialogModIngOpen}>
          <DialogContent className="max-w-3xl" onOpenAutoFocus={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle>Modifica ingredienti</DialogTitle>
              <DialogDescription>
                {dettaglio ? `Lotto ${dettaglio.numero_lotto} · ${dettaglio.birra_nome}. ` : ''}
                Le quantità in più si scaricano dai lotti con la scadenza più vicina, quelle in meno
                tornano nei lotti da cui erano uscite. La ricetta non cambia.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <IngredientiCottaTabella
                titolo="Ingredienti usati"
                righe={righeModIng}
                iniziali={inizialiModIng}
                onChange={setRigheModIng}
                materie={materie}
                riferimenti={usatiModIng}
                giaUsato={usatiModIng}
                intestazioneQuantita="Usata"
                etichettaRiferimento="prima"
                testoRipristina="Annulla le modifiche"
              />

              {erroreModIng && (
                <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
                  {erroreModIng}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDialogModIngOpen(false)}
                disabled={submittingModIng}
              >
                Annulla
              </Button>
              <Button
                onClick={() => void confermaModificaIngredienti()}
                disabled={
                  submittingModIng ||
                  !righeModificate(righeModIng, inizialiModIng) ||
                  righeModIng.some((r) => r.materia_prima_id > 0 && insufficiente(r))
                }
              >
                {submittingModIng ? 'Salvataggio...' : 'Salva modifiche'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={dialogModificaConfOpen} onOpenChange={setDialogModificaConfOpen}>
          <DialogContent className="max-w-lg" onOpenAutoFocus={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle>Modifica confezionamento</DialogTitle>
              <DialogDescription>
                {dettaglio
                  ? `Lotto ${dettaglio.numero_lotto} · ${dettaglio.birra_nome}`
                  : 'Modifica confezionamento'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="mod_bottiglie">Bottiglie prodotte *</Label>
                <Input
                  id="mod_bottiglie"
                  type="number"
                  min={0}
                  value={modificaConfForm.bottiglie_prodotte}
                  onChange={(event) =>
                    setModificaConfForm((prev) => ({ ...prev, bottiglie_prodotte: event.target.value }))
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="mod_scarto">Scarto (litri)</Label>
                <Input
                  id="mod_scarto"
                  type="number"
                  min={0}
                  step={0.1}
                  value={modificaConfForm.scarto_litri}
                  onChange={(event) =>
                    setModificaConfForm((prev) => ({ ...prev, scarto_litri: event.target.value }))
                  }
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="mod_conf_data">Data confezionamento *</Label>
                  <Input
                    id="mod_conf_data"
                    type="date"
                    value={modificaConfForm.data_confezionamento}
                    onChange={(event) =>
                      setModificaConfForm((prev) => ({ ...prev, data_confezionamento: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="mod_conf_scadenza">Data scadenza *</Label>
                  <Input
                    id="mod_conf_scadenza"
                    type="date"
                    value={modificaConfForm.data_scadenza}
                    onChange={(event) =>
                      setModificaConfForm((prev) => ({ ...prev, data_scadenza: event.target.value }))
                    }
                  />
                </div>
              </div>

              {fustiConfezionamento.length > 0 && (
                <div className="space-y-2">
                  <Label>Fusti</Label>
                  <div className="space-y-2 rounded-lg border border-border bg-secondary/20 p-3">
                    {fustiConfezionamento.map((fusto) => (
                      <div key={fusto.materiale_id} className="flex items-center gap-3">
                        <span className="flex-1 text-sm text-foreground/80">
                          {fusto.formato_nome}
                          {fusto.capacita_litri != null ? ` (${fusto.capacita_litri} L)` : ''}
                        </span>
                        <Input
                          type="number"
                          min={0}
                          className="w-32"
                          value={modificaConfForm.fusti[fusto.materiale_id] ?? ''}
                          onChange={(event) =>
                            setModificaConfForm((prev) => ({
                              ...prev,
                              fusti: { ...prev.fusti, [fusto.materiale_id]: event.target.value }
                            }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {erroreModificaConf && (
                <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
                  {erroreModificaConf}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDialogModificaConfOpen(false)}
                disabled={submittingModificaConf}
              >
                Annulla
              </Button>
              <Button
                onClick={() => void confermaModificaConfezionamento()}
                disabled={submittingModificaConf}
              >
                {submittingModificaConf ? 'Salvataggio...' : 'Salva modifiche'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={dialogConfezionamentoOpen} onOpenChange={setDialogConfezionamentoOpen}>
          <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto" onOpenAutoFocus={(e) => e.preventDefault()}>
            <DialogHeader>
              <DialogTitle>Registra confezionamento</DialogTitle>
              <DialogDescription>
                {dettaglio
                  ? `Lotto ${dettaglio.numero_lotto} · ${dettaglio.birra_nome}`
                  : 'Confezionamento'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="bottiglie">Bottiglie prodotte *</Label>
                <Input
                  id="bottiglie"
                  type="number"
                  min={0}
                  value={confezionamentoForm.bottiglie_prodotte}
                  onChange={(event) =>
                    setConfezionamentoForm((prev) => ({ ...prev, bottiglie_prodotte: event.target.value }))
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="scarto">Scarto (litri)</Label>
                <Input
                  id="scarto"
                  type="number"
                  min={0}
                  step={0.1}
                  value={confezionamentoForm.scarto_litri}
                  onChange={(event) =>
                    setConfezionamentoForm((prev) => ({ ...prev, scarto_litri: event.target.value }))
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="conf_scadenza">Data scadenza *</Label>
                <Input
                  id="conf_scadenza"
                  type="date"
                  value={confezionamentoForm.data_scadenza}
                  onChange={(event) =>
                    setConfezionamentoForm((prev) => ({ ...prev, data_scadenza: event.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Precompilata con la shelf life di default; modificabile.
                </p>
              </div>

              {fustiDisponibili.length > 0 && (
                <div className="space-y-2">
                  <Label>Fusti</Label>
                  <div className="space-y-2">
                    {fustiDisponibili.map((fusto) => (
                      <div key={fusto.id} className="flex items-center gap-3">
                        <span className="flex-1 text-sm text-foreground/80">{fusto.nome}</span>
                        <Input
                          type="number"
                          min={0}
                          className="w-32"
                          value={confezionamentoForm.fusti[fusto.id] ?? ''}
                          onChange={(event) =>
                            setConfezionamentoForm((prev) => ({
                              ...prev,
                              fusti: { ...prev.fusti, [fusto.id]: event.target.value }
                            }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {dettaglio && (
                <SezioneLottiImballi
                  cottaId={dettaglio.id}
                  bottiglie={Number(confezionamentoForm.bottiglie_prodotte) > 0}
                  fusti={Object.entries(confezionamentoForm.fusti)
                    .filter(([, q]) => Number(q) > 0)
                    .map(([id]) => Number(id))}
                  selezionati={lottiImballi}
                  onChange={setLottiImballi}
                />
              )}

              {erroreConfezionamento && (
                <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
                  {erroreConfezionamento}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogConfezionamentoOpen(false)} disabled={submittingConfezionamento}>
                Annulla
              </Button>
              <Button onClick={confermaConfezionamento} disabled={submittingConfezionamento}>
                {submittingConfezionamento ? 'Salvataggio...' : 'Conferma confezionamento'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Produzione</h2>
          <p className="text-sm text-muted-foreground">Gestione cotte e confezionamento</p>
        </div>
        <Button onClick={apriDialogNuovaCotta}>
          <Plus className="mr-2 h-4 w-4" /> Nuova cotta
        </Button>
      </div>

      {errore && (
        <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
          {errore}
        </div>
      )}

      {!dialogNuovaCottaOpen && avvisiNuovaCotta.length > 0 && (
        <div className="rounded-md border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-400">
          <div className="mb-1 flex items-center justify-between gap-2 font-medium">
            <span className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Cotta avviata, ma la giacenza non bastava:
              è stato scaricato solo quello che c&apos;era in magazzino.
            </span>
            <button
              type="button"
              className="text-xs underline-offset-2 hover:underline"
              onClick={() => setAvvisiNuovaCotta([])}
            >
              Chiudi
            </button>
          </div>
          <ul className="list-disc pl-5">
            {avvisiNuovaCotta.map((avviso, idx) => (
              <li key={idx}>{avviso}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-6 py-3 font-medium">Lotto</th>
                <th className="px-6 py-3 font-medium">Birra</th>
                <th className="px-6 py-3 font-medium">Data inizio</th>
                <th className="px-6 py-3 font-medium">Stato</th>
                <th className="px-6 py-3 font-medium text-right">Bottiglie</th>
                <th className="px-6 py-3 font-medium">Scadenza</th>
                <th className="px-6 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-6 text-center text-muted-foreground">
                    Caricamento cotte...
                  </td>
                </tr>
              ) : cotte.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-10 text-center text-muted-foreground">
                    <FlaskConical className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
                    Nessuna cotta registrata.
                  </td>
                </tr>
              ) : (
                cotte.map((cotta) => (
                  <tr
                    key={cotta.id}
                    onClick={() => setCottaSelezionataId(cotta.id)}
                    className="cursor-pointer border-t border-border/50 text-foreground/80 hover:bg-secondary/40"
                  >
                    <td className="px-6 py-3 font-medium text-foreground">{cotta.numero_lotto}</td>
                    <td className="px-6 py-3">{cotta.birra_nome}</td>
                    <td className="px-6 py-3">{formatData(cotta.data_inizio)}</td>
                    <td className="px-6 py-3">
                      <Badge className={statoBadgeClass(cotta.stato)}>
                        {statoLabel(cotta.stato)}
                      </Badge>
                    </td>
                    <td className="px-6 py-3 text-right tabular-nums">
                      {cotta.bottiglie_prodotte ?? '-'}
                    </td>
                    <td className="px-6 py-3">{formatData(cotta.data_scadenza)}</td>
                    <td className="px-6 py-3" onClick={(e) => e.stopPropagation()}>
                      {cotta.stato === 'in_corso' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                          onClick={(e) => void apriDialogAggiungiCotta(cotta, e)}
                        >
                          + Cotta
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={dialogNuovaCottaOpen} onOpenChange={setDialogNuovaCottaOpen}>
        <DialogContent className="max-w-3xl" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Nuova cotta</DialogTitle>
            <DialogDescription>
              Registra una nuova cotta e scarica le materie prime necessarie.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="numero_lotto">Numero lotto *</Label>
                <Input
                  id="numero_lotto"
                  value={nuovaCottaForm.numero_lotto}
                  onChange={(event) =>
                    setNuovaCottaForm((prev) => ({ ...prev, numero_lotto: event.target.value }))
                  }
                  placeholder="es. 2026-001"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="data_inizio">Data inizio *</Label>
                <Input
                  id="data_inizio"
                  type="date"
                  value={nuovaCottaForm.data_inizio}
                  onChange={(event) =>
                    setNuovaCottaForm((prev) => ({ ...prev, data_inizio: event.target.value }))
                  }
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="birra">Birra *</Label>
              <select
                id="birra"
                className="flex h-10 w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                value={nuovaCottaForm.birra_id}
                onChange={(event) =>
                  setNuovaCottaForm((prev) => ({ ...prev, birra_id: event.target.value }))
                }
              >
                <option value="">Seleziona birra...</option>
                {birreAttive.map((birra) => (
                  <option key={birra.id} value={birra.id}>
                    {birra.nome}
                    {birra.stile ? ` (${birra.stile})` : ''} · {birra.cotta_litri_riferimento}L
                  </option>
                ))}
              </select>
            </div>

            {birraSelezionata && (
              <IngredientiCottaTabella
                titolo="Ingredienti della cotta"
                aiuto="Puoi cambiare le quantità, sostituire o togliere un ingrediente: le modifiche valgono solo per questa cotta, la ricetta non cambia."
                righe={righeNuova}
                iniziali={inizialiNuova}
                onChange={setRigheNuova}
                materie={materie}
                riferimenti={riferimentiNuova}
                giaUsato={NESSUNO}
                intestazioneQuantita="Richiesta"
                etichettaRiferimento="ricetta"
                testoRipristina="Ripristina ricetta"
              />
            )}

            {avvisiNuovaCotta.length > 0 && (
              <div className="rounded-md border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-400">
                <div className="mb-1 flex items-center gap-2 font-medium">
                  <AlertTriangle className="h-4 w-4" /> Avvisi
                </div>
                <ul className="list-disc pl-5">
                  {avvisiNuovaCotta.map((avviso, idx) => (
                    <li key={idx}>{avviso}</li>
                  ))}
                </ul>
              </div>
            )}

            {erroreNuovaCotta && (
              <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
                {erroreNuovaCotta}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogNuovaCottaOpen(false)} disabled={submittingNuovaCotta}>
              Annulla
            </Button>
            <Button onClick={avviaCotta} disabled={submittingNuovaCotta}>
              {submittingNuovaCotta ? 'Avvio...' : 'Avvia cotta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogAggiungiCottaOpen} onOpenChange={setDialogAggiungiCottaOpen}>
        <DialogContent className="max-w-2xl" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>
              Aggiungi cotta al lotto {cottaPerAggiunta?.numero_lotto ?? ''}
            </DialogTitle>
            <DialogDescription>
              Scarica materie prime aggiuntive e aumenta i litri totali della cotta. Usa questa
              azione quando hai fatto più di un mash nello stesso fermentatore. Il numero lotto e
              il prodotto finito rimangono unici.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {cottaPerAggiunta && (
              <div className="rounded-lg border border-border bg-secondary/20 px-4 py-3 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{cottaPerAggiunta.birra_nome}</span>
                {' · '}Litri attuali:{' '}
                <span className="font-medium text-foreground">{cottaPerAggiunta.litri_teorici} L</span>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="agg_ricetta">Ricetta</Label>
              <select
                id="agg_ricetta"
                className="flex h-10 w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                value={aggiungiCottaForm.ricetta_id}
                onChange={(event) =>
                  setAggiungiCottaForm((prev) => ({ ...prev, ricetta_id: event.target.value }))
                }
              >
                <option value="">Seleziona ricetta...</option>
                {ricetteBirra.map((r) => (
                  <option key={r.id} value={r.id}>
                    v{r.versione} — {r.cotta_litri_riferimento} L
                    {r.attiva === 1 ? ' (attiva)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="agg_litri">Litri aggiuntivi *</Label>
              <Input
                id="agg_litri"
                type="number"
                min={0.1}
                step={0.1}
                value={aggiungiCottaForm.litri_aggiuntivi}
                onChange={(event) =>
                  setAggiungiCottaForm((prev) => ({ ...prev, litri_aggiuntivi: event.target.value }))
                }
              />
            </div>

            {ricettaAggiungiSelezionata &&
              ingredientiAggiungiCotta.length > 0 &&
              Number(aggiungiCottaForm.litri_aggiuntivi) > 0 && (
                <div className="rounded-lg border border-border bg-secondary/20">
                  <div className="border-b border-border px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Ingredienti richiesti (scala proporzionale)
                  </div>
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2 font-medium">Ingrediente</th>
                        <th className="px-4 py-2 font-medium text-right">Richiesta</th>
                        <th className="px-4 py-2 font-medium text-right">Giacenza</th>
                        <th className="px-4 py-2 font-medium">Disponibile</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ingredientiAggiungiCotta.map((ing) => {
                        const fattore =
                          Number(aggiungiCottaForm.litri_aggiuntivi) /
                          ricettaAggiungiSelezionata.cotta_litri_riferimento
                        const richiesta = ing.quantita * fattore
                        const ok = ing.giacenza_totale >= richiesta
                        return (
                          <tr key={ing.id} className="border-t border-border/50 text-foreground/80">
                            <td className="px-4 py-2">{ing.mp_nome}</td>
                            <td className="px-4 py-2 text-right tabular-nums">
                              {richiesta.toFixed(2)} {ing.unita_misura}
                            </td>
                            <td className="px-4 py-2 text-right tabular-nums">
                              {ing.giacenza_totale} {ing.unita_misura}
                            </td>
                            <td className="px-4 py-2">
                              <Badge
                                className={
                                  ok
                                    ? 'bg-green-500/15 text-green-400 border-green-500/25'
                                    : 'bg-red-500/15 text-red-400 border-red-500/25'
                                }
                              >
                                {ok ? 'OK' : 'Insufficiente'}
                              </Badge>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

            {avvisiAggiungiCotta.length > 0 && (
              <div className="rounded-md border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-400">
                <div className="mb-1 flex items-center gap-2 font-medium">
                  <AlertTriangle className="h-4 w-4" /> Avvisi materie prime
                </div>
                <ul className="list-disc pl-5">
                  {avvisiAggiungiCotta.map((avviso, idx) => (
                    <li key={idx}>{avviso}</li>
                  ))}
                </ul>
              </div>
            )}

            {erroreAggiungiCotta && (
              <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
                {erroreAggiungiCotta}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogAggiungiCottaOpen(false)}
              disabled={submittingAggiungiCotta}
            >
              Annulla
            </Button>
            <Button
              onClick={() => void confermaAggiungiCotta()}
              disabled={submittingAggiungiCotta}
            >
              {submittingAggiungiCotta ? 'Elaborazione...' : 'Conferma'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
