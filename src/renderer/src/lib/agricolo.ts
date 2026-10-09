import { ETICHETTE_CATEGORIA } from '../../../shared/agricolo'

export * from '../../../shared/agricolo'

/** Evento lanciato quando cambia l'interruttore del modulo o la stagione corrente. */
export const EVENTO_MODULO_AGRICOLO = 'fermento:modulo-agricolo'

export function notificaCambioModulo(): void {
  window.dispatchEvent(new Event(EVENTO_MODULO_AGRICOLO))
}

/** Data locale di oggi AAAA-MM-GG. */
export function oggiIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** "2026-08-29" → "29/08/2026" (senza passare per Date: niente scarti di fuso orario). */
export function fmtData(iso: string | null | undefined): string {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

export function fmtNum(n: number | null | undefined, decimali = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  return n.toLocaleString('it-IT', { maximumFractionDigits: decimali })
}

export function fmtQta(n: number | null | undefined, unita: string | null | undefined, decimali = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  return `${fmtNum(n, decimali)}${unita ? ` ${unita}` : ''}`
}

/** 0,836 → "83,6%" */
export function fmtPerc(rapporto: number | null | undefined, decimali = 1): string {
  if (rapporto === null || rapporto === undefined || !Number.isFinite(rapporto)) return '—'
  return `${(rapporto * 100).toLocaleString('it-IT', { minimumFractionDigits: decimali, maximumFractionDigits: decimali })}%`
}

/** Accetta "1,5" e "1.5"; stringa vuota → null; testo non numerico → NaN. */
export function parseNumero(s: string): number | null {
  const t = s.trim().replace(/\s/g, '')
  if (!t) return null
  // "1.234,5" → 1234.5 ; "1,5" → 1.5 ; "1.5" → 1.5
  const normalizzato = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t
  return /^-?\d*\.?\d+$/.test(normalizzato) ? Number(normalizzato) : Number.NaN
}

/** Numero → testo per un campo di input (virgola decimale, niente separatore migliaia). */
export function numeroInInput(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return ''
  return String(Math.round(n * 1000) / 1000).replace('.', ',')
}

export function etichettaCategoria(c: string | null | undefined): string {
  if (!c) return '—'
  return ETICHETTE_CATEGORIA[c] ?? c
}

/** Risultato di un canale che può fallire con un messaggio per l'utente. */
export function erroreDa(r: { ok: boolean; errore?: string } | { ok: true } | { ok: false; errore: string }): string | null {
  return 'errore' in r && r.ok === false ? (r.errore ?? 'Operazione non riuscita') : null
}

export function messaggioErrore(e: unknown, fallback = 'Operazione non riuscita'): string {
  if (e instanceof Error) {
    // "Error invoking remote method 'x': Error: messaggio" → "messaggio"
    const m = /Error: (.*)$/.exec(e.message)
    return m ? m[1] : e.message
  }
  return fallback
}
