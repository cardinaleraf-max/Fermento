import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Beer, Box, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

const AVVISO_GIORNI = 60

type GiacenzaBottiglie = {
  cotta_id: number
  numero_lotto: string
  birra_nome: string
  stile: string | null
  data_scadenza: string
  bottiglie_prodotte: number
  bottiglie_disponibili: number
  fusti_disponibili: number
  data_confezionamento: string | null
}

type TogliBottiglieForm = {
  quantita: string
  causale: string
}

const defaultTogliBottiglieForm = (): TogliBottiglieForm => ({
  quantita: '',
  causale: ''
})

type GiacenzaFusti = {
  cotta_id: number
  materiale_id: number
  quantita_disponibile: number
  formato_nome: string
  capacita_litri: number | null
  numero_lotto: string
  birra_nome: string
  data_scadenza: string
}

type BirraAttivaOption = {
  id: number
  nome: string
  stile: string | null
}

type FustoAttivoOption = {
  id: number
  nome: string
  capacita_litri: number | null
}

type CaricoInizialeForm = {
  numero_lotto: string
  birra_id: string
  bottiglie: string
  data_scadenza: string
  note: string
  fusti: Record<number, string>
}

const defaultCaricoInizialeForm = (): CaricoInizialeForm => ({
  numero_lotto: '',
  birra_id: '',
  bottiglie: '',
  data_scadenza: '',
  note: '',
  fusti: {}
})

type StatoScadenza = 'scaduta' | 'in_scadenza' | 'ok'

function statoScadenzaData(data: string | null | undefined): StatoScadenza {
  if (!data) return 'ok'
  const s = new Date(data)
  s.setHours(0, 0, 0, 0)
  if (Number.isNaN(s.getTime())) return 'ok'
  const oggi = new Date()
  oggi.setHours(0, 0, 0, 0)
  const diffGiorni = (s.getTime() - oggi.getTime()) / (1000 * 60 * 60 * 24)
  if (diffGiorni < 0) return 'scaduta'
  if (diffGiorni <= AVVISO_GIORNI) return 'in_scadenza'
  return 'ok'
}

function rigaClasseStato(data: string | null | undefined): string {
  const s = statoScadenzaData(data)
  if (s === 'scaduta') return 'bg-red-500/10'
  if (s === 'in_scadenza') return 'bg-amber-500/10'
  return ''
}

function formatData(data: string | null | undefined): string {
  if (!data) return '-'
  const d = new Date(data)
  if (Number.isNaN(d.getTime())) return data
  return d.toLocaleDateString('it-IT')
}

function BadgeStatoScadenza({ data }: { data: string | null | undefined }): React.JSX.Element | null {
  const stato = statoScadenzaData(data)
  if (stato === 'scaduta') {
    return <Badge className="bg-red-500/15 text-red-400">Scaduta</Badge>
  }
  if (stato === 'in_scadenza') {
    return <Badge className="bg-orange-500/15 text-orange-400">In scadenza</Badge>
  }
  return null
}

function formatoFusto(f: GiacenzaFusti): string {
  if (f.capacita_litri != null) {
    return `${f.formato_nome} (${f.capacita_litri} L)`
  }
  return f.formato_nome
}

export default function ProdottoFinito(): React.JSX.Element {
  const [giacenze, setGiacenze] = useState<GiacenzaBottiglie[]>([])
  const [fusti, setFusti] = useState<GiacenzaFusti[]>([])
  const [loading, setLoading] = useState(true)
  const [errore, setErrore] = useState('')
  const [dialogCaricoInizialeOpen, setDialogCaricoInizialeOpen] = useState(false)
  const [birreAttive, setBirreAttive] = useState<BirraAttivaOption[]>([])
  const [fustiAttivi, setFustiAttivi] = useState<FustoAttivoOption[]>([])
  const [caricoInizialeForm, setCaricoInizialeForm] = useState<CaricoInizialeForm>(
    defaultCaricoInizialeForm()
  )
  const [erroreCaricoIniziale, setErroreCaricoIniziale] = useState('')
  const [submittingCaricoIniziale, setSubmittingCaricoIniziale] = useState(false)

  const [lottoTogliBottiglie, setLottoTogliBottiglie] = useState<GiacenzaBottiglie | null>(null)
  const [togliBottiglieForm, setTogliBottiglieForm] = useState<TogliBottiglieForm>(
    defaultTogliBottiglieForm()
  )
  const [erroreTogliBottiglie, setErroreTogliBottiglie] = useState('')
  const [submittingTogliBottiglie, setSubmittingTogliBottiglie] = useState(false)

  async function carica(): Promise<void> {
    setLoading(true)
    setErrore('')
    try {
      const [bottiglie, righeFusti] = await Promise.all([
        window.api.pf.giacenze(),
        window.api.pf.giacenzeFusti()
      ])
      setGiacenze(bottiglie)
      setFusti(righeFusti)
    } catch (err) {
      setErrore(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void carica()
  }, [])

  async function apriDialogCaricoIniziale(): Promise<void> {
    setCaricoInizialeForm(defaultCaricoInizialeForm())
    setErroreCaricoIniziale('')
    setDialogCaricoInizialeOpen(true)
    try {
      const [birre, fustiDb] = await Promise.all([
        window.api.prod.birreAttive(),
        window.api.pf.fustiAttivi()
      ])
      setBirreAttive(
        birre.map((birra) => ({ id: birra.id, nome: birra.nome, stile: birra.stile }))
      )
      setFustiAttivi(fustiDb)
    } catch (err) {
      setErroreCaricoIniziale(err instanceof Error ? err.message : String(err))
    }
  }

  async function confermaCaricoIniziale(): Promise<void> {
    setErroreCaricoIniziale('')
    const numeroLotto = caricoInizialeForm.numero_lotto.trim()
    if (!numeroLotto) {
      setErroreCaricoIniziale('Numero lotto obbligatorio')
      return
    }
    if (!caricoInizialeForm.birra_id) {
      setErroreCaricoIniziale('Seleziona la birra')
      return
    }
    if (!caricoInizialeForm.data_scadenza) {
      setErroreCaricoIniziale('Data scadenza obbligatoria')
      return
    }

    const bottiglie = caricoInizialeForm.bottiglie.trim()
      ? Number(caricoInizialeForm.bottiglie)
      : null
    if (bottiglie != null && (!Number.isFinite(bottiglie) || bottiglie < 0)) {
      setErroreCaricoIniziale('Numero bottiglie non valido')
      return
    }

    const fustiPayload = Object.entries(caricoInizialeForm.fusti)
      .map(([materialeId, quantita]) => ({
        materiale_id: Number(materialeId),
        quantita: Number(quantita) || 0
      }))
      .filter((fusto) => fusto.quantita > 0)

    if ((bottiglie == null || bottiglie === 0) && fustiPayload.length === 0) {
      setErroreCaricoIniziale('Inserisci almeno un quantitativo (bottiglie o fusti)')
      return
    }

    setSubmittingCaricoIniziale(true)
    try {
      const result = await window.api.pf.caricoIniziale({
        numero_lotto: numeroLotto,
        birra_id: Number(caricoInizialeForm.birra_id),
        bottiglie,
        fusti: fustiPayload,
        data_scadenza: caricoInizialeForm.data_scadenza,
        note: caricoInizialeForm.note.trim() || null
      })
      if (!result.ok) {
        setErroreCaricoIniziale(result.errore)
        return
      }
      setDialogCaricoInizialeOpen(false)
      await carica()
    } catch (err) {
      setErroreCaricoIniziale(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmittingCaricoIniziale(false)
    }
  }

  function apriDialogTogliBottiglie(lotto: GiacenzaBottiglie): void {
    setLottoTogliBottiglie(lotto)
    setTogliBottiglieForm(defaultTogliBottiglieForm())
    setErroreTogliBottiglie('')
  }

  function chiudiDialogTogliBottiglie(): void {
    setLottoTogliBottiglie(null)
    setTogliBottiglieForm(defaultTogliBottiglieForm())
    setErroreTogliBottiglie('')
  }

  async function confermaTogliBottiglie(): Promise<void> {
    if (!lottoTogliBottiglie) return
    setErroreTogliBottiglie('')
    const qtaNum = Number(togliBottiglieForm.quantita)
    if (!Number.isFinite(qtaNum) || qtaNum <= 0) {
      setErroreTogliBottiglie('Quantita non valida')
      return
    }
    if (qtaNum > lottoTogliBottiglie.bottiglie_disponibili) {
      setErroreTogliBottiglie(
        `Quantita superiore al disponibile (${lottoTogliBottiglie.bottiglie_disponibili})`
      )
      return
    }
    setSubmittingTogliBottiglie(true)
    try {
      const res = await window.api.pf.togliBottiglie({
        cotta_id: lottoTogliBottiglie.cotta_id,
        quantita: Math.floor(qtaNum),
        causale: togliBottiglieForm.causale.trim() || null
      })
      if (!res.ok) {
        setErroreTogliBottiglie(res.errore)
        return
      }
      chiudiDialogTogliBottiglie()
      await carica()
    } catch (err) {
      setErroreTogliBottiglie(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmittingTogliBottiglie(false)
    }
  }

  const { totaleBottiglie, totaleFusti, lottiInScadenza } = useMemo(() => {
    const totB = giacenze.reduce((a, c) => a + (c.bottiglie_disponibili ?? 0), 0)
    const tf = fusti.reduce((a, f) => a + f.quantita_disponibile, 0)
    const ids = new Set<number>()
    for (const c of giacenze) {
      if (statoScadenzaData(c.data_scadenza) === 'in_scadenza') {
        ids.add(c.cotta_id)
      }
    }
    for (const f of fusti) {
      if (statoScadenzaData(f.data_scadenza) === 'in_scadenza') {
        ids.add(f.cotta_id)
      }
    }
    return {
      totaleBottiglie: totB,
      totaleFusti: tf,
      lottiInScadenza: ids.size
    }
  }, [giacenze, fusti])

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Prodotto finito</h2>
          <p className="text-sm text-muted-foreground">Giacenze bottiglie e fusti confezionati</p>
        </div>
        <Button onClick={() => void apriDialogCaricoIniziale()}>
          <Plus className="mr-2 h-4 w-4" /> Carico iniziale
        </Button>
      </div>

      {errore && (
        <div className="flex items-center gap-2 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {errore}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bottiglie disponibili</CardTitle>
            <Beer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums">
              {loading ? '—' : totaleBottiglie}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Fusti disponibili</CardTitle>
            <Box className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums">
              {loading ? '—' : totaleFusti}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Lotti in scadenza (≤ {AVVISO_GIORNI} gg)</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums">
              {loading ? '—' : lottiInScadenza}
            </div>
          </CardContent>
        </Card>
      </div>

      <section>
        <h3 className="mb-3 text-lg font-medium text-foreground">Bottiglie per lotto</h3>
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-secondary/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Lotto</th>
                <th className="px-4 py-3 font-medium">Birra</th>
                <th className="px-4 py-3 font-medium">Scadenza</th>
                <th className="px-4 py-3 text-right font-medium">Bottiglie disponibili</th>
                <th className="px-4 py-3 text-right font-medium">Fusti</th>
                <th className="px-4 py-3 font-medium">Stato scadenza</th>
                <th className="px-4 py-3 text-right font-medium">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    Caricamento…
                  </td>
                </tr>
              ) : giacenze.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                    Nessuna giacenza.
                  </td>
                </tr>
              ) : (
                giacenze.map((r) => (
                  <tr
                    key={r.cotta_id}
                    className={`border-t border-border/50 text-foreground/80 ${rigaClasseStato(r.data_scadenza)}`}
                  >
                    <td className="px-4 py-2.5 font-medium text-foreground">{r.numero_lotto}</td>
                    <td className="px-4 py-2.5">
                      {r.birra_nome}
                      {r.stile ? <span className="text-muted-foreground"> · {r.stile}</span> : null}
                    </td>
                    <td className="px-4 py-2.5 tabular-nums">{formatData(r.data_scadenza)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium text-foreground">
                      {r.bottiglie_disponibili}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.fusti_disponibili}</td>
                    <td className="px-4 py-2.5">
                      <BadgeStatoScadenza data={r.data_scadenza} />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => apriDialogTogliBottiglie(r)}
                        disabled={r.bottiglie_disponibili <= 0}
                      >
                        <Beer className="mr-1.5 h-3.5 w-3.5" />
                        Togli bottiglie
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <Dialog open={dialogCaricoInizialeOpen} onOpenChange={setDialogCaricoInizialeOpen}>
        <DialogContent className="max-w-lg" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Carico iniziale</DialogTitle>
            <DialogDescription>
              Registra una giacenza di partenza di prodotto finito senza scaricare materie prime o materiali di
              confezionamento.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ci_numero_lotto">Numero lotto *</Label>
              <Input
                id="ci_numero_lotto"
                type="text"
                placeholder="es. INIT-2026-001"
                value={caricoInizialeForm.numero_lotto}
                onChange={(event) =>
                  setCaricoInizialeForm((prev) => ({ ...prev, numero_lotto: event.target.value }))
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ci_birra">Birra *</Label>
              <select
                id="ci_birra"
                className="flex h-10 w-full rounded-md border border-input px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                value={caricoInizialeForm.birra_id}
                onChange={(event) =>
                  setCaricoInizialeForm((prev) => ({ ...prev, birra_id: event.target.value }))
                }
              >
                <option value="">Seleziona birra...</option>
                {birreAttive.map((birra) => (
                  <option key={birra.id} value={birra.id}>
                    {birra.nome}
                    {birra.stile ? ` (${birra.stile})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ci_bottiglie">Numero bottiglie</Label>
                <Input
                  id="ci_bottiglie"
                  type="number"
                  min={0}
                  placeholder="es. 120"
                  value={caricoInizialeForm.bottiglie}
                  onChange={(event) =>
                    setCaricoInizialeForm((prev) => ({ ...prev, bottiglie: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ci_scadenza">Data scadenza *</Label>
                <Input
                  id="ci_scadenza"
                  type="date"
                  value={caricoInizialeForm.data_scadenza}
                  onChange={(event) =>
                    setCaricoInizialeForm((prev) => ({ ...prev, data_scadenza: event.target.value }))
                  }
                />
              </div>
            </div>

            {fustiAttivi.length > 0 && (
              <div className="space-y-2">
                <Label>Fusti</Label>
                <div className="space-y-2 rounded-lg border border-border bg-secondary/20 p-3">
                  {fustiAttivi.map((fusto) => (
                    <div key={fusto.id} className="flex items-center gap-3">
                      <span className="flex-1 text-sm text-foreground/80">
                        {fusto.nome}
                        {fusto.capacita_litri != null ? ` (${fusto.capacita_litri} L)` : ''}
                      </span>
                      <Input
                        type="number"
                        min={0}
                        className="w-32"
                        placeholder="0"
                        value={caricoInizialeForm.fusti[fusto.id] ?? ''}
                        onChange={(event) =>
                          setCaricoInizialeForm((prev) => ({
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

            <div className="space-y-1.5">
              <Label htmlFor="ci_note">Note</Label>
              <Input
                id="ci_note"
                value={caricoInizialeForm.note}
                onChange={(event) =>
                  setCaricoInizialeForm((prev) => ({ ...prev, note: event.target.value }))
                }
                placeholder="opzionale"
              />
            </div>

            {erroreCaricoIniziale && (
              <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
                {erroreCaricoIniziale}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogCaricoInizialeOpen(false)}
              disabled={submittingCaricoIniziale}
            >
              Annulla
            </Button>
            <Button
              onClick={() => void confermaCaricoIniziale()}
              disabled={submittingCaricoIniziale}
            >
              {submittingCaricoIniziale ? 'Salvataggio...' : 'Registra carico'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={lottoTogliBottiglie !== null}
        onOpenChange={(open) => {
          if (!open) chiudiDialogTogliBottiglie()
        }}
      >
        <DialogContent className="max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Togli bottiglie dal lotto</DialogTitle>
            <DialogDescription>
              Scarico manuale di bottiglie (omaggi, scarti, ecc.) dalla giacenza del lotto
              selezionato.
            </DialogDescription>
          </DialogHeader>

          {lottoTogliBottiglie && (
            <div className="space-y-4">
              <div className="rounded-md border border-border bg-secondary/30 p-3 text-sm">
                <div className="font-medium text-foreground">
                  {lottoTogliBottiglie.birra_nome} — {lottoTogliBottiglie.numero_lotto}
                </div>
                <div className="mt-1 text-muted-foreground">
                  Bottiglie disponibili:{' '}
                  <span className="font-medium text-foreground">
                    {lottoTogliBottiglie.bottiglie_disponibili}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="tb_quantita">Bottiglie da togliere *</Label>
                <Input
                  id="tb_quantita"
                  type="number"
                  min={1}
                  max={lottoTogliBottiglie.bottiglie_disponibili}
                  placeholder="es. 3"
                  value={togliBottiglieForm.quantita}
                  onChange={(event) =>
                    setTogliBottiglieForm((prev) => ({ ...prev, quantita: event.target.value }))
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="tb_causale">Causale</Label>
                <Input
                  id="tb_causale"
                  type="text"
                  placeholder="omaggio, scarto, degustazione..."
                  value={togliBottiglieForm.causale}
                  onChange={(event) =>
                    setTogliBottiglieForm((prev) => ({ ...prev, causale: event.target.value }))
                  }
                />
              </div>

              {erroreTogliBottiglie && (
                <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
                  {erroreTogliBottiglie}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={chiudiDialogTogliBottiglie}
              disabled={submittingTogliBottiglie}
            >
              Annulla
            </Button>
            <Button
              onClick={() => void confermaTogliBottiglie()}
              disabled={submittingTogliBottiglie}
            >
              {submittingTogliBottiglie ? 'Scarico...' : 'Conferma scarico'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <section>
        <h3 className="mb-3 text-lg font-medium text-foreground">Fusti disponibili</h3>
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[800px] text-sm">
            <thead className="bg-secondary/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Lotto</th>
                <th className="px-4 py-3 font-medium">Birra</th>
                <th className="px-4 py-3 font-medium">Formato</th>
                <th className="px-4 py-3 text-right font-medium">Quantità disponibile</th>
                <th className="px-4 py-3 font-medium">Scadenza</th>
                <th className="px-4 py-3 font-medium">Stato scadenza</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    Caricamento…
                  </td>
                </tr>
              ) : fusti.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    Nessuna giacenza fusti.
                  </td>
                </tr>
              ) : (
                fusti.map((r) => (
                  <tr
                    key={`${r.cotta_id}-${r.materiale_id}`}
                    className={`border-t border-border/50 text-foreground/80 ${rigaClasseStato(r.data_scadenza)}`}
                  >
                    <td className="px-4 py-2.5 font-medium text-foreground">{r.numero_lotto}</td>
                    <td className="px-4 py-2.5">{r.birra_nome}</td>
                    <td className="px-4 py-2.5">{formatoFusto(r)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{r.quantita_disponibile}</td>
                    <td className="px-4 py-2.5 tabular-nums">{formatData(r.data_scadenza)}</td>
                    <td className="px-4 py-2.5">
                      <BadgeStatoScadenza data={r.data_scadenza} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
