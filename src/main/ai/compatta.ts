/**
 * Risultati degli strumenti più leggeri per il modello: meno token a ogni
 * domanda (il servizio gratuito ne concede pochi al minuto).
 */

/** Toglie null, testi vuoti, liste e oggetti vuoti; arrotonda i numeri a 3 decimali. */
export function compatta<T>(v: T): T {
  return pulisci(v) as T
}

function pulisci(v: unknown): unknown {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 1000) / 1000 : v
  if (Array.isArray(v)) return v.map(pulisci).filter((x) => !vuoto(x))
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      const p = pulisci(x)
      if (!vuoto(p)) out[k] = p
    }
    return out
  }
  return v
}

function vuoto(v: unknown): boolean {
  if (v === null || v === undefined || v === '') return true
  if (Array.isArray(v)) return v.length === 0
  if (typeof v === 'object') return Object.keys(v as object).length === 0
  return false
}

/** Taglia un testo troppo lungo segnalandolo al modello. */
export function tronca(testo: string, max: number): string {
  if (testo.length <= max) return testo
  return `${testo.slice(0, max)}\n… [risultato troncato: ${testo.length - max} caratteri omessi, restringi la richiesta]`
}
