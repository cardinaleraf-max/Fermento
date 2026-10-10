import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Sparkles, Wheat } from 'lucide-react'
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
import { Switch } from '@/components/ui/switch'
import { useAgricolo } from '@/components/agricolo/contesto'
import ModuloAgricoloImpostazioni from './impostazioni/ModuloAgricoloImpostazioni'
import {
  etichettaCategoria,
  isCategoriaInputAgricolo,
  isCategoriaMpAgricola,
  notificaCambioModulo
} from '@/lib/agricolo'

type TabId = 'identita' | 'parametri' | 'assistente' | 'birre' | 'agricolo' | 'sicurezza' | 'backup'

type ConfigRiga = Awaited<ReturnType<typeof window.api.impostazioni.lista>>[number]
type AiHealth = Awaited<ReturnType<typeof window.api.ai.health>>
type BirraRiga = Awaited<ReturnType<typeof window.api.impostazioni.birre>>[number]
type RicettaRiga = Awaited<ReturnType<typeof window.api.impostazioni.ricetta>>[number]
type MpRiga = Awaited<ReturnType<typeof window.api.mp.lista>>[number]
type VersioneRicetta = Awaited<ReturnType<typeof window.api.impostazioni.versioni_ricette>>[number]

type IngredienteBozza = { materia_prima_id: number; quantita: number; note: string }

const tabs: { id: TabId; label: string; icon?: typeof Sparkles }[] = [
  { id: 'identita', label: 'Identita birrificio' },
  { id: 'parametri', label: 'Parametri' },
  { id: 'assistente', label: 'Assistente AI', icon: Sparkles },
  { id: 'birre', label: 'Birre e ricette' },
  { id: 'sicurezza', label: 'Sicurezza' },
  { id: 'backup', label: 'Backup' }
]

const CAT_ASSISTENTE = 'assistente_ai'
/** Categorie gestite da schermate dedicate, non dall'elenco generico dei parametri. */
const CAT_MODULI = 'moduli'
const CAT_AGRICOLO = 'agricolo'

function groupByCategoria(
  items: ConfigRiga[],
  options?: { escludiCategorie?: string[] }
): Map<string, ConfigRiga[]> {
  const skip = new Set(options?.escludiCategorie ?? [])
  const m = new Map<string, ConfigRiga[]>()
  for (const c of items) {
    if (c.categoria && skip.has(c.categoria)) continue
    const key = c.categoria || 'Altro'
    const list = m.get(key) ?? []
    list.push(c)
    m.set(key, list)
  }
  return m
}

export default function Impostazioni(): React.JSX.Element {
  const [tab, setTab] = useState<TabId>('identita')
  const agricolo = useAgricolo()
  const tabsVisibili = useMemo(() => {
    if (!agricolo.attivo) return tabs
    const i = tabs.findIndex((t) => t.id === 'birre')
    return [...tabs.slice(0, i + 1), { id: 'agricolo' as const, label: 'Modulo agricolo', icon: Wheat }, ...tabs.slice(i + 1)]
  }, [agricolo.attivo])
  const [moduloInSalvataggio, setModuloInSalvataggio] = useState(false)
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
  const [confermaDis, setConfermaDis] = useState<BirraRiga | null>(null)
  const [mostraInattive, setMostraInattive] = useState(false)
  const [errRiattiva, setErrRiattiva] = useState<{ id: number; msg: string } | null>(null)

  const [versioni, setVersioni] = useState<VersioneRicetta[]>([])
  const [mostraArchiviate, setMostraArchiviate] = useState(false)
  const [confermaArchivia, setConfermaArchivia] = useState<VersioneRicetta | null>(null)
  const [errVersioni, setErrVersioni] = useState<string | null>(null)

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

  const [aiHealth, setAiHealth] = useState<AiHealth | null>(null)
  const [aiHealthLoad, setAiHealthLoad] = useState(false)

  const [licenzaStato, setLicenzaStato] = useState<{
    valida: boolean
    intestatario?: string
    scadenza?: string | null
    errore?: string
  } | null>(null)
  const [cambioLicenzaAperto, setCambioLicenzaAperto] = useState(false)
  const [nuovaChiaveLicenza, setNuovaChiaveLicenza] = useState('')
  const [errCambioLicenza, setErrCambioLicenza] = useState('')
  const [savingLicenza, setSavingLicenza] = useState(false)

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

  const caricaLicenza = useCallback(async () => {
    try {
      const stato = await window.api.licenza.stato()
      setLicenzaStato(stato)
    } catch {
      setLicenzaStato({ valida: false, errore: 'Errore caricamento' })
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

  const rigaModuloAgricolo = config.find((c) => c.chiave === 'modulo_agricolo_attivo')

  const cambiaModuloAgricolo = async (attivo: boolean): Promise<void> => {
    setModuloInSalvataggio(true)
    setErrParam(null)
    try {
      await window.api.impostazioni.aggiorna('modulo_agricolo_attivo', attivo ? '1' : '0')
      await caricaConfig()
      notificaCambioModulo()
    } catch (e) {
      setErrParam(e instanceof Error ? e.message : 'Impossibile cambiare il modulo')
    } finally {
      setModuloInSalvataggio(false)
    }
  }

  useEffect(() => {
    if (tab === 'identita') {
      void caricaLicenza()
    }
  }, [tab, caricaLicenza])

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

  useEffect(() => {
    if (tab !== 'assistente') return
    void caricaConfig()
  }, [tab, caricaConfig])

  const caricaAiHealth = useCallback(async () => {
    setAiHealthLoad(true)
    try {
      setAiHealth(await window.api.ai.health())
    } catch (e) {
      setAiHealth({
        abilitato: true,
        provider: 'groq',
        url: '',
        modello: '',
        remoto: true,
        raggiungibile: false,
        errore: e instanceof Error ? e.message : 'Impossibile contattare l’assistente'
      })
    } finally {
      setAiHealthLoad(false)
    }
  }, [])

  useEffect(() => {
    if (tab !== 'assistente') {
      setAiHealth(null)
      return
    }
    void caricaAiHealth()
  }, [tab, caricaAiHealth])

  const caricaVersioni = useCallback(async (birraId: number) => {
    try {
      setVersioni(await window.api.impostazioni.versioni_ricette(birraId, true))
    } catch {
      setVersioni([])
    }
  }, [])

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
      void caricaVersioni(selezionata.id)
    } else {
      setRicetta([])
      setVersioni([])
    }
  }, [selezionata, ricaricaRicetta, caricaVersioni])

  const birreAttive = useMemo(() => birre.filter((b) => b.attiva === 1), [birre])
  const birreInattive = useMemo(() => birre.filter((b) => b.attiva === 0), [birre])

  const groupedParametri = useMemo(
    () => groupByCategoria(config, { escludiCategorie: [CAT_ASSISTENTE, CAT_MODULI, CAT_AGRICOLO] }),
    [config]
  )

  // Configurazione a prova di errore: esponiamo SOLO la API key Groq.
  // Provider, URL e modello sono fissi lato backend (vedi agent.ts), cosi'
  // l'utente non puo' sbagliare campo.
  const righeAssistente = useMemo(
    () => config.filter((c) => c.chiave === 'ai_groq_api_key'),
    [config]
  )

  const salvaParam = async (r: ConfigRiga) => {
    setSavingKey(r.chiave)
    setErrParam(null)
    try {
      const v = valori[r.chiave] ?? r.valore
      await window.api.impostazioni.aggiorna(r.chiave, v)
      await caricaConfig()
      if (r.categoria === CAT_ASSISTENTE && tab === 'assistente') {
        void caricaAiHealth()
      }
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
        attiva: selezionata.attiva
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

  const handleDisattiva = async (id: number) => {
    setErrBirre(null)
    try {
      const r = await window.api.birre.disattiva(id)
      if (!r.ok) { setErrBirre(r.errore); return }
      if (selezionata?.id === id) setSelezionata(null)
      await caricaBirre()
    } catch (e) {
      setErrBirre(e instanceof Error ? e.message : 'Errore disattivazione')
    } finally {
      setConfermaDis(null)
    }
  }

  const handleRiattiva = async (id: number) => {
    setErrRiattiva(null)
    try {
      const r = await window.api.birre.riattiva(id)
      if (!r.ok) { setErrRiattiva({ id, msg: r.errore }); return }
      await caricaBirre()
    } catch (e) {
      setErrRiattiva({ id, msg: e instanceof Error ? e.message : 'Errore riattivazione' })
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

  const handleArchiviaRicetta = async (v: VersioneRicetta) => {
    if (!selezionata) return
    setErrVersioni(null)
    try {
      const r = await window.api.ricette.archivia(v.id)
      if (!r.ok) { setErrVersioni(r.errore); setConfermaArchivia(null); return }
      setConfermaArchivia(null)
      await ricaricaRicetta(selezionata.id)
      await caricaVersioni(selezionata.id)
    } catch (e) {
      setErrVersioni(e instanceof Error ? e.message : 'Errore archiviazione')
      setConfermaArchivia(null)
    }
  }

  const handleRipristinaRicetta = async (v: VersioneRicetta) => {
    if (!selezionata) return
    setErrVersioni(null)
    try {
      const r = await window.api.ricette.disarchivia(v.id)
      if (!r.ok) { setErrVersioni(r.errore); return }
      await caricaVersioni(selezionata.id)
    } catch (e) {
      setErrVersioni(e instanceof Error ? e.message : 'Errore ripristino')
    }
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
      await caricaVersioni(selezionata.id)
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

  const handleCambiaLicenza = async (): Promise<void> => {
    if (!nuovaChiaveLicenza.trim()) {
      setErrCambioLicenza('Inserisci la chiave licenza')
      return
    }
    setErrCambioLicenza('')
    setSavingLicenza(true)
    try {
      const risultato = await window.api.licenza.attiva(nuovaChiaveLicenza.trim())
      if (!risultato.ok) {
        setErrCambioLicenza(risultato.errore)
        return
      }
      setCambioLicenzaAperto(false)
      setNuovaChiaveLicenza('')
      void caricaLicenza()
    } finally {
      setSavingLicenza(false)
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
        {tabsVisibili.map((t) => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium',
                tab === t.id ? 'bg-secondary text-foreground shadow' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden /> : null}
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'identita' && (
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle style={{ fontSize: '1rem', fontWeight: 600 }}>Identita birrificio</CardTitle>
              <CardDescription>Informazioni base del tuo birrificio</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {config
                .filter(c => c.chiave === 'nome_birrificio' || c.chiave === 'nome_titolare')
                .map(c => (
                  <div key={c.chiave} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{c.etichetta}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        value={valori[c.chiave] ?? c.valore}
                        onChange={e => setValori(prev => ({ ...prev, [c.chiave]: e.target.value }))}
                        className="h-8 w-64 text-sm"
                        placeholder={c.chiave === 'nome_birrificio' ? 'Nome birrificio' : 'Nome titolare'}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={savingKey === c.chiave}
                        onClick={async () => {
                          const valore = valori[c.chiave]
                          if (valore === undefined) return
                          setSavingKey(c.chiave)
                          try {
                            await window.api.impostazioni.aggiorna(c.chiave, valore)
                            setConfig(prev =>
                              prev.map(x => (x.chiave === c.chiave ? { ...x, valore } : x))
                            )
                          } catch {
                            setErrParam('Errore salvataggio')
                          } finally {
                            setSavingKey(null)
                          }
                        }}
                      >
                        {savingKey === c.chiave ? '...' : 'Salva'}
                      </Button>
                    </div>
                  </div>
                ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle style={{ fontSize: '1rem', fontWeight: 600 }}>Licenza</CardTitle>
              <CardDescription>Informazioni sulla tua licenza Fermento</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {licenzaStato ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground w-32">Intestata a</span>
                    <span className="text-sm font-medium">{licenzaStato.intestatario ?? '-'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground w-32">Scadenza</span>
                    <span className="text-sm font-medium">
                      {licenzaStato.scadenza === null || licenzaStato.scadenza === undefined
                        ? 'Mai'
                        : licenzaStato.scadenza}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground w-32">Stato</span>
                    <Badge variant={licenzaStato.valida ? 'default' : 'destructive'}>
                      {licenzaStato.valida ? 'Attiva' : 'Non valida'}
                    </Badge>
                  </div>
                  {licenzaStato.errore && (
                    <p className="text-sm text-destructive">{licenzaStato.errore}</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Caricamento...</p>
              )}
              <div className="pt-2">
                <Button variant="outline" size="sm" onClick={() => setCambioLicenzaAperto(true)}>
                  Cambia chiave licenza
                </Button>
              </div>
            </CardContent>
          </Card>

          <Dialog open={cambioLicenzaAperto} onOpenChange={setCambioLicenzaAperto}>
            <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
              <DialogHeader>
                <DialogTitle>Cambia chiave licenza</DialogTitle>
                <DialogDescription>
                  Inserisci la nuova chiave di licenza fornita al momento dell'acquisto.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <Label htmlFor="nuova-chiave">Chiave licenza</Label>
                <textarea
                  id="nuova-chiave"
                  value={nuovaChiaveLicenza}
                  onChange={(e) => setNuovaChiaveLicenza(e.target.value)}
                  rows={4}
                  placeholder="FRMTO-XXXXX-XXXXX-..."
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    fontFamily: 'monospace',
                    fontSize: '0.8rem',
                    background: 'hsl(var(--background))',
                    color: 'hsl(var(--foreground))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px',
                    resize: 'none',
                    outline: 'none'
                  }}
                />
                {errCambioLicenza && <p className="text-sm text-destructive">{errCambioLicenza}</p>}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setCambioLicenzaAperto(false)
                    setNuovaChiaveLicenza('')
                    setErrCambioLicenza('')
                  }}
                >
                  Annulla
                </Button>
                <Button onClick={() => { void handleCambiaLicenza() }} disabled={savingLicenza}>
                  {savingLicenza ? '...' : 'Attiva'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {tab === 'parametri' && (
        <div className="space-y-4">
          {errParam && (
            <p className="text-sm text-red-400" role="alert">
              {errParam}
            </p>
          )}
          {rigaModuloAgricolo && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Moduli aggiuntivi</CardTitle>
                <CardDescription>Funzioni facoltative, da attivare solo se ti servono.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">Filiera agricola (campo → malto)</p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      Per i birrifici agricoli: campi e semine, concimazioni e trattamenti, raccolte, analisi e
                      calibratura dell&apos;orzo, maltazione e tracciabilità dal campo alla bottiglia. Spegnendolo
                      i dati restano salvati, solo nascosti.
                    </p>
                  </div>
                  <Switch
                    aria-label="Attiva il modulo filiera agricola"
                    checked={rigaModuloAgricolo.valore === '1'}
                    disabled={moduloInSalvataggio}
                    onCheckedChange={(v) => void cambiaModuloAgricolo(v)}
                  />
                </div>
              </CardContent>
            </Card>
          )}
          {[...groupedParametri.entries()]
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([categoria, righe]) => (
              <Card key={categoria}>
                <CardHeader>
                  <CardTitle className="text-base">{categoria}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {righe.map((r) => {
                    const isInt = r.tipo === 'int' || r.tipo === 'number'
                    const isPassword = r.tipo === 'password' || r.tipo === 'secret'
                    const inputType = isInt ? 'number' : isPassword ? 'password' : 'text'
                    return (
                      <div
                        key={r.id}
                        className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-4"
                      >
                        <div className="min-w-0 flex-1">
                          <Label htmlFor={`v-${r.chiave}`}>
                            {r.etichetta || r.chiave}
                          </Label>
                          <Input
                            id={`v-${r.chiave}`}
                            type={inputType}
                            className="mt-1"
                            autoComplete={isPassword ? 'new-password' : undefined}
                            placeholder={isPassword ? '••••••••••••••••' : undefined}
                            value={valori[r.chiave] ?? r.valore}
                            onChange={(e) =>
                              setValori((prev) => ({ ...prev, [r.chiave]: e.target.value }))
                            }
                          />
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

      {tab === 'agricolo' && agricolo.attivo && <ModuloAgricoloImpostazioni />}

      {tab === 'assistente' && __DEMO_MODE__ && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Assistente Bira</CardTitle>
            <CardDescription>
              Nella versione completa Bira risponde alle domande sui tuoi dati (scorte, cotte,
              vendite, clienti, avvisi). Nella demo non è disponibile.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {tab === 'assistente' && !__DEMO_MODE__ && (
        <div className="space-y-4">
          {errParam && (
            <p className="text-sm text-red-400" role="alert">
              {errParam}
            </p>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Assistente Bira</CardTitle>
              <CardDescription>
                Per attivare Bira inserisci la tua API key Groq qui sotto. La ottieni
                gratis su console.groq.com/keys. Una volta salvata, Bira è pronto: non
                serve altro.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {aiHealthLoad && (
                <p className="text-sm text-muted-foreground" role="status">
                  Verifica connessione…
                </p>
              )}
              {!aiHealthLoad && aiHealth && (() => {
                const h = aiHealth
                const pronto = h.abilitato && h.raggiungibile
                const titolo = !h.abilitato
                  ? 'Da configurare'
                  : h.raggiungibile
                    ? 'Pronto'
                    : 'Non raggiungibile'
                const sottotesto = h.errore
                  ?? (pronto
                    ? `Online · ${h.modello || 'modello sconosciuto'}`
                    : !h.abilitato
                      ? 'Inserisci la API key Groq qui sotto.'
                      : 'Verifica la API key e la connessione a internet.')
                return (
                  <div
                    className={cn(
                      'mb-4 rounded-md border px-3 py-2 text-sm',
                      pronto
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                        : 'border-amber-500/30 bg-amber-500/10 text-amber-200'
                    )}
                    role="status"
                  >
                    <span className="font-medium">{titolo}</span>
                    <span className="text-foreground/80"> — {sottotesto}</span>
                    {pronto && (
                      <div className="mt-1 text-xs text-foreground/60">
                        Groq · cloud
                      </div>
                    )}
                  </div>
                )
              })()}
            </CardContent>
          </Card>

          {righeAssistente.length === 0 && (
            <p className="text-sm text-muted-foreground">Campo API key non trovato in database (controlla la migrazione).</p>
          )}

          {righeAssistente.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">API key Groq</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {righeAssistente.map((r) => {
                  const isInt = r.tipo === 'int' || r.tipo === 'number'
                  const isPassword = r.tipo === 'password' || r.tipo === 'secret'
                  const inputType = isInt ? 'number' : isPassword ? 'password' : 'text'
                  return (
                    <div
                      key={r.id}
                      className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-4"
                    >
                      <div className="min-w-0 flex-1">
                        <Label htmlFor={`a-${r.chiave}`}>{r.etichetta || r.chiave}</Label>
                        <Input
                          id={`a-${r.chiave}`}
                          type={inputType}
                          className="mt-1"
                          autoComplete={isPassword ? 'new-password' : undefined}
                          placeholder={isPassword ? '••••••••••••••••' : undefined}
                          value={valori[r.chiave] ?? r.valore}
                          onChange={(e) => setValori((prev) => ({ ...prev, [r.chiave]: e.target.value }))}
                        />
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
          )}
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
              <CardContent className="space-y-2 p-3">
                <div className="max-h-60 space-y-1 overflow-y-auto pr-1">
                  {birreAttive.map((b) => (
                    <div
                      key={b.id}
                      className={cn(
                        'flex w-full items-center gap-2 rounded border px-3 py-2 text-sm',
                        selezionata?.id === b.id
                          ? 'border-primary bg-secondary'
                          : 'border-transparent hover:border-border hover:bg-secondary/50'
                      )}
                    >
                      <button
                        type="button"
                        className="flex-1 text-left font-medium text-foreground"
                        onClick={() => setSelezionata(b)}
                      >
                        {b.nome}
                      </button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="shrink-0 text-xs"
                        onClick={() => setConfermaDis(b)}
                      >
                        Disattiva
                      </Button>
                    </div>
                  ))}
                  {birreAttive.length === 0 && (
                    <p className="py-2 text-xs text-muted-foreground">Nessuna birra attiva</p>
                  )}
                </div>
                {birreInattive.length > 0 && (
                  <div className="border-t border-border pt-2">
                    <button
                      type="button"
                      className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setMostraInattive((p) => !p)}
                    >
                      <span>{mostraInattive ? '▾' : '▸'} Birre disattivate</span>
                      <Badge variant="secondary" className="text-xs">
                        {birreInattive.length}
                      </Badge>
                    </button>
                    {mostraInattive && (
                      <div className="mt-1 space-y-1">
                        {birreInattive.map((b) => (
                          <div key={b.id} className="space-y-1">
                            <div
                              className={cn(
                                'flex w-full items-center gap-2 rounded border border-border/50 px-3 py-2 text-sm opacity-75',
                                selezionata?.id === b.id && 'opacity-100 border-primary bg-secondary'
                              )}
                            >
                              <button
                                type="button"
                                className="flex-1 text-left text-foreground/80"
                                onClick={() => setSelezionata(b)}
                              >
                                {b.nome}
                              </button>
                              <Badge variant="secondary" className="shrink-0 text-xs">
                                disattivata
                              </Badge>
                              <Button
                                size="sm"
                                variant="outline"
                                className="shrink-0 text-xs"
                                onClick={() => { setErrRiattiva(null); void handleRiattiva(b.id) }}
                              >
                                Riattiva
                              </Button>
                            </div>
                            {errRiattiva?.id === b.id && (
                              <p className="px-3 text-xs text-destructive">{errRiattiva.msg}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
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
                  <div>
                    <Button type="button" disabled={savingBirra} onClick={() => void salvaBirra()}>
                      {savingBirra ? 'Salva…' : 'Salva birra'}
                    </Button>
                  </div>
                  <div>
                    <h4 className="mb-2 text-sm font-medium text-foreground">Versioni ricetta</h4>
                    {errVersioni && (
                      <p className="mb-2 text-xs text-destructive" role="alert">{errVersioni}</p>
                    )}
                    <div className="mb-2 space-y-1">
                      {versioni.filter((v) => v.archiviata === 0).map((v) => (
                        <div
                          key={v.id}
                          className="flex items-center gap-2 rounded border px-3 py-1.5 text-sm"
                        >
                          <span className="flex-1 font-medium text-foreground">v{v.versione}</span>
                          {v.attiva === 1 && (
                            <Badge variant="default" className="shrink-0 text-xs">
                              ATTIVA
                            </Badge>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="shrink-0 text-xs"
                            onClick={() => setConfermaArchivia(v)}
                            disabled={versioni.filter((x) => x.archiviata === 0).length <= 1}
                          >
                            Archivia
                          </Button>
                        </div>
                      ))}
                      {versioni.filter((v) => v.archiviata === 0).length === 0 && (
                        <p className="text-xs text-muted-foreground">Nessuna versione disponibile</p>
                      )}
                    </div>
                    <button
                      type="button"
                      className="mb-2 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setMostraArchiviate((p) => !p)}
                    >
                      {mostraArchiviate ? '▾ Nascondi' : '▸ Mostra'} versioni archiviate (
                      {versioni.filter((v) => v.archiviata === 1).length})
                    </button>
                    {mostraArchiviate && (
                      <div className="mb-2 space-y-1">
                        {versioni.filter((v) => v.archiviata === 1).length === 0 ? (
                          <p className="text-xs text-muted-foreground py-1">Nessuna versione archiviata</p>
                        ) : (
                          versioni.filter((v) => v.archiviata === 1).map((v) => (
                            <div
                              key={v.id}
                              className="flex items-center gap-2 rounded border border-border/50 px-3 py-1.5 text-sm opacity-60"
                            >
                              <span className="flex-1 text-muted-foreground">v{v.versione}</span>
                              <Badge variant="secondary" className="shrink-0 text-xs">
                                archiviata
                              </Badge>
                              <Button
                                size="sm"
                                variant="outline"
                                className="shrink-0 text-xs"
                                onClick={() => void handleRipristinaRicetta(v)}
                              >
                                Ripristina
                              </Button>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                    <h4 className="mb-1 text-sm font-medium text-foreground">
                      Ingredienti ricetta attiva
                    </h4>
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

          <Dialog open={!!confermaDis} onOpenChange={(open) => { if (!open) setConfermaDis(null) }}>
            <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
              <DialogHeader>
                <DialogTitle>Disattivare birra?</DialogTitle>
                <DialogDescription>
                  Disattivare la birra <strong>{confermaDis?.nome}</strong>? Non potrai più creare
                  nuove cotte di questa birra, ma lo storico resterà visibile. Puoi riattivarla in
                  qualunque momento.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfermaDis(null)}>
                  Annulla
                </Button>
                <Button
                  className="bg-red-600 text-white hover:bg-red-700"
                  onClick={() => { if (confermaDis) void handleDisattiva(confermaDis.id) }}
                >
                  Disattiva
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

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

          <Dialog
            open={!!confermaArchivia}
            onOpenChange={(open) => { if (!open) setConfermaArchivia(null) }}
          >
            <DialogContent onOpenAutoFocus={(e) => e.preventDefault()}>
              <DialogHeader>
                <DialogTitle>Archiviare versione ricetta?</DialogTitle>
                <DialogDescription>
                  Archiviare questa versione di ricetta? Sparirà dalla gestione ricette ma le cotte
                  storiche continueranno a riferirsi a questa versione. Puoi ripristinarla in
                  qualunque momento dal toggle &quot;Mostra archiviate&quot;.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfermaArchivia(null)}>
                  Annulla
                </Button>
                <Button
                  onClick={() => { if (confermaArchivia) void handleArchiviaRicetta(confermaArchivia) }}
                >
                  Archivia
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
                        {materie
                          .filter((m) => !isCategoriaInputAgricolo(m.categoria) || m.id === b.materia_prima_id)
                          .map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.nome} —{' '}
                              {isCategoriaMpAgricola(m.categoria) ? etichettaCategoria(m.categoria) : m.categoria} (
                              {m.unita_misura})
                            </option>
                          ))}
                      </select>
                    </div>
                    <div className="sm:col-span-3">
                      <Label>Quantità</Label>
                      <div className="relative mt-1">
                        <Input
                          type="number"
                          className="pr-12"
                          value={b.quantita || ''}
                          onChange={(e) => {
                            const n = parseFloat(e.target.value) || 0
                            setBozzaIng((p) => p.map((r, j) => (j === idx ? { ...r, quantita: n } : r)))
                          }}
                        />
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                          {materie.find((m) => m.id === b.materia_prima_id)?.unita_misura ?? ''}
                        </span>
                      </div>
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
