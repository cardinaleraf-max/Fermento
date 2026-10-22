/**
 * Privacy di Bira: i dati dei clienti non escono mai dal PC.
 *
 * - Le PERSONE e i SOGGETTI (clienti, fornitori, titolare, operatori agricoli)
 *   arrivano al modello solo come codici (CLIENTE-12, FORNITORE-3, …) e
 *   tornano col nome vero solo sul PC, prima di arrivare allo schermo.
 * - I CONTATTI e le note libere (email, telefoni, P.IVA, indirizzi, note di
 *   clienti/vendite/fusti, contatti dei fornitori, riferimenti catastali,
 *   chiave Groq, percorso dei backup) non devono comparire mai.
 * - La GUARDIA controlla ogni pacchetto prima dell'invio: se trova uno di
 *   questi dati la richiesta non parte.
 *
 * Il registro si ricrea a ogni domanda: rispecchia sempre il database.
 */
import type BetterSqlite3 from 'better-sqlite3'

type Db = BetterSqlite3.Database

export type RegistroSoggetti = {
  voci: Array<{ reale: string; codice: string }>
  vietati: string[]
  /** Regex costruite una volta: nomi reali → codice e codice → nome reale. */
  cercaReali: RegExp | null
  perReale: Map<string, string>
  perCodice: Map<string, string>
}

export class ErrorePrivacy extends Error {
  constructor(readonly categoria: string) {
    super(
      'Per proteggere i dati dei tuoi clienti Bira non ha inviato la domanda. Riformulala senza contatti o dati personali.'
    )
    this.name = 'ErrorePrivacy'
  }
}

const MIN_NOME = 3
const MIN_CONTATTO = 6
const MIN_NOTA = 12

const CONFINE_PRIMA = '(?<![\\p{L}\\p{N}])'
const CONFINE_DOPO = '(?![\\p{L}\\p{N}])'
const CODICE = /\b(CLIENTE|FORNITORE|OPERATORE|TITOLARE)[-_](T?\d+)\b/gi

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const pulisci = (s: unknown): string => (typeof s === 'string' ? s.trim().replace(/\s+/g, ' ') : '')

function righe<T>(db: Db, sql: string): T[] {
  try {
    return db.prepare(sql).all() as T[]
  } catch {
    // tabella o colonna assente (DB vecchio o modulo mai attivato)
    return []
  }
}

export function creaRegistroSoggetti(db: Db): RegistroSoggetti {
  const voci: Array<{ reale: string; codice: string }> = []
  const vietati: string[] = []
  const giaVisti = new Set<string>()
  const aggiungi = (reale: unknown, codice: string): void => {
    const r = pulisci(reale)
    if (r.length < MIN_NOME || giaVisti.has(r.toLowerCase())) return
    giaVisti.add(r.toLowerCase())
    voci.push({ reale: r, codice })
  }
  const vieta = (v: unknown, min: number): void => {
    const s = pulisci(v)
    if (s.length >= min) vietati.push(s)
  }

  for (const c of righe<Record<string, unknown>>(
    db,
    `SELECT id, nome, partita_iva, indirizzo, telefono, email, note FROM clienti`
  )) {
    aggiungi(c.nome, `CLIENTE-${c.id}`)
    vieta(c.email, MIN_CONTATTO)
    vieta(c.telefono, MIN_CONTATTO)
    vieta(c.partita_iva, MIN_CONTATTO)
    vieta(c.indirizzo, MIN_CONTATTO)
    vieta(c.note, MIN_NOTA)
  }
  for (const f of righe<Record<string, unknown>>(
    db,
    `SELECT id, nome, contatto, note FROM fornitori`
  )) {
    aggiungi(f.nome, `FORNITORE-${f.id}`)
    vieta(f.contatto, MIN_CONTATTO)
    vieta(f.note, MIN_NOTA)
  }
  for (const u of righe<{ nome: string }>(db, `SELECT nome FROM utente`))
    aggiungi(u.nome, 'TITOLARE-1')
  for (const t of righe<{ valore: string }>(
    db,
    `SELECT valore FROM configurazioni WHERE chiave = 'nome_titolare'`
  ))
    aggiungi(t.valore, 'TITOLARE-1')
  righe<{ operatore: string }>(
    db,
    `SELECT DISTINCT operatore FROM agri_operazioni WHERE TRIM(COALESCE(operatore, '')) <> '' ORDER BY operatore`
  ).forEach((o, i) => aggiungi(o.operatore, `OPERATORE-${i + 1}`))
  righe<{ fornitore: string }>(
    db,
    `SELECT DISTINCT fornitore FROM movimenti_confezionamento WHERE TRIM(COALESCE(fornitore, '')) <> '' ORDER BY fornitore`
  ).forEach((f, i) => aggiungi(f.fornitore, `FORNITORE-T${i + 1}`))

  for (const v of righe<{ note: string }>(db, `SELECT note FROM vendite`)) vieta(v.note, MIN_NOTA)
  for (const v of righe<{ note: string }>(db, `SELECT note FROM movimenti_fusti_rendere`))
    vieta(v.note, MIN_NOTA)
  for (const c of righe<{ rif_catastale: string }>(db, `SELECT rif_catastale FROM agri_campi`))
    vieta(c.rif_catastale, MIN_CONTATTO)
  for (const c of righe<{ valore: string }>(
    db,
    `SELECT valore FROM configurazioni WHERE chiave LIKE 'ai\\_%' ESCAPE '\\' OR chiave IN ('backup_percorso')`
  ))
    vieta(c.valore, 8)
  for (const l of righe<{ stringa: string }>(db, `SELECT stringa FROM licenza`)) vieta(l.stringa, 8)

  voci.sort((a, b) => b.reale.length - a.reale.length)
  const cercaReali =
    voci.length > 0
      ? new RegExp(
          `${CONFINE_PRIMA}(?:${voci.map((v) => escapeRegex(v.reale).replace(/ /g, '\\s+')).join('|')})${CONFINE_DOPO}`,
          'giu'
        )
      : null
  return {
    voci,
    vietati,
    cercaReali,
    perReale: new Map(voci.map((v) => [v.reale.toLowerCase().replace(/\s+/g, ' '), v.codice])),
    perCodice: new Map(voci.map((v) => [v.codice.toUpperCase(), v.reale]))
  }
}

export function pseudonimizza(reg: RegistroSoggetti, testo: string): string {
  if (!reg.cercaReali || !testo) return testo
  return testo.replace(
    reg.cercaReali,
    (m) => reg.perReale.get(m.toLowerCase().replace(/\s+/g, ' ')) ?? m
  )
}

export function ripristina(reg: RegistroSoggetti, testo: string): string {
  if (!testo) return testo
  return testo.replace(CODICE, (m, tipo: string, num: string) => {
    return reg.perCodice.get(`${tipo.toUpperCase()}-${num.toUpperCase()}`) ?? m
  })
}

function mappaStringhe<T>(v: T, f: (s: string) => string): T {
  if (typeof v === 'string') return f(v) as T
  if (Array.isArray(v)) return v.map((x) => mappaStringhe(x, f)) as T
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = mappaStringhe(x, f)
    return out as T
  }
  return v
}

export function pseudonimizzaValori<T>(reg: RegistroSoggetti, v: T): T {
  return mappaStringhe(v, (s) => pseudonimizza(reg, s))
}

export function ripristinaValori<T>(reg: RegistroSoggetti, v: T): T {
  return mappaStringhe(v, (s) => ripristina(reg, s))
}

/** Varianti con cui un telefono può comparire (solo cifre, senza prefisso). */
function varianti(v: string): string[] {
  const out = [v, JSON.stringify(v).slice(1, -1)]
  const cifre = v.replace(/\D/g, '')
  if (cifre.length >= MIN_CONTATTO && cifre.length >= v.replace(/\s/g, '').length - 2) {
    out.push(cifre)
    const senzaPrefisso = cifre.replace(/^(0039|39)(?=\d{9,})/, '')
    if (senzaPrefisso !== cifre) out.push(senzaPrefisso)
  }
  return out
}

/** Lancia ErrorePrivacy se nel pacchetto in uscita c'è un dato che non deve uscire. */
export function guardia(reg: RegistroSoggetti, payload: string): void {
  if (reg.cercaReali) {
    reg.cercaReali.lastIndex = 0
    const trovato = reg.cercaReali.test(payload)
    reg.cercaReali.lastIndex = 0
    if (trovato) throw new ErrorePrivacy('nome')
  }
  const minuscolo = payload.toLowerCase()
  for (const v of reg.vietati) {
    for (const variante of varianti(v)) {
      if (variante && minuscolo.includes(variante.toLowerCase()))
        throw new ErrorePrivacy('contatto')
    }
  }
}
