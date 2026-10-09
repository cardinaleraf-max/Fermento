/**
 * Calcoli puri del modulo agricolo (niente database, niente Electron):
 * testabili con il runner node standard.
 */

/** Stagione agraria/maltaria "AAAA/AAAA+1" che parte a luglio (dopo la raccolta). */
export function stagioneDaData(iso: string): string {
  const anno = Number(iso.slice(0, 4))
  const mese = Number(iso.slice(5, 7))
  const inizio = mese >= 7 ? anno : anno - 1
  return `${inizio}/${inizio + 1}`
}

/** Data locale di oggi in formato AAAA-MM-GG (non UTC, per evitare lo scarto di mezzanotte). */
export function oggiIso(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const gg = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${gg}`
}
