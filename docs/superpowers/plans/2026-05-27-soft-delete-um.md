# Soft Delete Birre/Ricette + UM Sempre Visibile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggiungere soft-delete per birre e ricette (con UI di gestione versioni) e mostrare l'unità di misura ovunque compaiono quantità di materie prime.

**Architecture:** Layer backend (IPC handlers in `index.ts`) → preload bridge (`index.ts` + `index.d.ts`) → UI React (`Impostazioni.tsx`, `MagazzinoMP.tsx`). Ogni task è autonomo e committabile; l'ordine 1→2→3→4 è obbligatorio (il backend va prima del preload, che va prima dell'UI). I task 5-8 dipendono dal 4.

**Tech Stack:** Electron + better-sqlite3 (main process), React + TypeScript strict + shadcn/ui (renderer), IPC via `ipcMain.handle` / `ipcRenderer.invoke`.

> **Nota:** Il progetto non ha infrastruttura di test automatici. Ogni task include un passo di verifica manuale tramite `npm run dev`.

---

## File coinvolti

| File | Modifiche |
|---|---|
| `src/main/database.ts` | Migration additiva colonna `archiviata` |
| `src/main/index.ts` | 4 nuovi IPC + modifica 2 esistenti |
| `src/preload/index.ts` | 4 nuovi channel mapping + 1 nuovo metodo impostazioni |
| `src/preload/index.d.ts` | Nuovo tipo `VersioneRicettaRiga`, 2 nuovi namespace FermentoAPI, nuovo metodo impostazioni |
| `src/renderer/src/screens/Impostazioni.tsx` | UI birre (disattiva/riattiva), UI ricette (versioni/archivia/ripristina), UM nel form ricetta |
| `src/renderer/src/screens/MagazzinoMP.tsx` | UM in tabella lotti, form carico, form modifica lotto, dialog elimina lotto |

---

## Task 1: Migration DB — colonna `archiviata`

**File:** `src/main/database.ts`

- [ ] **Step 1: Aggiungi migration additiva in `runAdditiveMigrations`**

Apri `src/main/database.ts`. Dentro `runAdditiveMigrations`, dopo l'ultimo blocco `try/catch` esistente (dopo la normalizzazione `vendita_dettaglio cartone→bottiglia`), aggiungi:

```typescript
  try {
    database.exec(`ALTER TABLE ricette ADD COLUMN archiviata INTEGER NOT NULL DEFAULT 0`)
  } catch {
    // colonna già esistente
  }
```

- [ ] **Step 2: Verifica che l'app avvii senza crash**

```bash
npm run dev
```
Attendi che la finestra si apra. Apri DevTools → Console → verifica assenza di errori sqlite. Chiudi l'app.

- [ ] **Step 3: Commit**

```bash
git add src/main/database.ts
git commit -m "feat(db): migration additiva colonna archiviata su ricette"
```

---

## Task 2: Backend IPC — `birre:disattiva`, `birre:riattiva`, fix `prod:birre-attive`

**File:** `src/main/index.ts`

- [ ] **Step 1: Modifica `prod:birre-attive` — aggiungi filtro `archiviata`**

Trova (circa riga 747):
```typescript
        `SELECT b.*, r.id as ricetta_id, r.versione, r.cotta_litri_riferimento
         FROM birre b
         JOIN ricette r ON r.birra_id = b.id AND r.attiva = 1
         WHERE b.attiva = 1`
```
Sostituisci con:
```typescript
        `SELECT b.*, r.id as ricetta_id, r.versione, r.cotta_litri_riferimento
         FROM birre b
         JOIN ricette r ON r.birra_id = b.id AND r.attiva = 1 AND r.archiviata = 0
         WHERE b.attiva = 1`
```

- [ ] **Step 2: Aggiungi i due nuovi IPC dentro `registerImpostazioniIpcHandlers`**

Trova la chiusura `console.log('[startup] IPC handlers registrati: impostazioni:*')` (circa riga 3258). Inserisci **prima** di quella riga:

```typescript
  ipcMain.removeHandler('birre:disattiva')
  ipcMain.handle('birre:disattiva', (_e, id: number) => {
    try {
      db.transaction(() => {
        db.prepare(
          `UPDATE birre SET attiva = 0, aggiornato_il = CURRENT_TIMESTAMP WHERE id = ?`
        ).run(id)
        db.prepare(`UPDATE ricette SET attiva = 0 WHERE birra_id = ?`).run(id)
      })()
      return { ok: true as const }
    } catch (error) {
      console.error('[IPC birre:disattiva] errore:', error)
      return { ok: false as const, errore: error instanceof Error ? error.message : 'Errore' }
    }
  })

  ipcMain.removeHandler('birre:riattiva')
  ipcMain.handle('birre:riattiva', (_e, id: number) => {
    try {
      const ricetta = db
        .prepare(
          `SELECT id FROM ricette WHERE birra_id = ? AND archiviata = 0 ORDER BY versione DESC LIMIT 1`
        )
        .get(id) as { id: number } | undefined
      if (!ricetta) {
        return {
          ok: false as const,
          errore: 'Nessuna ricetta disponibile. Crea prima una ricetta per questa birra.'
        }
      }
      db.transaction(() => {
        db.prepare(
          `UPDATE birre SET attiva = 1, aggiornato_il = CURRENT_TIMESTAMP WHERE id = ?`
        ).run(id)
        db.prepare(`UPDATE ricette SET attiva = 1 WHERE id = ?`).run(ricetta.id)
      })()
      return { ok: true as const }
    } catch (error) {
      console.error('[IPC birre:riattiva] errore:', error)
      return { ok: false as const, errore: error instanceof Error ? error.message : 'Errore' }
    }
  })
```

- [ ] **Step 3: Verifica**

```bash
npm run dev
```
Vai in Produzione → "Avvia cotta". La lista birre deve ancora caricarsi normalmente. Chiudi.

- [ ] **Step 4: Commit**

```bash
git add src/main/index.ts
git commit -m "feat(ipc): birre:disattiva, birre:riattiva; filtro archiviata in prod:birre-attive"
```

---

## Task 3: Backend IPC — `ricette:archivia`, `ricette:disarchivia`, `impostazioni:versioni-ricette`, fix `impostazioni:ricetta`

**File:** `src/main/index.ts`

- [ ] **Step 1: Modifica `impostazioni:ricetta` — aggiungi `AND archiviata = 0`**

Trova (circa riga 3150):
```typescript
           WHERE ri.ricetta_id = (SELECT id FROM ricette WHERE birra_id = ? AND attiva = 1)
```
Sostituisci con:
```typescript
           WHERE ri.ricetta_id = (SELECT id FROM ricette WHERE birra_id = ? AND attiva = 1 AND archiviata = 0)
```

- [ ] **Step 2: Aggiungi i tre nuovi IPC dentro `registerImpostazioniIpcHandlers`**

Inserisci **prima** del `console.log('[startup] IPC handlers registrati: impostazioni:*')` (stesso punto del Task 2, dopo i due IPC birre appena aggiunti):

```typescript
  ipcMain.removeHandler('impostazioni:versioni-ricette')
  ipcMain.handle(
    'impostazioni:versioni-ricette',
    (_e, birraId: number, includiArchiviate?: boolean) => {
      try {
        return db
          .prepare(
            `SELECT id, versione, attiva, archiviata, data_creazione
             FROM ricette
             WHERE birra_id = ?
               AND (archiviata = 0 OR ? = 1)
             ORDER BY versione DESC`
          )
          .all(birraId, includiArchiviate ? 1 : 0) as Array<{
          id: number
          versione: number
          attiva: number
          archiviata: number
          data_creazione: string
        }>
      } catch (error) {
        console.error('[IPC impostazioni:versioni-ricette] errore:', error)
        throw error
      }
    }
  )

  ipcMain.removeHandler('ricette:archivia')
  ipcMain.handle('ricette:archivia', (_e, ricettaId: number) => {
    try {
      const ricetta = db
        .prepare(`SELECT id, birra_id, attiva FROM ricette WHERE id = ?`)
        .get(ricettaId) as { id: number; birra_id: number; attiva: number } | undefined
      if (!ricetta) {
        return { ok: false as const, errore: 'Ricetta non trovata' }
      }
      const { c: altreNonArchiviate } = db
        .prepare(
          `SELECT COUNT(*) as c FROM ricette WHERE birra_id = ? AND archiviata = 0 AND id != ?`
        )
        .get(ricetta.birra_id, ricettaId) as { c: number }
      if (altreNonArchiviate === 0) {
        return {
          ok: false as const,
          errore:
            "Non puoi archiviare l'unica ricetta disponibile della birra. Crea prima una nuova versione."
        }
      }
      db.transaction(() => {
        db.prepare(`UPDATE ricette SET archiviata = 1, attiva = 0 WHERE id = ?`).run(ricettaId)
        if (ricetta.attiva === 1) {
          db.prepare(
            `UPDATE ricette SET attiva = 1 WHERE id = (
               SELECT id FROM ricette
               WHERE birra_id = ? AND archiviata = 0 AND id != ?
               ORDER BY versione DESC LIMIT 1
             )`
          ).run(ricetta.birra_id, ricettaId)
        }
      })()
      return { ok: true as const }
    } catch (error) {
      console.error('[IPC ricette:archivia] errore:', error)
      return { ok: false as const, errore: error instanceof Error ? error.message : 'Errore' }
    }
  })

  ipcMain.removeHandler('ricette:disarchivia')
  ipcMain.handle('ricette:disarchivia', (_e, ricettaId: number) => {
    try {
      db.prepare(`UPDATE ricette SET archiviata = 0 WHERE id = ?`).run(ricettaId)
      return { ok: true as const }
    } catch (error) {
      console.error('[IPC ricette:disarchivia] errore:', error)
      return { ok: false as const, errore: error instanceof Error ? error.message : 'Errore' }
    }
  })
```

- [ ] **Step 3: Verifica**

```bash
npm run dev
```
Vai in Impostazioni → "Birre e ricette" → seleziona una birra → la tabella ingredienti deve ancora caricarsi. Chiudi.

- [ ] **Step 4: Commit**

```bash
git add src/main/index.ts
git commit -m "feat(ipc): ricette:archivia/disarchivia, impostazioni:versioni-ricette; fix filtro archiviata"
```

---

## Task 4: Preload — tipi TypeScript + mapping canali IPC

**File:** `src/preload/index.d.ts` e `src/preload/index.ts`

- [ ] **Step 1: Aggiungi tipo `VersioneRicettaRiga` in `index.d.ts`**

Trova (circa riga 547):
```typescript
type RicettaIngredienteRiga = {
```
Inserisci **prima** di essa:
```typescript
type VersioneRicettaRiga = {
  id: number
  versione: number
  attiva: number
  archiviata: number
  data_creazione: string
}

```

- [ ] **Step 2: Aggiungi namespace `birre` e `ricette` in `FermentoAPI` in `index.d.ts`**

Trova (circa riga 664):
```typescript
interface FermentoAPI {
  login: {
```
Subito dopo la riga `interface FermentoAPI {`, aggiungi i due namespace PRIMA di `login`:

```typescript
  birre: {
    disattiva: (id: number) => Promise<{ ok: true } | { ok: false; errore: string }>
    riattiva: (id: number) => Promise<{ ok: true } | { ok: false; errore: string }>
  }
  ricette: {
    archivia: (ricetta_id: number) => Promise<{ ok: true } | { ok: false; errore: string }>
    disarchivia: (ricetta_id: number) => Promise<{ ok: true } | { ok: false; errore: string }>
  }
```

- [ ] **Step 3: Aggiungi `versioni_ricette` in namespace `impostazioni` in `index.d.ts`**

Trova (circa riga 757):
```typescript
  impostazioni: {
    lista: () => Promise<ConfigurazioneRiga[]>
```
Trova la chiusura del blocco `impostazioni: {` (poco dopo `valoreDi`). Dentro quel blocco, aggiunge:
```typescript
    versioni_ricette: (birraId: number, includi_archiviate?: boolean) => Promise<VersioneRicettaRiga[]>
```
Il blocco impostazioni risultante deve essere:
```typescript
  impostazioni: {
    lista: () => Promise<ConfigurazioneRiga[]>
    aggiorna: (chiave: string, valore: string) => Promise<{ ok: true }>
    birre: () => Promise<BirraRecord[]>
    aggiornaBirra: (id: number, dati: ImpostazioniBirraForm) => Promise<{ ok: true }>
    creaBirra: (dati: ImpostazioniCreaBirra) => Promise<{ ok: true; id: number }>
    ricetta: (birraId: number) => Promise<RicettaIngredienteRiga[]>
    versioni_ricette: (birraId: number, includi_archiviate?: boolean) => Promise<VersioneRicettaRiga[]>
    salvaRicetta: (dati: SalvaRicettaInput) => Promise<{ ok: true }>
    cambiaPassword: (dati: CambiaPasswordInput) => Promise<CambiaPasswordResult>
    valoreDi: (chiave: string) => Promise<string>
  }
```

- [ ] **Step 4: Aggiungi mapping canali in `src/preload/index.ts`**

Trova il blocco `impostazioni: {` in `src/preload/index.ts` (circa riga 290). Aggiunge `versioni_ricette` dopo `ricetta`:
```typescript
    ricetta: (birraId: number) => ipcRenderer.invoke('impostazioni:ricetta', birraId),
    versioni_ricette: (birraId: number, includi_archiviate?: boolean) =>
      ipcRenderer.invoke('impostazioni:versioni-ricette', birraId, includi_archiviate),
    salvaRicetta: (dati: SalvaRicettaPayload) => ipcRenderer.invoke('impostazioni:salva-ricetta', dati),
```

Poi, trova il blocco `ai: {` (circa riga 324). Inserisci **prima** di `ai: {`:

```typescript
  birre: {
    disattiva: (id: number) => ipcRenderer.invoke('birre:disattiva', id),
    riattiva: (id: number) => ipcRenderer.invoke('birre:riattiva', id)
  },
  ricette: {
    archivia: (ricetta_id: number) => ipcRenderer.invoke('ricette:archivia', ricetta_id),
    disarchivia: (ricetta_id: number) => ipcRenderer.invoke('ricette:disarchivia', ricetta_id)
  },
```

- [ ] **Step 5: Verifica TypeScript**

```bash
npm run typecheck 2>&1 | head -30
```
Expected: nessun errore TypeScript nei file modificati. Se `typecheck` non esiste prova:
```bash
npx tsc --noEmit 2>&1 | head -30
```

- [ ] **Step 6: Commit**

```bash
git add src/preload/index.ts src/preload/index.d.ts
git commit -m "feat(preload): tipi e mapping IPC per birre, ricette, versioni-ricette"
```

---

## Task 5: UI — Birre disattiva/riattiva (`Impostazioni.tsx`)

**File:** `src/renderer/src/screens/Impostazioni.tsx`

- [ ] **Step 1: Aggiungi nuovi state e useMemo**

Trova (circa riga 72):
```typescript
  const [savingRicetta, setSavingRicetta] = useState(false)
```
Aggiungi subito dopo:
```typescript
  const [confermaDis, setConfermaDis] = useState<BirraRiga | null>(null)
  const [mostraInattive, setMostraInattive] = useState(false)
  const [errRiattiva, setErrRiattiva] = useState<{ id: number; msg: string } | null>(null)
```

Trova (circa riga 239):
```typescript
  const righeAssistente = useMemo(
```
Aggiungi **prima** di essa:
```typescript
  const birreAttive = useMemo(() => birre.filter((b) => b.attiva === 1), [birre])
  const birreInattive = useMemo(() => birre.filter((b) => b.attiva === 0), [birre])

```

- [ ] **Step 2: Aggiungi handler `handleDisattiva` e `handleRiattiva`**

Trova (circa riga 286):
```typescript
  const creaBirra = async () => {
```
Aggiungi **prima** di essa:
```typescript
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

```

- [ ] **Step 3: Sostituisci il contenuto del `<CardContent>` lista birre**

Trova il blocco dell'elenco birre (circa riga 801):
```typescript
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
```
Sostituisci con:
```typescript
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
```

- [ ] **Step 4: Rimuovi checkbox "Birra attiva in produzione" dal form dettaglio**

Trova (circa riga 853):
```typescript
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={formBirra.attiva}
                      onChange={(e) => setFormBirra((f) => ({ ...f, attiva: e.target.checked }))}
                    />
                    <span className="text-foreground/80">Birra attiva in produzione</span>
                  </label>
```
Rimuovi questo blocco intero (4 righe + label).

Trova la funzione `salvaBirra` (circa riga 264). Modifica il payload di `aggiornaBirra` per non cambiare più l'`attiva` (usa il valore corrente della birra selezionata):
```typescript
      await window.api.impostazioni.aggiornaBirra(selezionata.id, {
        nome: formBirra.nome,
        stile: formBirra.stile,
        descrizione: formBirra.descrizione,
        attiva: selezionata.attiva
      })
```

- [ ] **Step 5: Aggiungi Dialog conferma disattivazione**

Trova (circa riga 908) il Dialog `nuovaAperta`:
```typescript
          <Dialog open={nuovaAperta} onOpenChange={setNuovaAperta}>
```
Inserisci **prima** di questo Dialog:
```typescript
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
                  variant="destructive"
                  onClick={() => { if (confermaDis) void handleDisattiva(confermaDis.id) }}
                >
                  Disattiva
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

```

- [ ] **Step 6: Verifica manuale**

```bash
npm run dev
```
1. Vai in Impostazioni → "Birre e ricette".
2. Verifica che la lista mostri le birre attive con pulsante "Disattiva".
3. Clicca "Disattiva" su una birra → si apre il dialog → clicca "Annulla" → dialog si chiude.
4. Clicca "Disattiva" → "Disattiva" → la birra sparisce dalla lista attive.
5. Espandi "Birre disattivate" → la birra compare con badge "disattivata" e pulsante "Riattiva".
6. Clicca "Riattiva" → la birra torna nelle attive.
7. Vai in Produzione → Avvia cotta → la birra disattivata NON deve comparire nella lista.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/screens/Impostazioni.tsx
git commit -m "feat(ui): disattiva/riattiva birra con sezioni separate e dialog conferma"
```

---

## Task 6: UI — Gestione versioni ricetta (`Impostazioni.tsx`)

**File:** `src/renderer/src/screens/Impostazioni.tsx`

- [ ] **Step 1: Aggiungi tipo e nuovi state**

All'inizio del componente, dopo la dichiarazione dei tipi esistenti (circa riga 23):
```typescript
type MpRiga = Awaited<ReturnType<typeof window.api.mp.lista>>[number]
```
Aggiungi:
```typescript
type VersioneRicetta = Awaited<ReturnType<typeof window.api.impostazioni.versioni_ricette>>[number]
```

Trova (circa riga 73, dopo i nuovi state del Task 5):
```typescript
  const [confermaDis, setConfermaDis] = useState<BirraRiga | null>(null)
```
Aggiungi dopo gli state del Task 5:
```typescript
  const [versioni, setVersioni] = useState<VersioneRicetta[]>([])
  const [mostraArchiviate, setMostraArchiviate] = useState(false)
  const [confermaArchivia, setConfermaArchivia] = useState<VersioneRicetta | null>(null)
  const [errVersioni, setErrVersioni] = useState<string | null>(null)
```

- [ ] **Step 2: Aggiungi `caricaVersioni` callback**

Trova (circa riga 209):
```typescript
  const ricaricaRicetta = useCallback(
```
Inserisci **prima** di essa:
```typescript
  const caricaVersioni = useCallback(async (birraId: number) => {
    try {
      setVersioni(await window.api.impostazioni.versioni_ricette(birraId, true))
    } catch {
      setVersioni([])
    }
  }, [])

```

- [ ] **Step 3: Aggiorna useEffect di `selezionata` per caricare anche le versioni**

Trova (circa riga 220):
```typescript
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
```
Sostituisci con:
```typescript
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
```

- [ ] **Step 4: Aggiungi handler `handleArchiviaRicetta` e `handleRipristinaRicetta`**

Trova `const salvaRicettaFn = async ()` (circa riga 310). Aggiungi **prima** di essa:

```typescript
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

```

- [ ] **Step 5: Aggiorna `salvaRicettaFn` per ricaricare le versioni dopo il salvataggio**

Trova dentro `salvaRicettaFn` (circa riga 324):
```typescript
      setRicettaAperta(false)
      await ricaricaRicetta(selezionata.id)
```
Sostituisci con:
```typescript
      setRicettaAperta(false)
      await ricaricaRicetta(selezionata.id)
      await caricaVersioni(selezionata.id)
```

- [ ] **Step 6: Sostituisci la sezione "Ricetta attiva (ingredienti)" nel dettaglio birra**

Trova (circa riga 866):
```typescript
                  <div>
                    <h4 className="mb-1 text-sm font-medium text-foreground">Ricetta attiva (ingredienti)</h4>
                    <div className="mb-2 overflow-x-auto rounded border border-border">
```
Sostituisci l'intero blocco fino a (e incluso) il `<Button>Modifica ricetta</Button>`:
```typescript
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
```

- [ ] **Step 7: Aggiungi Dialog conferma archiviazione**

Trova il Dialog `ricettaAperta` (circa riga 951):
```typescript
          <Dialog open={ricettaAperta} onOpenChange={setRicettaAperta}>
```
Inserisci **prima** di esso:
```typescript
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

```

- [ ] **Step 8: Verifica manuale**

```bash
npm run dev
```
1. Impostazioni → "Birre e ricette" → seleziona una birra.
2. Verifica che la sezione mostri la lista versioni (es. "v1 ATTIVA") con pulsante "Archivia" disabilitato (unica versione).
3. Clicca "Modifica ricetta" → salva → torna alla birra → compare "v2 ATTIVA" e "v1" con "Archivia".
4. Clicca "Archivia" su v1 → dialog → "Archivia" → v1 sparisce dalla lista principale.
5. Clicca "▸ Mostra versioni archiviate" → v1 compare con badge "archiviata" e pulsante "Ripristina".
6. Clicca "Ripristina" su v1 → v1 torna nella sezione principale con archiviata=0 (ma non attiva).

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/screens/Impostazioni.tsx
git commit -m "feat(ui): gestione versioni ricetta con archivia/ripristina e toggle archiviate"
```

---

## Task 7: UI — Unità di misura nel form ricetta (`Impostazioni.tsx`)

**File:** `src/renderer/src/screens/Impostazioni.tsx`

- [ ] **Step 1: Aggiorna dropdown MP nel dialog "Modifica ricetta"**

Nel Dialog `ricettaAperta`, trova (circa riga 970):
```typescript
                        {materie.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.nome}
                          </option>
                        ))}
```
Sostituisci con:
```typescript
                        {materie.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.nome} — {m.categoria} ({m.unita_misura})
                          </option>
                        ))}
```

- [ ] **Step 2: Aggiungi suffisso UM all'input quantità**

Trova (circa riga 978):
```typescript
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
```
Sostituisci con:
```typescript
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
```

- [ ] **Step 3: Verifica manuale**

```bash
npm run dev
```
1. Impostazioni → "Birre e ricette" → seleziona birra → "Modifica ricetta".
2. Dropdown MP: ogni opzione deve mostrare "Pils — Malto (kg)" o simile.
3. Seleziona una MP con kg → il campo quantità deve mostrare "kg" a destra.
4. Seleziona una MP con g → il suffisso deve cambiare in "g".

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/screens/Impostazioni.tsx
git commit -m "feat(ui): unità di misura nel dropdown MP e suffisso sull'input quantità ricetta"
```

---

## Task 8: UI — Unità di misura in MagazzinoMP (`MagazzinoMP.tsx`)

**File:** `src/renderer/src/screens/MagazzinoMP.tsx`

- [ ] **Step 1: Aggiungi UM nelle celle della tabella lotti**

Trova (circa riga 562):
```typescript
                        <td className="px-3 py-2">{lotto.quantita_iniziale}</td>
                        <td className="px-3 py-2">{lotto.quantita_residua}</td>
```
Sostituisci con:
```typescript
                        <td className="px-3 py-2">
                          {lotto.quantita_iniziale}{' '}
                          <span className="text-muted-foreground text-xs">{materiaSelezionata?.unita_misura}</span>
                        </td>
                        <td className="px-3 py-2">
                          {lotto.quantita_residua}{' '}
                          <span className="text-muted-foreground text-xs">{materiaSelezionata?.unita_misura}</span>
                        </td>
```

- [ ] **Step 2: Aggiungi UM nel form "Nuovo carico" (input quantità)**

Trova (circa riga 866):
```typescript
            <div className="grid gap-1.5">
              <Label htmlFor="quantita">Quantita</Label>
              <Input
                id="quantita"
                type="number"
                value={caricoForm.quantita}
                onChange={(event) => setCaricoForm((prev) => ({ ...prev, quantita: event.target.value }))}
              />
            </div>
```
Sostituisci con:
```typescript
            <div className="grid gap-1.5">
              <Label htmlFor="quantita">Quantita</Label>
              <div className="relative">
                <Input
                  id="quantita"
                  type="number"
                  className="pr-12"
                  value={caricoForm.quantita}
                  onChange={(event) =>
                    setCaricoForm((prev) => ({ ...prev, quantita: event.target.value }))
                  }
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                  {materiaSelezionata?.unita_misura ?? ''}
                </span>
              </div>
            </div>
```

- [ ] **Step 3: Aggiungi UM nel form "Modifica lotto" (input quantità residua)**

Trova (circa riga 729):
```typescript
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
```
Sostituisci con:
```typescript
            <div className="grid gap-1.5">
              <Label htmlFor="mod_lotto_residua">Quantita residua</Label>
              <div className="relative">
                <Input
                  id="mod_lotto_residua"
                  type="number"
                  step="any"
                  className="pr-12"
                  value={modificaLottoForm.quantita_residua}
                  onChange={(event) =>
                    setModificaLottoForm((prev) => ({
                      ...prev,
                      quantita_residua: event.target.value
                    }))
                  }
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
                  {materiaSelezionata?.unita_misura ?? ''}
                </span>
              </div>
              {lottoSelezionato && (
                <p className="text-xs text-muted-foreground">
                  Quantita iniziale (storica): {lottoSelezionato.quantita_iniziale}{' '}
                  {materiaSelezionata?.unita_misura}
                </p>
              )}
            </div>
```

- [ ] **Step 4: Aggiungi UM nella preview del dialog "Elimina lotto"**

Trova (circa riga 796):
```typescript
              <div>
                <span className="font-medium text-foreground/80">Quantita:</span>{' '}
                {lottoSelezionato.quantita_residua} / {lottoSelezionato.quantita_iniziale}
              </div>
```
Sostituisci con:
```typescript
              <div>
                <span className="font-medium text-foreground/80">Quantita:</span>{' '}
                {lottoSelezionato.quantita_residua} {materiaSelezionata?.unita_misura} /{' '}
                {lottoSelezionato.quantita_iniziale} {materiaSelezionata?.unita_misura}
              </div>
```

- [ ] **Step 5: Verifica manuale**

```bash
npm run dev
```
1. Magazzino MP → seleziona una MP con unità "kg".
2. Tabella lotti: le colonne "Q.ta iniziale" e "Q.ta residua" devono mostrare il numero seguito da "kg" in grigio.
3. Clicca "Nuovo carico" → campo Quantita ha "kg" come suffisso.
4. Clicca matita (modifica lotto) → campo "Quantita residua" ha "kg" come suffisso; il testo help sotto include "kg".
5. Clicca cestino (elimina lotto) → la preview quantità mostra "X kg / Y kg".

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/screens/MagazzinoMP.tsx
git commit -m "feat(ui): unità di misura in tabella lotti, form carico, modifica e elimina"
```

---

## Self-Review — Copertura spec

| Requisito spec | Task |
|---|---|
| `birre:disattiva` transaction birre+ricette | Task 2 |
| `birre:riattiva` controlla ricetta non archiviata | Task 2 |
| Migration `archiviata` non distruttiva | Task 1 |
| `ricette:archivia` con guard unica ricetta | Task 3 |
| `ricette:disarchivia` senza riattivazione auto | Task 3 |
| `impostazioni:versioni-ricette` con includi_archiviate | Task 3 |
| Fix `prod:birre-attive` filtro archiviata | Task 2 |
| Fix `impostazioni:ricetta` filtro archiviata | Task 3 |
| Preload namespace `birre` e `ricette` | Task 4 |
| FermentoAPI `versioni_ricette` | Task 4 |
| UI lista birre attive/disattivate separata | Task 5 |
| Dialog conferma disattivazione | Task 5 |
| Errore riattiva inline (no ricetta disponibile) | Task 5 |
| Rimozione checkbox "Birra attiva in produzione" | Task 5 |
| UI versioni ricetta con badge ATTIVA | Task 6 |
| Pulsante Archivia (disabilitato se unica) | Task 6 |
| Toggle "Mostra versioni archiviate" | Task 6 |
| Pulsante Ripristina sulle archiviate | Task 6 |
| Dialog conferma archiviazione | Task 6 |
| Ricarica versioni dopo salvaRicetta | Task 6 |
| Dropdown MP con UM nel form ricetta | Task 7 |
| Suffisso UM sull'input quantità ricetta | Task 7 |
| UM in tabella lotti MagazzinoMP | Task 8 |
| UM in form carico | Task 8 |
| UM in form modifica lotto | Task 8 |
| UM in dialog elimina lotto preview | Task 8 |
| `onOpenAutoFocus` su tutti i nuovi Dialog | Tasks 5, 6 |
| Tutto in `registerImpostazioniIpcHandlers` | Tasks 2, 3 |
| `initDatabase()` prima dei register* | Già garantito (invariato) |
