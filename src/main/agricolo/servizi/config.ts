import type BetterSqlite3 from 'better-sqlite3'
import type { FrazioneDefault, StatoModuloAgricolo } from '../../../shared/agricolo'
import { oggiIso, stagioneDaData, stagioneValida } from '../calcoli'
import { ErroreUtente } from '../errori'
import { FRAZIONI_DEFAULT_SEED } from '../schema'

type Db = BetterSqlite3.Database

export function leggiValore(db: Db, chiave: string): string | null {
  const r = db.prepare(`SELECT valore FROM configurazioni WHERE chiave = ?`).get(chiave) as
    | { valore: string | null }
    | undefined
  return r?.valore ?? null
}

export function moduloAttivo(db: Db): boolean {
  return leggiValore(db, 'modulo_agricolo_attivo') === '1'
}

export function stagioneCorrente(db: Db): string {
  const v = leggiValore(db, 'agri_stagione_corrente')
  return v && stagioneValida(v) ? v : stagioneDaData(oggiIso())
}

export function frazioniDefault(db: Db): FrazioneDefault[] {
  try {
    const parsed: unknown = JSON.parse(leggiValore(db, 'agri_frazioni_default') ?? '')
    if (Array.isArray(parsed)) {
      const lista = parsed
        .filter(
          (f): f is { nome: string; scarto: unknown } =>
            typeof f === 'object' &&
            f !== null &&
            typeof (f as { nome?: unknown }).nome === 'string'
        )
        .map((f) => ({ nome: f.nome.trim(), scarto: f.scarto === true }))
        .filter((f) => f.nome)
      if (lista.length > 0) return lista
    }
  } catch {
    // valore assente o corrotto: si torna ai predefiniti
  }
  return FRAZIONI_DEFAULT_SEED.map((f) => ({ ...f }))
}

export function shelfLifeMaltoMesi(db: Db): number {
  const n = Number(leggiValore(db, 'agri_shelf_life_malto_mesi'))
  return Number.isInteger(n) && n > 0 ? n : 12
}

/** Stagioni presenti nei dati + quella corrente, dalla più recente. */
export function elencoStagioni(db: Db): string[] {
  const righe = db
    .prepare(
      `SELECT stagione FROM agri_semine
       UNION SELECT stagione FROM agri_lavorazioni
       UNION SELECT stagione FROM lotti_materie_prime WHERE stagione IS NOT NULL`
    )
    .all() as Array<{ stagione: string }>
  const insieme = new Set(righe.map((r) => r.stagione).filter(stagioneValida))
  insieme.add(stagioneCorrente(db))
  return [...insieme].sort((a, b) => (a < b ? 1 : -1))
}

export function statoModulo(db: Db): StatoModuloAgricolo {
  return {
    attivo: moduloAttivo(db),
    stagione_corrente: stagioneCorrente(db),
    stagioni: elencoStagioni(db)
  }
}

export type ImpostazioniAgricolePayload = {
  stagione_corrente?: string
  frazioni_default?: FrazioneDefault[]
  shelf_life_malto_mesi?: number
}

/** Salva le impostazioni del modulo: valida tutto prima di scrivere (niente salvataggi a metà). */
export function salvaImpostazioniAgricole(db: Db, p: ImpostazioniAgricolePayload): void {
  const daScrivere: Array<[string, string]> = []
  if (p.stagione_corrente !== undefined) {
    const s = typeof p.stagione_corrente === 'string' ? p.stagione_corrente.trim() : ''
    if (!stagioneValida(s)) {
      throw new ErroreUtente(
        'Stagione non valida: usa il formato "2026/2027" (anno di inizio e anno successivo).'
      )
    }
    daScrivere.push(['agri_stagione_corrente', s])
  }
  if (p.frazioni_default !== undefined) {
    if (!Array.isArray(p.frazioni_default) || p.frazioni_default.length === 0) {
      throw new ErroreUtente('Serve almeno una frazione di calibratura predefinita.')
    }
    const viste = new Set<string>()
    const pulite = p.frazioni_default.map((f) => {
      const nome = typeof f.nome === 'string' ? f.nome.trim() : ''
      if (!nome) throw new ErroreUtente('Ogni frazione predefinita deve avere un nome.')
      if (viste.has(nome.toLowerCase())) throw new ErroreUtente(`La frazione "${nome}" è ripetuta.`)
      viste.add(nome.toLowerCase())
      return { nome, scarto: f.scarto === true }
    })
    daScrivere.push(['agri_frazioni_default', JSON.stringify(pulite)])
  }
  if (p.shelf_life_malto_mesi !== undefined) {
    const n = Number(p.shelf_life_malto_mesi)
    if (!Number.isInteger(n) || n < 1 || n > 120) {
      throw new ErroreUtente('Scadenza del malto: inserisci un numero intero di mesi tra 1 e 120.')
    }
    daScrivere.push(['agri_shelf_life_malto_mesi', String(n)])
  }
  const upd = db.prepare(
    `UPDATE configurazioni SET valore = ?, aggiornato_il = CURRENT_TIMESTAMP WHERE chiave = ?`
  )
  db.transaction(() => {
    for (const [chiave, valore] of daScrivere) upd.run(valore, chiave)
  })()
}
