import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, PackageOpen, Undo2 } from 'lucide-react'
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

type SaldoRiga = {
  cliente_id: number
  cliente_nome: string
  materiale_id: number
  formato_nome: string
  capacita_litri: number | null
  fusti_fuori: number
  data_ultima_uscita: string | null
}

type MovimentoRiga = {
  id: number
  tipo: 'uscita' | 'rientro'
  materiale_id: number
  formato_nome: string
  quantita: number
  data: string
  vendita_id: number | null
  note: string | null
}

type RientroForm = {
  cliente_id: string
  materiale_id: string
  quantita: string
  data: string
  note: string
}

const oggiIso = (): string => new Date().toISOString().split('T')[0]

const defaultRientroForm = (): RientroForm => ({
  cliente_id: '',
  materiale_id: '',
  quantita: '',
  data: oggiIso(),
  note: ''
})

function formatDataIt(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleDateString('it-IT')
}

function ModalError({ message }: { message: string }): React.JSX.Element {
  return (
    <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400">
      {message}
    </div>
  )
}

export default function FustiInGiro(): React.JSX.Element {
  const [saldi, setSaldi] = useState<SaldoRiga[]>([])
  const [totale, setTotale] = useState(0)
  const [loading, setLoading] = useState(true)
  const [errore, setErrore] = useState('')

  const [clienteStorico, setClienteStorico] = useState<{ id: number; nome: string } | null>(null)
  const [movimenti, setMovimenti] = useState<MovimentoRiga[]>([])
  const [loadingMovimenti, setLoadingMovimenti] = useState(false)

  const [rientroOpen, setRientroOpen] = useState(false)
  const [rientroForm, setRientroForm] = useState<RientroForm>(defaultRientroForm())
  const [erroreRientro, setErroreRientro] = useState('')
  const [submittingRientro, setSubmittingRientro] = useState(false)

  const caricaSaldi = useCallback(async (): Promise<void> => {
    setLoading(true)
    setErrore('')
    try {
      const res = await window.api.fusti.saldi()
      setSaldi(res.saldi)
      setTotale(res.totale)
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore nel caricamento dei saldi fusti')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void caricaSaldi()
  }, [caricaSaldi])

  const clientiConSaldo = useMemo(() => {
    const map = new Map<number, string>()
    for (const s of saldi) {
      if (!map.has(s.cliente_id)) map.set(s.cliente_id, s.cliente_nome)
    }
    return Array.from(map.entries()).map(([id, nome]) => ({ id, nome }))
  }, [saldi])

  const formatiPerClienteScelto = useMemo(() => {
    const clienteId = Number(rientroForm.cliente_id)
    if (!clienteId) return []
    return saldi.filter((s) => s.cliente_id === clienteId)
  }, [saldi, rientroForm.cliente_id])

  const saldoFormatoScelto = useMemo(() => {
    const materialeId = Number(rientroForm.materiale_id)
    if (!materialeId) return 0
    return (
      formatiPerClienteScelto.find((s) => s.materiale_id === materialeId)?.fusti_fuori ?? 0
    )
  }, [formatiPerClienteScelto, rientroForm.materiale_id])

  async function apriStorico(clienteId: number, clienteNome: string): Promise<void> {
    setClienteStorico({ id: clienteId, nome: clienteNome })
    setLoadingMovimenti(true)
    try {
      setMovimenti(await window.api.fusti.movimentiCliente(clienteId))
    } catch {
      setMovimenti([])
    } finally {
      setLoadingMovimenti(false)
    }
  }

  function apriRientro(): void {
    setRientroForm(defaultRientroForm())
    setErroreRientro('')
    setRientroOpen(true)
  }

  async function confermaRientro(): Promise<void> {
    setErroreRientro('')
    const clienteId = Number(rientroForm.cliente_id)
    const materialeId = Number(rientroForm.materiale_id)
    const quantita = parseInt(rientroForm.quantita, 10)
    if (!clienteId) {
      setErroreRientro('Seleziona un cliente')
      return
    }
    if (!materialeId) {
      setErroreRientro('Seleziona il formato del fusto')
      return
    }
    if (!Number.isFinite(quantita) || quantita <= 0) {
      setErroreRientro('Inserisci una quantità valida')
      return
    }
    if (!rientroForm.data) {
      setErroreRientro('Data obbligatoria')
      return
    }
    setSubmittingRientro(true)
    try {
      const res = await window.api.fusti.registraRientro({
        cliente_id: clienteId,
        materiale_id: materialeId,
        quantita,
        data: rientroForm.data,
        note: rientroForm.note.trim() || null
      })
      if (!res.ok) {
        setErroreRientro(res.errore ?? 'Errore durante il rientro')
        return
      }
      setRientroOpen(false)
      await caricaSaldi()
      if (clienteStorico && clienteStorico.id === clienteId) {
        await apriStorico(clienteStorico.id, clienteStorico.nome)
      }
    } catch (e) {
      setErroreRientro(e instanceof Error ? e.message : 'Errore')
    } finally {
      setSubmittingRientro(false)
    }
  }

  if (clienteStorico !== null) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mb-1 -ml-2"
              onClick={() => setClienteStorico(null)}
            >
              <ArrowLeft className="mr-1 h-3.5 w-3.5" />
              Torna ai saldi
            </Button>
            <h3 className="text-lg font-semibold text-foreground">
              Movimenti fusti — {clienteStorico.nome}
            </h3>
          </div>
        </div>
        {loadingMovimenti ? (
          <p className="text-sm text-muted-foreground">Caricamento...</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="border-b border-border bg-secondary/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Data</th>
                  <th className="px-4 py-2 text-left font-medium">Tipo</th>
                  <th className="px-4 py-2 text-left font-medium">Formato</th>
                  <th className="px-4 py-2 text-right font-medium">Quantità</th>
                  <th className="px-4 py-2 text-left font-medium">Note</th>
                </tr>
              </thead>
              <tbody>
                {movimenti.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-4 text-muted-foreground">
                      Nessun movimento registrato
                    </td>
                  </tr>
                ) : (
                  movimenti.map((m) => (
                    <tr key={m.id} className="border-t border-border/50 text-foreground/80">
                      <td className="px-4 py-2.5 tabular-nums">{formatDataIt(m.data)}</td>
                      <td className="px-4 py-2.5">
                        {m.tipo === 'uscita' ? (
                          <Badge className="border-amber-500/30 bg-amber-500/10 text-amber-400">
                            Uscita
                          </Badge>
                        ) : (
                          <Badge className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                            Rientro
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-2.5">{m.formato_nome}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{m.quantita}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {m.note ?? (m.vendita_id != null ? `Vendita #${m.vendita_id}` : '—')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Fusti in giro</h3>
          <p className="text-sm text-muted-foreground">
            {totale > 0
              ? `${totale} fusti a rendere presso i clienti`
              : 'Fusti a rendere presso i clienti'}
          </p>
        </div>
        <Button size="sm" type="button" onClick={apriRientro} disabled={saldi.length === 0}>
          <Undo2 className="mr-1.5 h-4 w-4" />
          Registra rientro
        </Button>
      </div>

      {errore && <ModalError message={errore} />}

      {loading ? (
        <p className="text-sm text-muted-foreground">Caricamento...</p>
      ) : saldi.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-8 text-center">
          <PackageOpen className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Nessun fusto a rendere in giro. I fusti si tracciano dal campo &quot;di cui a
            rendere&quot; nelle vendite.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="border-b border-border bg-secondary/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Cliente</th>
                <th className="px-4 py-2 text-left font-medium">Formato</th>
                <th className="px-4 py-2 text-right font-medium">Fusti fuori</th>
                <th className="px-4 py-2 text-left font-medium">Ultima uscita</th>
              </tr>
            </thead>
            <tbody>
              {saldi.map((s) => (
                <tr
                  key={`${s.cliente_id}-${s.materiale_id}`}
                  className="cursor-pointer border-t border-border/50 text-foreground/80 hover:bg-secondary/30"
                  onClick={() => void apriStorico(s.cliente_id, s.cliente_nome)}
                  title="Mostra lo storico movimenti del cliente"
                >
                  <td className="px-4 py-2.5 text-foreground">{s.cliente_nome}</td>
                  <td className="px-4 py-2.5">{s.formato_nome}</td>
                  <td className="px-4 py-2.5 text-right font-medium tabular-nums text-foreground">
                    {s.fusti_fuori}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">{formatDataIt(s.data_ultima_uscita)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={rientroOpen} onOpenChange={setRientroOpen}>
        <DialogContent onOpenAutoFocus={(e) => e.preventDefault()} className="max-w-md">
          <DialogHeader>
            <DialogTitle>Registra rientro fusti</DialogTitle>
            <DialogDescription>
              Segna i fusti vuoti restituiti da un cliente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="rientro_cliente">Cliente *</Label>
              <select
                id="rientro_cliente"
                className="h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm"
                value={rientroForm.cliente_id}
                onChange={(e) =>
                  setRientroForm((prev) => ({
                    ...prev,
                    cliente_id: e.target.value,
                    materiale_id: '',
                    quantita: ''
                  }))
                }
              >
                <option value="">Seleziona cliente…</option>
                {clientiConSaldo.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rientro_formato">Formato *</Label>
              <select
                id="rientro_formato"
                className="h-9 w-full rounded-md border border-input bg-transparent px-2 py-1 text-sm"
                value={rientroForm.materiale_id}
                disabled={!rientroForm.cliente_id}
                onChange={(e) =>
                  setRientroForm((prev) => ({ ...prev, materiale_id: e.target.value, quantita: '' }))
                }
              >
                <option value="">Seleziona formato…</option>
                {formatiPerClienteScelto.map((s) => (
                  <option key={s.materiale_id} value={s.materiale_id}>
                    {s.formato_nome} ({s.fusti_fuori} fuori)
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rientro_quantita">Fusti rientrati *</Label>
              <Input
                id="rientro_quantita"
                type="number"
                min={1}
                max={saldoFormatoScelto || undefined}
                placeholder="Quantità"
                value={rientroForm.quantita}
                disabled={!rientroForm.materiale_id}
                onChange={(e) => setRientroForm((prev) => ({ ...prev, quantita: e.target.value }))}
              />
              {rientroForm.materiale_id !== '' && (
                <span className="text-xs text-muted-foreground">max {saldoFormatoScelto}</span>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rientro_data">Data *</Label>
              <Input
                id="rientro_data"
                type="date"
                value={rientroForm.data}
                onChange={(e) => setRientroForm((prev) => ({ ...prev, data: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rientro_note">Note</Label>
              <Input
                id="rientro_note"
                placeholder="Facoltative"
                value={rientroForm.note}
                onChange={(e) => setRientroForm((prev) => ({ ...prev, note: e.target.value }))}
              />
            </div>
          </div>

          {erroreRientro && <ModalError message={erroreRientro} />}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRientroOpen(false)}
              disabled={submittingRientro}
            >
              Annulla
            </Button>
            <Button
              type="button"
              onClick={() => void confermaRientro()}
              disabled={submittingRientro}
            >
              {submittingRientro ? 'Salvataggio…' : 'Registra rientro'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
