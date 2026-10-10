import { useSyncExternalStore } from 'react'

export type Tema = 'scuro' | 'chiaro'

/** Chiave in localStorage: la scelta vale per questo computer, già dalla schermata di accesso. */
export const CHIAVE_TEMA = 'fermento.tema'

const CLASSE_CHIARO = 'tema-chiaro'
const EVENTO_TEMA = 'fermento:tema'

type Archivio = Pick<Storage, 'getItem' | 'setItem'>

/** Tema salvato; se manca, è sconosciuto o non si riesce a leggere: il tema scuro di sempre. */
export function leggiTema(archivio: Archivio | null): Tema {
  try {
    return archivio?.getItem(CHIAVE_TEMA) === 'chiaro' ? 'chiaro' : 'scuro'
  } catch {
    return 'scuro'
  }
}

export function salvaTema(archivio: Archivio | null, tema: Tema): void {
  try {
    archivio?.setItem(CHIAVE_TEMA, tema)
  } catch {
    // se non si può salvare il tema vale solo fino alla chiusura
  }
}

function archivioLocale(): Archivio | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function applica(tema: Tema): void {
  document.documentElement.classList.toggle(CLASSE_CHIARO, tema === 'chiaro')
}

/** Da chiamare prima del primo disegno (main.tsx), così l'app si apre già col tema giusto. */
export function applicaTemaSalvato(): void {
  applica(leggiTema(archivioLocale()))
}

export function impostaTema(tema: Tema): void {
  salvaTema(archivioLocale(), tema)
  applica(tema)
  window.dispatchEvent(new Event(EVENTO_TEMA))
}

function iscrivi(avvisa: () => void): () => void {
  window.addEventListener(EVENTO_TEMA, avvisa)
  return () => window.removeEventListener(EVENTO_TEMA, avvisa)
}

function temaCorrente(): Tema {
  return document.documentElement.classList.contains(CLASSE_CHIARO) ? 'chiaro' : 'scuro'
}

export function useTema(): Tema {
  return useSyncExternalStore(iscrivi, temaCorrente)
}

/**
 * Testo "in trasparenza" per gli stili inline, uguale alla classe text-ink/…:
 * nel tema scuro è bianco con l'opacità indicata, nel chiaro quasi nero con opacità rinforzata.
 */
export function inkTesto(alfa: number): string {
  return `rgb(var(--ink) / calc(var(--ink-a0-testo) + var(--ink-k-testo) * ${alfa}))`
}

/** Bordo "in trasparenza" per gli stili inline, uguale alla classe border-ink/…. */
export function inkBordo(alfa: number): string {
  return `rgb(var(--ink) / calc(var(--ink-k-bordo) * ${alfa}))`
}
