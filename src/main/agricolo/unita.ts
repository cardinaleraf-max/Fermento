/** Conversioni di unità di misura. Le rese si calcolano sempre in kg. */

/** Tolleranza per i confronti tra quantità decimali. */
export const EPS = 1e-9

/** Arrotonda eliminando il rumore dei decimali (es. 300 × 0,69 = 206,99999…). */
export function arrotonda(n: number, decimali = 3): number {
  const f = 10 ** decimali
  return Math.round((n + Number.EPSILON) * f) / f
}

const FATTORI_KG: Record<string, number> = { kg: 1, q: 100, g: 0.001 }

/** Quanti kg vale 1 unità; null se l'unità non è un peso (es. litri). */
export function fattoreKg(unita: string): number | null {
  return FATTORI_KG[unita] ?? null
}

export function aKg(quantita: number, unita: string): number | null {
  const f = fattoreKg(unita)
  return f === null ? null : arrotonda(quantita * f, 6)
}

export function daKg(kg: number, unita: string): number | null {
  const f = fattoreKg(unita)
  return f === null ? null : arrotonda(kg / f, 6)
}

/** Converte tra due unità; null se non convertibili (es. litri ↔ kg). */
export function converti(quantita: number, da: string, a: string): number | null {
  if (da === a) return quantita
  const kg = aKg(quantita, da)
  return kg === null ? null : daKg(kg, a)
}
