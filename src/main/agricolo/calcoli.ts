/**
 * Calcoli puri del modulo agricolo (niente database, niente Electron):
 * testabili con il runner node standard.
 */
import { arrotonda } from './unita'

// ── Stagioni e date ──────────────────────────────────────────────────────────

export { stagioneDaData, stagioneValida } from '../../shared/agricolo'

/** Data locale di oggi in formato AAAA-MM-GG (non UTC, per evitare lo scarto di mezzanotte). */
export function oggiIso(): string {
  const d = new Date()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const gg = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${gg}`
}

export function dataIsoValida(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [a, m, g] = s.split('-').map(Number)
  const d = new Date(Date.UTC(a, m - 1, g))
  return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === g
}

function formattaUtc(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function aggiungiGiorni(iso: string, giorni: number): string {
  const [a, m, g] = iso.split('-').map(Number)
  return formattaUtc(new Date(Date.UTC(a, m - 1, g + giorni)))
}

/** Aggiunge mesi restando nell'ultimo giorno valido (31 gennaio + 1 mese = 28/29 febbraio). */
export function aggiungiMesi(iso: string, mesi: number): string {
  const [a, m, g] = iso.split('-').map(Number)
  const ultimoGiorno = new Date(Date.UTC(a, m - 1 + mesi + 1, 0)).getUTCDate()
  return formattaUtc(new Date(Date.UTC(a, m - 1 + mesi, Math.min(g, ultimoGiorno))))
}

// ── Calibratura ──────────────────────────────────────────────────────────────

export type FrazioneInput = {
  nome: string
  percentuale: number
  scarto: boolean
  peso_specifico_gl: number | null
}

export type FrazioneCalcolata = FrazioneInput & { quantita: number }

export type EsitoFrazioni = {
  righe: FrazioneCalcolata[]
  somma_percentuali: number
  /** Parte del lotto non attribuita a nessuna frazione (es. 99% → 1%). */
  calo_percentuale: number
  calo_quantita: number
  quantita_utile: number
  quantita_scarto: number
}

export function calcolaFrazioni(
  quantitaLavorata: number,
  frazioni: FrazioneInput[]
): EsitoFrazioni {
  const righe = frazioni.map((f) => ({
    ...f,
    quantita: arrotonda((quantitaLavorata * f.percentuale) / 100)
  }))
  const somma = arrotonda(
    frazioni.reduce((s, f) => s + f.percentuale, 0),
    4
  )
  const totaleRighe = righe.reduce((s, r) => s + r.quantita, 0)
  return {
    righe,
    somma_percentuali: somma,
    calo_percentuale: Math.max(0, arrotonda(100 - somma, 4)),
    calo_quantita: Math.max(0, arrotonda(quantitaLavorata - totaleRighe)),
    quantita_utile: arrotonda(righe.filter((r) => !r.scarto).reduce((s, r) => s + r.quantita, 0)),
    quantita_scarto: arrotonda(righe.filter((r) => r.scarto).reduce((s, r) => s + r.quantita, 0))
  }
}

/** Errori leggibili sulle frazioni; lista vuota = tutto ok. */
export function erroriFrazioni(frazioni: FrazioneInput[]): string[] {
  const errori: string[] = []
  if (frazioni.length === 0) {
    return ['Inserisci almeno una frazione di calibratura.']
  }
  const visti = new Set<string>()
  for (const f of frazioni) {
    const nome = f.nome.trim()
    if (!nome) {
      errori.push('Ogni frazione deve avere un nome (il calibro, es. "2,5-2,8 mm").')
      continue
    }
    const chiave = nome.toLowerCase()
    if (visti.has(chiave)) errori.push(`La frazione "${nome}" è ripetuta.`)
    visti.add(chiave)
    if (!Number.isFinite(f.percentuale) || f.percentuale < 0 || f.percentuale > 100) {
      errori.push(`Percentuale non valida per la frazione "${nome}".`)
    }
    if (
      f.peso_specifico_gl !== null &&
      (!Number.isFinite(f.peso_specifico_gl) || f.peso_specifico_gl < 0)
    ) {
      errori.push(`Peso specifico non valido per la frazione "${nome}".`)
    }
  }
  const somma = arrotonda(
    frazioni.reduce((s, f) => s + (Number.isFinite(f.percentuale) ? f.percentuale : 0), 0),
    4
  )
  if (somma > 100 + 1e-6) {
    errori.push(
      `Le percentuali sommano ${somma.toLocaleString('it-IT')}%: non possono superare il 100%.`
    )
  }
  if (!frazioni.some((f) => !f.scarto && f.percentuale > 0)) {
    errori.push('Serve almeno una frazione non di scarto con una percentuale maggiore di zero.')
  }
  return errori
}

// ── Campo ────────────────────────────────────────────────────────────────────

export function doseEttaro(quantita: number | null, superficieHa: number | null): number | null {
  if (quantita === null || superficieHa === null || !(superficieHa > 0)) return null
  return arrotonda(quantita / superficieHa)
}

export type TrattamentoCarenza = { data: string; giorni: number; prodotto: string }
export type ViolazioneCarenza = TrattamentoCarenza & { fine_carenza: string }

/**
 * Trattamenti il cui tempo di carenza non era finito alla data di raccolta.
 * Un trattamento fatto dopo la raccolta non conta.
 */
export function violazioniCarenza(
  dataRaccolta: string,
  trattamenti: TrattamentoCarenza[]
): ViolazioneCarenza[] {
  return trattamenti
    .filter((t) => t.giorni > 0 && t.data <= dataRaccolta)
    .map((t) => ({ ...t, fine_carenza: aggiungiGiorni(t.data, t.giorni) }))
    .filter((t) => dataRaccolta < t.fine_carenza)
    .sort((a, b) => (a.fine_carenza < b.fine_carenza ? 1 : -1))
}

// ── Rese ─────────────────────────────────────────────────────────────────────

export type InputResa = {
  /** kg di orzo calibrato usati dalla maltazione */
  kg: number
  /** kg utili (non scarto) / kg grezzo lavorati nella calibratura d'origine; null se ignota */
  quota_utile: number | null
  /** kg scarto / kg grezzo lavorati nella calibratura d'origine; null se ignota */
  quota_scarto: number | null
}

export type EsitoRese = {
  resa_maltazione: number | null
  resa_complessiva: number | null
  kg_grezzo_equivalenti: number | null
  perc_scarto_calibratura: number | null
  /** true se almeno un lotto non viene da una calibratura registrata */
  parziale: boolean
}

export function calcolaRese(
  pesoInizialeKg: number,
  pesoFinaleKg: number | null,
  input: InputResa[]
): EsitoRese {
  let equivalenti = 0
  let equivalentiConScarto = 0
  let scartoPesato = 0
  let parziale = false
  for (const i of input) {
    const eq = i.quota_utile !== null && i.quota_utile > 0 ? i.kg / i.quota_utile : i.kg
    if (i.quota_utile === null || !(i.quota_utile > 0)) parziale = true
    equivalenti += eq
    if (i.quota_scarto !== null) {
      equivalentiConScarto += eq
      scartoPesato += eq * i.quota_scarto
    }
  }
  const haFinale = pesoFinaleKg !== null && pesoFinaleKg > 0
  return {
    resa_maltazione:
      haFinale && pesoInizialeKg > 0 ? arrotonda(pesoFinaleKg / pesoInizialeKg, 6) : null,
    resa_complessiva: haFinale && equivalenti > 0 ? arrotonda(pesoFinaleKg / equivalenti, 6) : null,
    kg_grezzo_equivalenti: input.length > 0 ? arrotonda(equivalenti) : null,
    perc_scarto_calibratura:
      equivalentiConScarto > 0 ? arrotonda(scartoPesato / equivalentiConScarto, 6) : null,
    parziale
  }
}
