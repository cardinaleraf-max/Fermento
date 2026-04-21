import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Plus } from 'lucide-react'
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

const SOGLIA_INATTIVITA_GIORNI = 20

type TipoCliente = 'horeca' | 'privato' | 'distributore' | 'altro'

type Cliente = {
  id: number
  nome: string
  partita_iva: string | null
  indirizzo: string | null
  telefono: string | null
  email: string | null
  tipo_cliente: string | null
  note: string | null
  attivo: number
  creato_il: string
  aggiornato_il: string
  ultima_vendita: string | null
  totale_vendite: number
}

type VenditaStorico = {
  id: number
  data: string
  note: string | null
  totale_bottiglie: number
  totale_fusti: number
}

type ClienteForm = {
  nome: string
  tipo_cliente: TipoCliente
  partita_iva: string
  indirizzo: string
  telefono: string
  email: string
  note: string
}

const defaultForm: ClienteForm = {
  nome: '',
  tipo_cliente: 'horeca',
  partita_iva: '',
  indirizzo: '',
  telefono: '',
  email: '',
  note: ''
}

function tipoLabel(tipo: string | null): string {
  if (!tipo) return '-'
  return tipo
}

function tipoBadgeClass(tipo: string | null): string {
  switch (tipo) {
    case 'horeca':
      return 'border-blue-500/25 bg-blue-500/15 text-blue-400'
    case 'distributore':
      return 'border-purple-500/25 bg-purple-500/15 text-purple-400'
    case 'privato':
    case 'altro':
    default:
      return 'border-border bg-secondary text-muted-foreground'
  }
}

function isCommercialeAttivo(ultimaVendita: string | null): boolean {
  if (ultimaVendita == null) return false
  const d = new Date(ultimaVendita)
  d.setHours(0, 0, 0, 0)
  if (Number.isNaN(d.getTime())) return false
  const oggi = new Date()
  oggi.setHours(0, 0, 0, 0)
  const diffGiorni = (oggi.getTime() - d.getTime()) / (1000 * 60 * 60 * 24)
  return diffGiorni >= 0 && diffGiorni <= SOGLIA_INATTIVITA_GIORNI
}

function clientToForm(c: Cliente): ClienteForm {
  return {
    nome: c.nome,
    tipo_cliente: (['horeca', 'privato', 'distributore', 'altro'].includes(c.tipo_cliente ?? '')
      ? c.tipo_cliente
      : 'altro') as TipoCliente,
    partita_iva: c.partita_iva ?? '',
    indirizzo: c.indirizzo ?? '',
    telefono: c.telefono ?? '',
    email: c.email ?? '',
    note: c.note ?? ''
  }
}

function formatDataIt(data: string | null | undefined): string {
  if (!data) return '-'
  const d = new Date(data)
  if (Number.isNaN(d.getTime())) return data
  return d.toLocaleDateString('it-IT')
}

function ModalError({ message }: { message: string }): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
      <AlertCircle className="h-4 w-4" />
      <span>{message}</span>
    </div>
  )
}

export default function Clienti(): React.JSX.Element {
  const [clienti, setClienti] = useState<Cliente[]>([])
  const [clienteSelezionatoId, setClienteSelezionatoId] = useState<number | null>(null)
  const [storico, setStorico] = useState<VenditaStorico[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingStorico, setLoadingStorico] = useState(false)
  const [errore, setErrore] = useState('')
  const [erroreModal, setErroreModal] = useState('')
  const [dialogNuovoOpen, setDialogNuovoOpen] = useState(false)
  const [dialogModificaOpen, setDialogModificaOpen] = useState(false)
  const [form, setForm] = useState<ClienteForm>(defaultForm)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [confermaDisattiva, setConfermaDisattiva] = useState(false)

  const clienteSelezionato = useMemo(
    () => clienti.find((c) => c.id === clienteSelezionatoId) ?? null,
    [clienti, clienteSelezionatoId]
  )

  const caricaClienti = async (): Promise<void> => {
    setLoading(true)
    setErrore('')
    try {
      const lista = (await window.api.clienti.lista()) as Cliente[]
      setClienti(lista)
      if (lista.length === 0) {
        setClienteSelezionatoId(null)
      } else if (!clienteSelezionatoId || !lista.some((c) => c.id === clienteSelezionatoId)) {
        setClienteSelezionatoId(lista[0].id)
      }
    } catch (err) {
      setErrore(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const caricaStorico = async (clienteId: number): Promise<void> => {
    setLoadingStorico(true)
    try {
      const righe = (await window.api.clienti.storicoVendite(clienteId)) as VenditaStorico[]
      setStorico(righe)
    } catch {
      setStorico([])
    } finally {
      setLoadingStorico(false)
    }
  }

  useEffect(() => {
    void caricaClienti()
  }, [])

  useEffect(() => {
    if (clienteSelezionatoId == null) {
      setStorico([])
      setConfermaDisattiva(false)
      return
    }
    setConfermaDisattiva(false)
    void caricaStorico(clienteSelezionatoId)
  }, [clienteSelezionatoId])

  const buildPayload = () => ({
    nome: form.nome.trim(),
    tipo_cliente: form.tipo_cliente,
    partita_iva: form.partita_iva.trim() || null,
    indirizzo: form.indirizzo.trim() || null,
    telefono: form.telefono.trim() || null,
    email: form.email.trim() || null,
    note: form.note.trim() || null
  })

  const apriNuovo = (): void => {
    setForm(defaultForm)
    setErroreModal('')
    setDialogNuovoOpen(true)
  }

  const apriModifica = (): void => {
    if (!clienteSelezionato) return
    setForm(clientToForm(clienteSelezionato))
    setErroreModal('')
    setDialogModificaOpen(true)
  }

  const handleCrea = async (): Promise<void> => {
    if (!form.nome.trim()) {
      setErroreModal('Nome obbligatorio')
      return
    }
    setIsSubmitting(true)
    setErroreModal('')
    try {
      const result = await window.api.clienti.crea(buildPayload())
      setDialogNuovoOpen(false)
      await caricaClienti()
      setClienteSelezionatoId(result.id)
    } catch (err) {
      setErroreModal(err instanceof Error ? err.message : 'Errore')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleAggiorna = async (): Promise<void> => {
    if (!clienteSelezionato) return
    if (!form.nome.trim()) {
      setErroreModal('Nome obbligatorio')
      return
    }
    setIsSubmitting(true)
    setErroreModal('')
    try {
      await window.api.clienti.aggiorna(clienteSelezionato.id, buildPayload())
      setDialogModificaOpen(false)
      await caricaClienti()
    } catch (err) {
      setErroreModal(err instanceof Error ? err.message : 'Errore')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDisattiva = async (): Promise<void> => {
    if (!clienteSelezionato) return
    setIsSubmitting(true)
    try {
      await window.api.clienti.disattiva(clienteSelezionato.id)
      setConfermaDisattiva(false)
      setClienteSelezionatoId(null)
      await caricaClienti()
    } catch (err) {
      setErrore(err instanceof Error ? err.message : String(err))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="grid min-h-[calc(100vh-9rem)] grid-cols-1 gap-4 xl:grid-cols-[1.2fr_1fr]">
      <section className="rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">Clienti</h3>
          <Button size="sm" onClick={apriNuovo}>
            <Plus className="mr-1 h-4 w-4" />
            Nuovo cliente
          </Button>
        </div>

        {loading ? (
          <div className="p-4 text-sm text-muted-foreground">Caricamento...</div>
        ) : errore && clienti.length === 0 ? (
          <div className="p-4 text-sm text-destructive">{errore}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b border-border bg-secondary/40 text-left text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Nome</th>
                  <th className="px-4 py-2 font-medium">Tipo</th>
                  <th className="px-4 py-2 font-medium">Ultima vendita</th>
                  <th className="px-4 py-2 font-medium">Tot. vendite</th>
                  <th className="px-4 py-2 font-medium">Stato attività</th>
                </tr>
              </thead>
              <tbody>
                {clienti.map((c) => {
                  const attivo = c.id === clienteSelezionatoId
                  const commAttivo = isCommercialeAttivo(c.ultima_vendita)
                  return (
                    <tr
                      key={c.id}
                      className={`cursor-pointer border-b border-border/50 ${
                        attivo ? 'bg-secondary' : 'hover:bg-secondary/40'
                      }`}
                      onClick={() => setClienteSelezionatoId(c.id)}
                    >
                      <td className="px-4 py-2 font-medium text-foreground">{c.nome}</td>
                      <td className="px-4 py-2">
                        <Badge variant="outline" className={tipoBadgeClass(c.tipo_cliente)}>
                          {tipoLabel(c.tipo_cliente)}
                        </Badge>
                      </td>
                      <td className="px-4 py-2 text-foreground/80">{formatDataIt(c.ultima_vendita)}</td>
                      <td className="px-4 py-2 tabular-nums text-foreground">{c.totale_vendite}</td>
                      <td className="px-4 py-2">
                        {commAttivo ? (
                          <Badge className="bg-emerald-500/15 text-emerald-400">Attivo</Badge>
                        ) : (
                          <Badge className="bg-amber-500/15 text-amber-400">Inattivo</Badge>
                        )}
                      </td>
                    </tr>
                  )
                })}
                {clienti.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      Nessun cliente. Aggiungine uno con &quot;Nuovo cliente&quot;.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {errore && clienti.length > 0 && (
          <div className="border-t border-amber-500/20 bg-amber-500/10 px-4 py-2 text-sm text-amber-400">
            {errore}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border bg-card">
        {!clienteSelezionato ? (
          <div className="flex h-full min-h-[320px] items-center justify-center p-4 text-sm text-muted-foreground">
            Seleziona un cliente per vedere il dettaglio
          </div>
        ) : (
          <div className="space-y-4 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-base font-semibold text-foreground">{clienteSelezionato.nome}</h3>
                {clienteSelezionato.tipo_cliente ? (
                  <Badge
                    variant="outline"
                    className={`mt-1 ${tipoBadgeClass(clienteSelezionato.tipo_cliente)}`}
                  >
                    {tipoLabel(clienteSelezionato.tipo_cliente)}
                  </Badge>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={apriModifica}>
                  Modifica
                </Button>
                {confermaDisattiva ? (
                  <div className="flex w-full flex-col gap-2 rounded-md border border-red-500/20 bg-red-500/10 p-3 sm:w-auto sm:min-w-[280px]">
                    <p className="text-sm text-red-400">
                      Confermi la disattivazione del cliente <strong>{clienteSelezionato.nome}</strong>? Non
                      comparirà più in elenco.
                    </p>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setConfermaDisattiva(false)}
                        disabled={isSubmitting}
                      >
                        Annulla
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20"
                        onClick={() => void handleDisattiva()}
                        disabled={isSubmitting}
                      >
                        Conferma disattivazione
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-400"
                    onClick={() => setConfermaDisattiva(true)}
                  >
                    Disattiva
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-2 text-sm text-foreground/80">
              <p>
                <span className="font-medium text-muted-foreground">P. IVA: </span>
                {clienteSelezionato.partita_iva || '-'}
              </p>
              <p>
                <span className="font-medium text-muted-foreground">Indirizzo: </span>
                {clienteSelezionato.indirizzo || '-'}
              </p>
              <p>
                <span className="font-medium text-muted-foreground">Telefono: </span>
                {clienteSelezionato.telefono || '-'}
              </p>
              <p>
                <span className="font-medium text-muted-foreground">Email: </span>
                {clienteSelezionato.email || '-'}
              </p>
              <p>
                <span className="font-medium text-muted-foreground">Note: </span>
                {clienteSelezionato.note || '-'}
              </p>
            </div>

            <div>
              <h4 className="text-sm font-semibold text-foreground">Ultime vendite</h4>
              {loadingStorico ? (
                <p className="mt-2 text-sm text-muted-foreground">Caricamento...</p>
              ) : (
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border bg-secondary/40 text-left text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Data</th>
                        <th className="px-3 py-2 font-medium text-right">Bottiglie</th>
                        <th className="px-3 py-2 font-medium text-right">Fusti</th>
                        <th className="px-3 py-2 font-medium">Note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {storico.map((v) => (
                        <tr key={v.id} className="border-b border-border/50">
                          <td className="px-3 py-2 tabular-nums text-foreground">{formatDataIt(v.data)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{v.totale_bottiglie}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{v.totale_fusti}</td>
                          <td className="px-3 py-2 text-muted-foreground">{v.note || '-'}</td>
                        </tr>
                      ))}
                      {storico.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-3 py-4 text-muted-foreground">
                            Nessuna vendita registrata con righe dettaglio.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      <Dialog open={dialogNuovoOpen} onOpenChange={setDialogNuovoOpen}>
        <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Nuovo cliente</DialogTitle>
            <DialogDescription>Compila i campi. Il nome è obbligatorio.</DialogDescription>
          </DialogHeader>
          <ClienteFormFields form={form} onChange={setForm} />
          {erroreModal && <ModalError message={erroreModal} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogNuovoOpen(false)} disabled={isSubmitting}>
              Annulla
            </Button>
            <Button onClick={() => void handleCrea()} disabled={isSubmitting}>
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogModificaOpen} onOpenChange={setDialogModificaOpen}>
        <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>Modifica cliente</DialogTitle>
            <DialogDescription>Aggiorna i dati del cliente.</DialogDescription>
          </DialogHeader>
          <ClienteFormFields form={form} onChange={setForm} />
          {erroreModal && <ModalError message={erroreModal} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogModificaOpen(false)} disabled={isSubmitting}>
              Annulla
            </Button>
            <Button onClick={() => void handleAggiorna()} disabled={isSubmitting}>
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function ClienteFormFields({
  form,
  onChange
}: {
  form: ClienteForm
  onChange: React.Dispatch<React.SetStateAction<ClienteForm>>
}): React.JSX.Element {
  return (
    <div className="grid max-h-[70vh] gap-3 overflow-y-auto pr-1">
      <div className="grid gap-1.5">
        <Label htmlFor="c_nome">Nome *</Label>
        <Input id="c_nome" value={form.nome} onChange={(e) => onChange((prev) => ({ ...prev, nome: e.target.value }))} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="c_tipo">Tipo cliente</Label>
        <select
          id="c_tipo"
          className="h-9 rounded-md border border-input px-3 py-1 text-sm"
          value={form.tipo_cliente}
          onChange={(e) => onChange((prev) => ({ ...prev, tipo_cliente: e.target.value as TipoCliente }))}
        >
          <option value="horeca">horeca</option>
          <option value="privato">privato</option>
          <option value="distributore">distributore</option>
          <option value="altro">altro</option>
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="c_iva">Partita IVA</Label>
        <Input id="c_iva" value={form.partita_iva} onChange={(e) => onChange((prev) => ({ ...prev, partita_iva: e.target.value }))} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="c_addr">Indirizzo</Label>
        <Input id="c_addr" value={form.indirizzo} onChange={(e) => onChange((prev) => ({ ...prev, indirizzo: e.target.value }))} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="c_tel">Telefono</Label>
        <Input id="c_tel" value={form.telefono} onChange={(e) => onChange((prev) => ({ ...prev, telefono: e.target.value }))} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="c_email">Email</Label>
        <Input id="c_email" type="email" value={form.email} onChange={(e) => onChange((prev) => ({ ...prev, email: e.target.value }))} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="c_note">Note</Label>
        <textarea
          id="c_note"
          className="min-h-[90px] rounded-md border border-input bg-input px-3 py-2 text-sm text-foreground"
          value={form.note}
          onChange={(e) => onChange((prev) => ({ ...prev, note: e.target.value }))}
        />
      </div>
    </div>
  )
}
