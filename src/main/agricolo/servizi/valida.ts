import { dataIsoValida, stagioneValida } from '../calcoli'
import { ErroreUtente } from '../errori'

/** Validazioni comuni dei dati in arrivo dalla finestra (i tipi TS non bastano a runtime). */

export function testoObbligatorio(v: unknown, campo: string): string {
  const s = typeof v === 'string' ? v.trim() : ''
  if (!s) throw new ErroreUtente(`${campo}: campo obbligatorio.`)
  return s
}

export function testoOpzionale(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : ''
  return s ? s : null
}

export function numeroOpzionale(v: unknown, campo: string, opzioni: { min?: number } = {}): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) throw new ErroreUtente(`${campo}: numero non valido.`)
  if (opzioni.min !== undefined && n < opzioni.min) {
    throw new ErroreUtente(`${campo}: non può essere minore di ${opzioni.min}.`)
  }
  return n
}

export function numeroPositivo(v: unknown, campo: string): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n) || n <= 0) throw new ErroreUtente(`${campo}: inserisci una quantità maggiore di zero.`)
  return n
}

export function dataObbligatoria(v: unknown, campo: string): string {
  if (typeof v !== 'string' || !dataIsoValida(v)) throw new ErroreUtente(`${campo}: data non valida.`)
  return v
}

export function dataOpzionale(v: unknown, campo: string): string | null {
  if (v === null || v === undefined || v === '') return null
  return dataObbligatoria(v, campo)
}

export function stagioneObbligatoria(v: unknown): string {
  const s = typeof v === 'string' ? v.trim() : ''
  if (!stagioneValida(s)) {
    throw new ErroreUtente('Stagione non valida: usa il formato "2026/2027" (anno di inizio e anno successivo).')
  }
  return s
}

export function idObbligatorio(v: unknown, campo: string): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isInteger(n) || n <= 0) throw new ErroreUtente(`${campo}: selezione mancante.`)
  return n
}
