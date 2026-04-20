import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { cn } from '@/lib/utils'

type TabId = 'parametri' | 'birre' | 'sicurezza' | 'backup'

type ConfigRiga = Awaited<ReturnType<typeof window.api.impostazioni.lista>>[number]
type BirraRiga = Awaited<ReturnType<typeof window.api.impostazioni.birre>>[number]
type RicettaRiga = Awaited<ReturnType<typeof window.api.impostazioni.ricetta>>[number]
type MpRiga = Awaited<ReturnType<typeof window.api.mp.lista>>[number]

type IngredienteBozza = { materia_prima_id: number; quantita: number; note: string }

const tabs: { id: TabId; label: string }[] = [
  { id: 'parametri', label: 'Parametri' },
  { id: 'birre', label: 'Birre e ricette' },
  { id: 'sicurezza', label: 'Sicurezza' },
  { id: 'backup', label: 'Backup' }
]

function groupByCategoria(items: ConfigRiga[]): Map<string, ConfigRiga[]> {
  const m = new Map<string, ConfigRiga[]>()
  for (const c of items) {
    const key = c.categoria || 'Altro'
    const list = m.get(key) ?? []
    list.push(c)
    m.set(key, list)
  }
  return m
}

export default function Impostazioni(): React.JSX.Element {
  const [tab, setTab] = useState<TabId>('parametri')
  const [config, setConfig] = useState<ConfigRiga[]>([])
  const [valori, setValori] = useState<Record<string, string>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [errParam, setErrParam] = useState<string | null>(null)

  const [birre, setBirre] = useState<BirraRiga[]>([])
  const [selezionata, setSelezionata] = useState<BirraRiga | null>(null)
  const [formBirra, setFormBirra] = useState({ nome: '', stile: '', descrizione: '', attiva: true })
  const [ricetta, setRicetta] = useState<RicettaRiga[]>([])
  const [errBirre, setErrBirre] = useState<string | null>(null)
  const [savingBirra, setSavingBirra] = useState(false)
  const [nuovaAperta, setNuovaAperta] = useState(false)
  const [nuovaForm, setNuovaForm] = useState({ nome: '', stile: '', descrizione: '' })
  const [ricettaAperta, setRicettaAperta] = useState(false)
  const [bozzaIng, setBozzaIng] = useState<IngredienteBozza[]>([])
  const [materie, setMaterie] = useState<MpRiga[]>([])
  const [savingRicetta, setSavingRicetta] = useState(false)

  const [pwAtt, setPwAtt] = useState('')
  const [pwNu, setPwNu] = useState('')
  const [pwConf, setPwConf] = useState('')
  const [errPw, setErrPw] = useState<string | null>(null)
  const [savingPw, setSavingPw] = useState(false)
  const [okPw, setOkPw] = useState(false)

  const [storicoBackup, setStoricoBackup] = useState<
    Awaited<ReturnType<typeof window.api.backup.lista>>
  >([])
  const [eseguendoBackup, setEseguendoBackup] = useState(false)
  const [msgBackup, setMsgBackup] = useState<string | null>(null)
  const [errBackup, setErrBackup] = useState<string | null>(null)

  const caricaStoricoBackup = useCallback(async () => {
    setErrBackup(null)
    try {
      setStoricoBackup(await window.api.backup.lista())
    } catch (e) {
      setStoricoBackup([])
      setErrBackup(e instanceof Error ? e.message : 'Impossibile caricare lo storico')
    }
  }, [])

  const caricaConfig = useCallback(async () => {
    setErrParam(null)
    try {
      const rows = await window.api.impostazioni.lista()
      setConfig(rows)
      const v: Record<string, string> = {}
      for (const r of rows) v[r.chiave] = r.valore
      setValori(v)
    } catch (e) {
      setErrParam(e instanceof Error ? e.message : 'Errore caricamento')
    }
  }, [])

  const caricaBirre = useCallback(async () => {
    setErrBirre(null)
    try {
      const b = await window.api.impostazioni.birre()
      setBirre(b)
    } catch (e) {
      setErrBirre(e instanceof Error ? e.message : 'Errore caricamento birre')
    }
  }, [])

  const caricaMaterie = useCallback(async () => {
    try {
      setMaterie(await window.api.mp.lista())
    } catch {
      setMaterie([])
    }
  }, [])

  useEffect(() => {
    void caricaConfig()
  }, [caricaConfig])

  useEffect(() => {
    if (tab === 'birre') {
      void caricaBirre()
      void caricaMaterie()
    }
  }, [tab, caricaBirre, caricaMaterie])

  useEffect(() => {
    if (tab === 'backup') {
      void caricaConfig()
      void caricaStoricoBackup()
    }
  }, [tab, caricaConfig, caricaStoricoBackup])

  const ricaricaRicetta = useCallback(
    async (birraId: number) => {
      try {
        setRicetta(await window.api.impostazioni.ricetta(birraId))
      } catch {
        setRicetta([])
      }
    },
    []
  )

  useEffect(() => {
    if (selezionata) {
      setFormBirra({
        nome: selezionata.nome,
        stile: selezionata.stile ?? '',
        descrizione: selezionata.descrizione ?? '',
        attiva: selezionata.attiva === 1
      })
      void ricaricaRicetta(selezionata.id)
    } else {
      setRicetta([])
    }
  }, [selezionata, ricaricaRicetta])

  const grouped = useMemo(() => groupByCategoria(config), [config])

  const salvaParam = async (r: ConfigRiga) => {
    setSavingKey(r.chiave)
    setErrParam(null)
    try {
      const v = valori[r.chiave] ?? r.valore
      await window.api.impostazioni.aggiorna(r.chiave, v)
      await caricaConfig()
    } catch (e) {
      setErrParam(e instanceof Error ? e.message : 'Salvataggio non riuscito')
    } finally {
      setSavingKey(null)
    }
  }

  const salvaBirra = async () => {
    if (!selezionata) return
    setSavingBirra(true)
    setErrBirre(null)
    try {
      await window.api.impostazioni.aggiornaBirra(selezionata.id, {
        nome: formBirra.nome,
        stile: formBirra.stile,
        descrizione: formBirra.descrizione,
        attiva: formBirra.attiva ? 1 : 0
      })
      await caricaBirre()
      const up = await window.api.impostazioni.birre()
      const s = up.find((x) => x.id === selezionata.id) ?? null
      setSelezionata(s)
    } catch (e) {
      setErrBirre(e instanceof Error ? e.message : 'Salvataggio birra fallito')
    } finally {
      setSavingBirra(false)
    }
  }

  const creaBirra = async () => {
    setErrBirre(null)
    try {
      const { id } = await window.api.impostazioni.creaBirra(nuovaForm)
      setNuovaAperta(false)
      setNuovaForm({ nome: '', stile: '', descrizione: '' })
      await caricaBirre()
      const up = await window.api.impostazioni.birre()
      setSelezionata(up.find((b) => b.id === id) ?? null)
    } catch (e) {
      setErrBirre(e instanceof Error ? e.message : 'Creazione non riuscita')
    }
  }

  const apriModaleRicetta = () => {
    if (!selezionata) return
    setBozzaIng(
      ricetta.length > 0
        ? ricetta.map((r) => ({ materia_prima_id: r.materia_prima_id, quantita: r.quantita, note: r.note ?? '' }))
        : [{ materia_prima_id: 0, quantita: 0, note: '' }]
    )
    setRicettaAperta(true)
  }

  const salvaRicettaFn = async () => {
    if (!selezionata) return
    setSavingRicetta(true)
    setErrBirre(null)
    try {
      const ingredienti = bozzaIng
        .filter((b) => b.materia_prima_id > 0 && b.quantita > 0)
        .map((b) => ({ materia_prima_id: b.materia_prima_id, quantita: b.quantita, note: b.note || null }))
      if (ingredienti.length === 0) {
        setErrBirre('Inserire almeno un ingrediente con quantità maggiore di 0')
        return
      }
      await window.api.impostazioni.salvaRicetta({ birra_id: selezionata.id, ingredienti })
      setRicettaAperta(false)
      await ricaricaRicetta(selezionata.id)
    } catch (e) {
      setErrBirre(e instanceof Error ? e.message : 'Salvataggio ricetta fallito')
    } finally {
      setSavingRicetta(false)
    }
  }

  const aggiungiIng = () => {
    setBozzaIng((prev) => [...prev, { materia_prima_id: 0, quantita: 0, note: '' }])
  }

  const rimuoviIng = (idx: number) => {
    setBozzaIng((prev) => prev.filter((_, i) => i !== idx))
  }

  const percorsoBackupConfig = (valori['backup_percorso'] ?? '').trim()

  const onSelezionaCartellaBackup = async () => {
    setMsgBackup(null)
    setErrBackup(null)
    try {
      const d = await window.api.backup.selezionaCartella()
      if (!d.ok) return
      await window.api.backup.configuraPercorso(d.percorso)
      await caricaConfig()
      setMsgBackup('Cartella di backup salvata.')
    } catch (e) {
      setErrBackup(e instanceof Error ? e.message : 'Impossibile salvare il percorso')
    }
  }

  const onEseguiBackupOra = async () => {
    setEseguendoBackup(true)
    setMsgBackup(null)
    setErrBackup(null)
    try {
      const r = await window.api.backup.esegui('manuale')
      if (r.ok) {
        setMsgBackup(`Backup creato: ${r.percorso}`)
      } else {
        setErrBackup(`Operazione non riuscita: ${r.errore}`)
      }
      await caricaStoricoBackup()
    } catch (e) {
      setErrBackup(e instanceof Error ? e.message : 'Backup fallito')
    } finally {
      setEseguendoBackup(false)
    }
  }

  const onRipristinaBackup = async () => {
    setMsgBackup(null)
    setErrBackup(null)
    try {
      const sel = await window.api.backup.selezionaFileRipristino()
      if (!sel.ok) return
      if (
        !window.confirm("Il database attuale verrà sostituito. Dopo il ripristino devi riavviare l'applicazione. Procedere?")
      ) {
        return
      }
      const r = await window.api.backup.ripristina(sel.percorso)
      if (r.ok) {
        setMsgBackup('Ripristino completato. Chiudi l’applicazione e riaprila.')
        await caricaStoricoBackup()
      } else {
        setErrBackup(r.errore)
      }
    } catch (e) {
      setErrBackup(e instanceof Error ? e.message : 'Ripristino non riuscito')
    }
  }

  const onSubmitCambioPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrPw(null)
    setOkPw(false)
    if (pwNu.length < 6) {
      setErrPw('La nuova password deve avere almeno 6 caratteri')
      return
    }
    if (pwNu !== pwConf) {
      setErrPw('Le nuove password non coincidono')
      return
    }
    setSavingPw(true)
    try {
      const r = await window.api.impostazioni.cambiaPassword({ password_attuale: pwAtt, password_nuova: pwNu })
      if (r.ok) {
        setOkPw(true)
        setPwAtt('')
        setPwNu('')
        setPwConf('')
      } else {
        setErrPw(r.errore)
      }
    } catch (err) {
      setErrPw(err instanceof Error ? err.message : 'Errore')
    } finally {
      setSavingPw(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="inline-flex flex-wrap gap-1 rounded-md border border-border bg-secondary/50 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'rounded px-3 py-1.5 text-sm font-medium',
              tab === t.id ? 'bg-secondary text-foreground shadow' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'parametri' && (
        <div className="space-y-4">
          {errParam && (
            <p className="text-sm text-red-400" role="alert">
              {errParam}
            </p>
          )}
          {[...grouped.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([categoria, righe]) => (
              <Card key={categoria}>
                <CardHeader>
                  <CardTitle className="text-base">{categoria}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {righe.map((r) => {
                    const isInt = r.tipo === 'int' || r.tipo === 'number'
                    return (
                      <div
                        key={r.id}
                        className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-4"
                      >
                        <div className="min-w-0 flex-1">
                          <Label htmlFor={`v-${r.chiave}`}>
                            {r.etichetta || r.chiave}
                          </Label>
                          {isInt ? (
                            <Input
                              id={`v-${r.chiave}`}
                              type="number"
                              className="mt-1"
                              value={valori[r.chiave] ?? r.valore}
                              onChange={(e) => setValori((prev) => ({ ...prev, [r.chiave]: e.target.value }))}
                            />
                          ) : (
                            <Input
                              id={`v-${r.chiave}`}
                              type="text"
                              className="mt-1"
                              value={valori[r.chiave] ?? r.valore}
                              onChange={(e) => setValori((prev) => ({ ...prev, [r.chiave]: e.target.value }))}
                            />
                          )}
                        </div>
                        <Button
                          type="button"
                          className="shrink-0"
                          disabled={savingKey === r.chiave}
                          onClick={() => void salvaParam(r)}
                        >
                          {savingKey === r.chiave ? 'Salva…' : 'Salva'}
                        </Button>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            ))}
        </div>
      )}

      {tab === 'birre' && (
        <div className="space-y-4">
          {errBirre && (
            <p className="text-sm text-red-400" role="alert">
              {errBirre}
            </p>
          )}

          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={() => setNuovaAperta(true)}>
              <Plus className="mr-1 h-4 w-4" />
              Nuova birra
            </Button>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Elenco birre</CardTitle>
                <CardDescription>Seleziona una voce</CardDescription>
              </CardHeader>
              <CardContent className="max-h-72 space-y-1 overflow-y-auto pr-1">
                {birre.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setSelezionata(b)}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 rounded border px-3 py-2 text-left text-sm',
                      selezionata?.id === b.id
                        ? 'border-primary bg-secondary'
                        : 'border-transparent hover:border-border hover:bg-secondary/50'
                    )}
                  >
                    <span className="font-medium text-foreground">{b.nome}</span>
                    <Badge className="shrink-0" variant="outline" title={b.attiva === 1 ? 'Attiva' : 'Non attiva'}>
                      {b.attiva === 1 ? 'attiva' : 'non attiva'}
                    </Badge>
                  </button>
                ))}
              </CardContent>
            </Card>

            {selezionata ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Dettaglio: {selezionata.nome}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1">
                    <Label htmlFor="b-nome">Nome</Label>
                    <Input
                      id="b-nome"
                      value={formBirra.nome}
                      onChange={(e) => setFormBirra((f) => ({ ...f, nome: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="b-stile">Stile</Label>
                    <Input
                      id="b-stile"
                      value={formBirra.stile}
                      onChange={(e) => setFormBirra((f) => ({ ...f, stile: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="b-desc">Descrizione</Label>
                    <Input
                      id="b-desc"
                      value={formBirra.descrizione}
                      onChange={(e) => setFormBirra((f) => ({ ...f, descrizione: e.target.value }))}
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={formBirra.attiva}
                      onChange={(e) => setFormBirra((f) => ({ ...f, attiva: e.target.checked }))}
                    />
                    <span className="text-foreground/80">Birra attiva in produzione</span>
                  </label>
                  <div>
                    <Button type="button" disabled={savingBirra} onClick={() => void salvaBirra()}>
                      {savingBirra ? 'Salva…' : 'Salva birra'}
                    </Button>
                  </div>
                  <div>
                    <h4 className="mb-1 text-sm font-medium text-foreground">Ricetta attiva (ingredienti)</h4>
                    <div className="mb-2 overflow-x-auto rounded border border-border">
                      <table className="w-full min-w-[300px] text-sm">
                        <thead className="bg-secondary/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                          <tr>
                            <th className="p-2 font-medium">Materia prima</th>
                            <th className="p-2 font-medium">Quantità</th>
                            <th className="p-2 font-medium">U.M.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ricetta.length === 0 && (
                            <tr>
                              <td colSpan={3} className="p-2 text-muted-foreground">
                                Nessun ingrediente
                              </td>
                            </tr>
                          )}
                          {ricetta.map((i) => (
                            <tr key={i.id} className="border-t border-border/50">
                              <td className="p-2 text-foreground/80">{i.mp_nome}</td>
                              <td className="p-2 text-foreground/80">{i.quantita}</td>
                              <td className="p-2 text-muted-foreground">{i.unita_misura}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <Button type="button" variant="outline" onClick={apriModaleRicetta}>
                      Modifica ricetta
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="flex min-h-[12rem] items-center justify-center rounded border border-dashed border-border text-sm text-muted-foreground">
                Selezionare una birra dall’elenco
              </div>
            )}
          </div>

          <Dialog open={nuovaAperta} onOpenChange={setNuovaAperta}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nuova birra</DialogTitle>
                <DialogDescription>Crea un nuovo profilo e una ricetta vuota (v1).</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label htmlFor="nb-nome">Nome</Label>
                  <Input
                    id="nb-nome"
                    value={nuovaForm.nome}
                    onChange={(e) => setNuovaForm((f) => ({ ...f, nome: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="nb-stile">Stile</Label>
                  <Input
                    id="nb-stile"
                    value={nuovaForm.stile}
                    onChange={(e) => setNuovaForm((f) => ({ ...f, stile: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="nb-d">Descrizione</Label>
                  <Input
                    id="nb-d"
                    value={nuovaForm.descrizione}
                    onChange={(e) => setNuovaForm((f) => ({ ...f, descrizione: e.target.value }))}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setNuovaAperta(false)}>
                  Annulla
                </Button>
                <Button type="button" disabled={!nuovaForm.nome.trim()} onClick={() => void creaBirra()}>
                  Crea
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={ricettaAperta} onOpenChange={setRicettaAperta}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Modifica ricetta</DialogTitle>
                <DialogDescription>Salvando, viene creata una nuova versione; la vecchia resta in archivio (non attiva).</DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                {bozzaIng.map((b, idx) => (
                  <div key={idx} className="grid gap-2 sm:grid-cols-12 sm:items-end">
                    <div className="sm:col-span-5">
                      <Label>Materia prima</Label>
                      <select
                        className="mt-1 flex h-9 w-full rounded-md border border-input px-2 text-sm"
                        value={b.materia_prima_id}
                        onChange={(e) => {
                          const n = parseInt(e.target.value, 10) || 0
                          setBozzaIng((p) => p.map((r, j) => (j === idx ? { ...r, materia_prima_id: n } : r)))
                        }}
                      >
                        <option value={0}>Scegli…</option>
                        {materie.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.nome}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-3">
                      <Label>Quantità</Label>
                      <Input
                        type="number"
                        className="mt-1"
                        value={b.quantita || ''}
                        onChange={(e) => {
                          const n = parseFloat(e.target.value) || 0
                          setBozzaIng((p) => p.map((r, j) => (j === idx ? { ...r, quantita: n } : r)))
                        }}
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <Label>Nota</Label>
                      <Input
                        className="mt-1"
                        value={b.note}
                        onChange={(e) =>
                          setBozzaIng((p) => p.map((r, j) => (j === idx ? { ...r, note: e.target.value } : r)))
                        }
                      />
                    </div>
                    <div className="sm:col-span-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => rimuoviIng(idx)}
                        disabled={bozzaIng.length === 1}
                        title="Rimuovi riga"
                        className="w-full"
                      >
                        −
                      </Button>
                    </div>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={aggiungiIng}>
                  Aggiungi ingrediente
                </Button>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setRicettaAperta(false)}>
                  Annulla
                </Button>
                <Button type="button" disabled={savingRicetta} onClick={() => void salvaRicettaFn()}>
                  {savingRicetta ? 'Salva…' : 'Salva ricetta'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {tab === 'backup' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Configurazione destinazione</CardTitle>
              <CardDescription>Cartella per i file <code>fermento_backup_*.db</code></CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {!percorsoBackupConfig && (
                <div
                  className="rounded border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-400"
                  role="status"
                >
                  Backup non configurato — seleziona una cartella di destinazione
                </div>
              )}
              <div className="space-y-1">
                <Label htmlFor="backup-path">Percorso</Label>
                <Input
                  id="backup-path"
                  readOnly
                  className="bg-secondary/30"
                  value={percorsoBackupConfig || '— (non impostata)'}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => void onSelezionaCartellaBackup()}>
                  Seleziona cartella
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Azioni</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button type="button" disabled={eseguendoBackup} onClick={() => void onEseguiBackupOra()}>
                {eseguendoBackup ? 'Esecuzione…' : 'Esegui backup ora'}
              </Button>
              <Button type="button" variant="outline" onClick={() => void onRipristinaBackup()}>
                Ripristina da backup
              </Button>
            </CardContent>
            {errBackup && (
              <CardContent>
                <p className="text-sm text-red-400" role="alert">
                  {errBackup}
                </p>
              </CardContent>
            )}
            {msgBackup && (
              <CardContent>
                <p className="text-sm text-emerald-400" role="status">
                  {msgBackup}
                </p>
              </CardContent>
            )}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Storico backup (ultimi 10)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded border border-border">
                <table className="w-full min-w-[800px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="p-2 font-medium">Data</th>
                      <th className="p-2 font-medium">Tipo</th>
                      <th className="p-2 font-medium">Esito</th>
                      <th className="p-2 font-medium">Dimensione</th>
                      <th className="p-2 font-medium">Percorso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {storicoBackup.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-3 text-muted-foreground">
                          Nessun log ancora
                        </td>
                      </tr>
                    )}
                    {storicoBackup.map((g) => (
                      <tr key={g.id} className="border-b border-border/50 last:border-0">
                        <td className="p-2 whitespace-nowrap text-foreground/80">
                          {(() => {
                            const d = new Date(g.data)
                            return Number.isNaN(d.getTime()) ? g.data : d.toLocaleString('it-IT')
                          })()}
                        </td>
                        <td className="p-2 text-foreground/80">{g.tipo === 'manuale' ? 'manuale' : 'automatico'}</td>
                        <td className="p-2">
                          {g.esito === 'ok' ? (
                            <span className="inline-flex rounded-full border border-emerald-500/25 bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400">
                              ok
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full border border-red-500/25 bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-400">
                              errore
                            </span>
                          )}
                        </td>
                        <td className="p-2 text-muted-foreground">
                          {g.dimensione_bytes == null
                            ? '—'
                            : g.dimensione_bytes < 1024
                              ? `${g.dimensione_bytes} B`
                              : g.dimensione_bytes < 1048576
                                ? `${(g.dimensione_bytes / 1024).toFixed(1)} KB`
                                : `${(g.dimensione_bytes / 1048576).toFixed(1)} MB`}
                        </td>
                        <td
                          className="max-w-[200px] truncate p-2 text-muted-foreground"
                          title={g.percorso_destinazione || undefined}
                        >
                          {g.percorso_destinazione || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === 'sicurezza' && (
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Cambio password</CardTitle>
            <CardDescription>Requisito: almeno 6 caratteri; conferma e nuova devono coincidere.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmitCambioPassword} className="space-y-3">
              {errPw && <p className="text-sm text-red-400">{errPw}</p>}
              {okPw && <p className="text-sm text-emerald-400">Password aggiornata</p>}
              <div>
                <Label htmlFor="pw0">Password attuale</Label>
                <Input
                  id="pw0"
                  type="password"
                  autoComplete="current-password"
                  className="mt-1"
                  value={pwAtt}
                  onChange={(e) => setPwAtt(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="pw1">Nuova password</Label>
                <Input
                  id="pw1"
                  type="password"
                  className="mt-1"
                  value={pwNu}
                  onChange={(e) => setPwNu(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="pw2">Conferma nuova password</Label>
                <Input
                  id="pw2"
                  type="password"
                  className="mt-1"
                  value={pwConf}
                  onChange={(e) => setPwConf(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={savingPw}>
                {savingPw ? 'Salva…' : 'Salva'}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
