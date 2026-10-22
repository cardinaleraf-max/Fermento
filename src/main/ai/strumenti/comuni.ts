/**
 * Tipi e piccoli aiuti condivisi dagli strumenti di Bira.
 * Gli strumenti sono SOLO in lettura e non restituiscono mai contatti, note
 * libere di clienti/vendite/fusti né segreti: i nomi di clienti e fornitori
 * vengono poi sostituiti da codici prima di uscire dal PC (privacy.ts).
 */
import type BetterSqlite3 from 'better-sqlite3'
import type { ChatToolDef } from '../tipi'

export type Db = BetterSqlite3.Database

export type ToolContext = {
  /** Proposta di navigazione verso una schermata (l'utente può rifiutare). */
  richiediNavigazione?: (sezione: string, motivo?: string) => void
  /** Modulo agricolo acceso: abilita strumenti e schermate agricole. */
  moduloAgricolo?: boolean
}

export type ToolDefinition = {
  name: string
  description: string
  parameters: ChatToolDef['function']['parameters']
  handler: (db: Db, args: Record<string, unknown>, ctx: ToolContext) => unknown
  /** true = disponibile solo con il modulo agricolo acceso. */
  agricolo?: boolean
  /** Testo aggiunto alla descrizione quando il modulo agricolo è acceso. */
  descrizioneAgricola?: string
}

export function asInt(v: unknown, fallback: number, min?: number, max?: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  if (!Number.isFinite(n)) return fallback
  let out = Math.trunc(n)
  if (min !== undefined && out < min) out = min
  if (max !== undefined && out > max) out = max
  return out
}

export function asString(v: unknown): string {
  if (typeof v === 'string') return v
  if (v == null) return ''
  return String(v)
}

/** Data AAAA-MM-GG valida o null. */
export function asDateOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
}

/** Numero intero accettato anche come stringa (i modelli a volte li scrivono così). */
export function intero(description: string): Record<string, unknown> {
  return { type: ['integer', 'string'], description }
}

export function testo(description: string): Record<string, unknown> {
  return { type: 'string', description }
}

export function getConfigInt(db: Db, chiave: string, fallback: number): number {
  try {
    const row = db.prepare(`SELECT valore FROM configurazioni WHERE chiave = ?`).get(chiave) as
      | { valore: string }
      | undefined
    const n = parseInt(row?.valore ?? '', 10)
    return Number.isFinite(n) ? n : fallback
  } catch {
    return fallback
  }
}

/** Filtro periodo su una colonna data: da/a espliciti oppure ultimi N giorni. */
export function filtroPeriodo(
  colonna: string,
  args: Record<string, unknown>,
  giorniDefault: number
): { sql: string; params: unknown[] } {
  const da = asDateOrNull(args.da)
  const a = asDateOrNull(args.a)
  if (da && a) return { sql: `${colonna} BETWEEN ? AND ?`, params: [da, a] }
  const giorni = asInt(args.giorni, giorniDefault, 1, 3650)
  return { sql: `${colonna} >= DATE('now', ?)`, params: [`-${giorni} days`] }
}
