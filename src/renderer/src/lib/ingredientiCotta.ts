import { numeroInInput, parseNumero } from './agricolo'

/**
 * Bozza degli ingredienti di una cotta mentre l'utente li modifica (finestra
 * "Nuova cotta" e "Modifica ingredienti"). Logica pura, senza React.
 */

export type IngredienteRichiesto = { materia_prima_id: number; quantita: number }

export type RigaBozza = {
  chiave: string
  /** 0 = riga aggiunta in cui l'ingrediente non è ancora stato scelto. */
  materia_prima_id: number
  mp_nome: string
  unita_misura: string
  /** Come digitata (virgola decimale ammessa). */
  quantita: string
  /** Quantità della ricetta (nuova cotta) o già usata (modifica); null = ingrediente aggiunto. */
  riferimento: number | null
  /** Giacenza attuale in magazzino. */
  giacenza: number
  /** Massimo assegnabile: giacenza, più quanto già scaricato per questa cotta. */
  disponibile: number
}

export type MateriaScelta = {
  id: number
  nome: string
  unita_misura: string
  giacenza_totale: number
}

const q6 = (n: number): number => Math.round(n * 1e6) / 1e6

let contatore = 0
const nuovaChiave = (): string => `ing-${++contatore}`

export function righeDaRicetta(
  ingredienti: Array<{
    materia_prima_id: number
    mp_nome: string
    unita_misura: string
    quantita: number
    giacenza_totale: number
  }>
): RigaBozza[] {
  return ingredienti.map((i) => ({
    chiave: nuovaChiave(),
    materia_prima_id: i.materia_prima_id,
    mp_nome: i.mp_nome,
    unita_misura: i.unita_misura,
    quantita: numeroInInput(i.quantita),
    riferimento: i.quantita,
    giacenza: i.giacenza_totale,
    disponibile: i.giacenza_totale
  }))
}

export function righeDaCotta(
  ingredienti: Array<{
    materia_prima_id: number
    mp_nome: string
    unita_misura: string
    quantita: number
    giacenza: number
  }>
): RigaBozza[] {
  return ingredienti.map((i) => ({
    chiave: nuovaChiave(),
    materia_prima_id: i.materia_prima_id,
    mp_nome: i.mp_nome,
    unita_misura: i.unita_misura,
    quantita: numeroInInput(i.quantita),
    riferimento: i.quantita,
    giacenza: i.giacenza,
    disponibile: q6(i.giacenza + i.quantita)
  }))
}

/**
 * Riga per un ingrediente scelto dall'elenco (aggiunta o sostituzione).
 * `riferimenti` = ricetta o quantità già usate; `giaUsato` = già scaricato per la cotta.
 */
export function rigaPerMateria(
  m: MateriaScelta,
  chiave: string,
  quantita: string,
  riferimenti: Map<number, number>,
  giaUsato: Map<number, number>
): RigaBozza {
  return {
    chiave,
    materia_prima_id: m.id,
    mp_nome: m.nome,
    unita_misura: m.unita_misura,
    quantita,
    riferimento: riferimenti.get(m.id) ?? null,
    giacenza: m.giacenza_totale,
    disponibile: q6(m.giacenza_totale + (giaUsato.get(m.id) ?? 0))
  }
}

/**
 * Sostituisce l'ingrediente di una riga. La quantità digitata resta solo se
 * l'unità è la stessa (250 g di un luppolo non diventano 250 kg di un malto).
 */
export function sostituisci(
  r: RigaBozza,
  m: MateriaScelta,
  riferimenti: Map<number, number>,
  giaUsato: Map<number, number>
): RigaBozza {
  const tieni = r.materia_prima_id > 0 && r.unita_misura === m.unita_misura
  return rigaPerMateria(m, r.chiave, tieni ? r.quantita : '', riferimenti, giaUsato)
}

export function rigaVuota(): RigaBozza {
  return {
    chiave: nuovaChiave(),
    materia_prima_id: 0,
    mp_nome: '',
    unita_misura: '',
    quantita: '',
    riferimento: null,
    giacenza: 0,
    disponibile: 0
  }
}

/** Ingredienti da inviare (duplicati sommati), oppure il primo errore da mostrare. */
export function payloadDaRighe(
  righe: RigaBozza[]
): { ok: true; ingredienti: IngredienteRichiesto[] } | { ok: false; errore: string } {
  const totali = new Map<number, number>()
  for (const r of righe) {
    if (!r.materia_prima_id)
      return { ok: false, errore: "Scegli l'ingrediente nella riga aggiunta, oppure toglila." }
    const n = parseNumero(r.quantita)
    if (n === null) return { ok: false, errore: `Inserisci la quantità di ${r.mp_nome}.` }
    if (Number.isNaN(n) || n < 0)
      return {
        ok: false,
        errore: `Quantità non valida per ${r.mp_nome}: usa un numero, es. 5 oppure 5,5.`
      }
    totali.set(r.materia_prima_id, q6((totali.get(r.materia_prima_id) ?? 0) + n))
  }
  return {
    ok: true,
    ingredienti: [...totali].map(([materia_prima_id, quantita]) => ({ materia_prima_id, quantita }))
  }
}

/** true se la bozza è diversa da quella di partenza (ordine e scrittura dei numeri non contano). */
export function righeModificate(righe: RigaBozza[], iniziali: RigaBozza[]): boolean {
  const a = payloadDaRighe(righe)
  const b = payloadDaRighe(iniziali)
  if (!a.ok || !b.ok) return true
  if (a.ingredienti.length !== b.ingredienti.length) return true
  const prima = new Map(b.ingredienti.map((i) => [i.materia_prima_id, i.quantita]))
  return a.ingredienti.some((i) => prima.get(i.materia_prima_id) !== i.quantita)
}

/** true se la quantità digitata supera quanto si può scaricare. */
export function insufficiente(r: RigaBozza): boolean {
  const n = parseNumero(r.quantita)
  return n !== null && !Number.isNaN(n) && q6(n) > q6(r.disponibile)
}

/** Ingredienti di partenza che l'utente ha tolto. */
export function tolti(
  righe: RigaBozza[],
  iniziali: RigaBozza[]
): Array<{ mp_nome: string; riferimento: number | null; unita_misura: string }> {
  const presenti = new Set(righe.map((r) => r.materia_prima_id))
  return iniziali
    .filter((r) => !presenti.has(r.materia_prima_id))
    .map((r) => ({ mp_nome: r.mp_nome, riferimento: r.riferimento, unita_misura: r.unita_misura }))
}
