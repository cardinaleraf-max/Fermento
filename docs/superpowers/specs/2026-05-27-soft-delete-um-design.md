# Design: Soft delete birre/ricette + UM sempre visibile

**Data:** 2026-05-27  
**Stato:** Approvato  
**Scope:** Task 1 (disattiva birra), Task 2 (archivia ricetta), Task 3 (UM sempre visibile)

---

## Principi trasversali

- **Zero breaking changes** su DB di Luca: solo migrazioni additive, nessun DELETE, nessun DROP.
- Tutte le operazioni multi-riga in `db.transaction()`.
- `try/catch + console.error` in ogni IPC handler.
- `onOpenAutoFocus={(e) => e.preventDefault()}` su tutti i nuovi Dialog.
- TypeScript strict, niente `any`.
- Nuovi IPC registrati dentro `registerImpostazioniIpcHandlers()` già esistente.

---

## Task 1 — Disattiva birra (soft delete)

### IPC backend (`src/main/index.ts`)

**`birre:disattiva(id: number)`**
```
transaction:
  UPDATE birre SET attiva=0, aggiornato_il=CURRENT_TIMESTAMP WHERE id=?
  UPDATE ricette SET attiva=0 WHERE birra_id=?
return { ok: true }
```
Le cotte storiche restano intatte; i JOIN su birra_id/ricetta_id continuano a funzionare.

**`birre:riattiva(id: number)`**
```
Controlla: SELECT id FROM ricette WHERE birra_id=? AND archiviata=0 ORDER BY versione DESC LIMIT 1
Se non esiste → return { ok: false, errore: "Nessuna ricetta disponibile. Crea prima una ricetta per questa birra." }
transaction:
  UPDATE birre SET attiva=1, aggiornato_il=CURRENT_TIMESTAMP WHERE id=?
  UPDATE ricette SET attiva=1 WHERE id=<ricetta trovata>
return { ok: true }
```

### Preload (`src/preload/index.ts` + `index.d.ts`)

Nuovo namespace `birre` in `FermentoAPI`:
```typescript
birre: {
  disattiva: (id: number) => Promise<{ ok: true } | { ok: false; errore: string }>
  riattiva:  (id: number) => Promise<{ ok: true } | { ok: false; errore: string }>
}
```

### UI (`src/renderer/src/screens/Impostazioni.tsx`, tab `birre`)

- La lista birre si divide in due sezioni:
  - **Sezione principale**: birre con `attiva=1`, pulsante "Disattiva" per ognuna.
  - **Sezione collassabile** "Birre disattivate": birre con `attiva=0`, badge grigio, pulsante "Riattiva".
- La selezione/modifica anagrafica resta invariata.
- **Dialog conferma disattivazione** (onOpenAutoFocus preventDefault):
  > "Disattivare la birra {nome}? Non potrai più creare nuove cotte di questa birra, ma lo storico resterà visibile. Puoi riattivarla in qualunque momento."
- Riattivazione: nessun dialog; se IPC ritorna `ok:false`, mostrare l'errore inline nella sezione "disattivate".
- Checkbox "Birra attiva in produzione" rimosso dal form (sostituito dai pulsanti dedicati).

---

## Task 2 — Archivia ricetta (soft delete)

### DB migration (`src/main/database.ts`, `runAdditiveMigrations`)

```typescript
try {
  database.exec(`ALTER TABLE ricette ADD COLUMN archiviata INTEGER NOT NULL DEFAULT 0`)
} catch {
  // colonna già esistente
}
```

### IPC backend (`src/main/index.ts`)

**Nuovo: `impostazioni:versioni-ricette(birraId: number, includi_archiviate?: boolean)`**
```sql
SELECT id, versione, attiva, archiviata, data_creazione
FROM ricette
WHERE birra_id = ?
  AND (archiviata = 0 OR ? = 1)
ORDER BY versione DESC
```
Ritorna `VersioneRicettaRiga[]`.

**Nuovo: `ricette:archivia(ricetta_id: number)`**
```
Leggi ricetta: SELECT id, birra_id, attiva FROM ricette WHERE id=?
Controlla: conta ricette WHERE birra_id=? AND archiviata=0 AND id!=ricetta_id
Se count=0 → return { ok: false, errore: "Non puoi archiviare l'unica ricetta disponibile della birra. Crea prima una nuova versione." }
transaction:
  UPDATE ricette SET archiviata=1, attiva=0 WHERE id=?
  Se era attiva:
    UPDATE ricette SET attiva=1 WHERE id=(
      SELECT id FROM ricette WHERE birra_id=? AND archiviata=0 AND id!=? ORDER BY versione DESC LIMIT 1
    )
return { ok: true }
```

**Nuovo: `ricette:disarchivia(ricetta_id: number)`**
```
UPDATE ricette SET archiviata=0 WHERE id=?
return { ok: true }
// Non riattiva automaticamente: l'utente sceglie esplicitamente quale attivare.
```

**Modifica: `impostazioni:ricetta(birraId)`**
Aggiunge `AND archiviata = 0` al subquery (backward-safe: una ricetta attiva non può essere archiviata):
```sql
WHERE ri.ricetta_id = (SELECT id FROM ricette WHERE birra_id = ? AND attiva = 1 AND archiviata = 0)
```

**Modifica: `prod:birre-attive`**
```sql
JOIN ricette r ON r.birra_id = b.id AND r.attiva = 1 AND r.archiviata = 0
```

**`impostazioni:salva-ricetta`**: nessuna modifica necessaria — `archiviata` default 0, il SET attiva=0 non tocca `archiviata`.

### Preload (`src/preload/index.ts` + `index.d.ts`)

Nuovo tipo:
```typescript
type VersioneRicettaRiga = {
  id: number
  versione: number
  attiva: number
  archiviata: number
  data_creazione: string
}
```

Nuovo namespace `ricette` in `FermentoAPI`:
```typescript
ricette: {
  archivia:    (ricetta_id: number) => Promise<{ ok: true } | { ok: false; errore: string }>
  disarchivia: (ricetta_id: number) => Promise<{ ok: true } | { ok: false; errore: string }>
}
```

Nuovo metodo in `impostazioni`:
```typescript
versioni_ricette: (birraId: number, includi_archiviate?: boolean) => Promise<VersioneRicettaRiga[]>
```

### UI (`src/renderer/src/screens/Impostazioni.tsx`, sezione ricette nel dettaglio birra)

Sostituisce la semplice tabella ingredienti + "Modifica ricetta" con:

1. **Lista versioni non archiviate** (caricata via `versioni_ricette`), per ognuna:
   - Badge "ATTIVA" verde se `attiva=1`, altrimenti solo numero versione
   - Pulsante "Archivia" (disabilitato se è l'unica non-archiviata)
2. **Toggle "Mostra versioni archiviate"** → sezione separata con versioni `archiviata=1`, pulsante "Ripristina" per ognuna.
3. **Dialog conferma archiviazione** (onOpenAutoFocus preventDefault):
   > "Archiviare questa versione di ricetta? Sparirà dalla gestione ricette ma le cotte storiche continueranno a riferirsi a questa versione. Puoi ripristinarla in qualunque momento dal toggle 'Mostra archiviate'."
4. **Tabella ingredienti** della ricetta attiva (esistente, invariata) + pulsante "Modifica ricetta" (esistente, invariato) — mostrati sotto la lista versioni.

Nuovi state: `versioni`, `mostraArchiviate`, `confermaArchivia`.

---

## Task 3 — Unità di misura sempre visibile

### Già corretti (nessuna modifica)

| Contesto | Stato |
|---|---|
| `Produzione.tsx` tabella ingredienti avvio cotta | ✅ `{ing.quantita} {ing.unita_misura}` |
| `Produzione.tsx` tabella MP usate in cotta | ✅ `{mat.quantita_usata} {mat.unita_misura}` |
| Avvisi scorta bassa MP | ✅ messaggio include UM (index.ts:2607) |
| AI tools lotti/scorte | ✅ campo `unita_misura` incluso nei risultati |
| Impostazioni tabella ingredienti attivi | ✅ colonna "U.M." separata |

### Modifiche necessarie

**`Impostazioni.tsx` — dialog "Modifica ricetta":**
- Dropdown MP: da `{m.nome}` a `{m.nome} — {m.categoria} ({m.unita_misura})`
- Input quantità: wrapper `relative` + `<span>` con UM della MP selezionata in posizione `absolute right-3`; se nessuna MP selezionata, span vuoto.

**`MagazzinoMP.tsx`:**
- Tabella lotti, celle quantità: `{lotto.quantita_iniziale} {materiaSelezionata.unita_misura}` e stessa cosa per `quantita_residua`
- Form "Nuovo carico", input quantità: wrapper `relative` + span UM (`materiaSelezionata.unita_misura`)
- Form "Modifica lotto", input quantità residua: stesso trattamento
- Dialog "Elimina lotto", preview quantità: aggiunge UM

Nessun componente `<QuantitaInput>` dedicato — modifiche dirette ai 4 punti sopra.

---

## File modificati

| File | Tipo modifica |
|---|---|
| `src/main/database.ts` | additiva: migration `archiviata` |
| `src/main/index.ts` | nuovi IPC birre:*, ricette:*, impostazioni:versioni-ricette; modifica impostazioni:ricetta e prod:birre-attive |
| `src/preload/index.ts` | nuovi canali IPC |
| `src/preload/index.d.ts` | nuovi tipi e namespace FermentoAPI |
| `src/renderer/src/screens/Impostazioni.tsx` | UI birre+ricette, form ricetta UM |
| `src/renderer/src/screens/MagazzinoMP.tsx` | UM in tabella lotti e form carico/modifica |
