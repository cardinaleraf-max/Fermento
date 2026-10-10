/**
 * Verifica che la migrazione dello schema (modulo agricolo compreso) non
 * modifichi NESSUN dato esistente. Lavora su una copia temporanea: il file
 * indicato non viene mai scritto.
 *
 * Uso: npm run verifica-migrazione -- "/percorso/fermento.db"
 *
 * Controlli: per ogni tabella preesistente, impronta (SHA-256) di tutte le
 * righe originali sulle colonne originali, prima e dopo due migrazioni
 * consecutive; conteggi; integrità del file; chiavi esterne; lotti esistenti
 * marcati come "acquisto"; presenza delle tabelle nuove.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type BetterSqlite3 from 'better-sqlite3'
import { applicaSchema } from '../src/main/database'

const Database = require('better-sqlite3') as typeof import('better-sqlite3')
type Db = BetterSqlite3.Database

const origine = process.argv[2]
if (!origine || !fs.existsSync(origine)) {
  console.log('Indica un database esistente: npm run verifica-migrazione -- "/percorso/fermento.db"')
  process.exit(1)
}

const cartella = fs.mkdtempSync(path.join(os.tmpdir(), 'fermento-verifica-'))
const copia = path.join(cartella, 'copia.db')
fs.copyFileSync(origine, copia)
const hashOriginale = createHash('sha256').update(fs.readFileSync(origine)).digest('hex')

type Fotografia = Map<string, { colonne: string[]; righe: number; maxRowid: number; impronta: string }>

/**
 * Colonne escluse dal confronto, con il motivo. configurazioni.aggiornato_il
 * viene già aggiornata a ogni avvio da migrazioneRetrocompatibilita (codice
 * esistente prima del modulo agricolo: tocca la data di 'onboarding_completato',
 * mai i valori). I valori di tutte le configurazioni restano confrontati.
 */
const ESCLUSE: Record<string, string[]> = { configurazioni: ['aggiornato_il'] }

function tabelle(db: Db): string[] {
  return (
    db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
      .all() as Array<{ name: string }>
  ).map((r) => r.name)
}

function colonne(db: Db, tabella: string): string[] {
  return (db.prepare(`PRAGMA table_info("${tabella}")`).all() as Array<{ name: string }>).map((c) => c.name)
}

function colonneConfrontate(db: Db, tabella: string): string[] {
  return colonne(db, tabella).filter((c) => !(ESCLUSE[tabella] ?? []).includes(c))
}

/** Impronta delle righe con rowid <= maxRowid, solo sulle colonne indicate. */
function impronta(db: Db, tabella: string, cols: string[], maxRowid: number): { righe: number; impronta: string } {
  const h = createHash('sha256')
  const elenco = cols.map((c) => `"${c}"`).join(', ')
  const righe = db
    .prepare(`SELECT rowid AS __r, ${elenco} FROM "${tabella}" WHERE rowid <= ? ORDER BY rowid`)
    .all(maxRowid) as Array<Record<string, unknown>>
  for (const r of righe) {
    h.update(JSON.stringify(cols.map((c) => (Buffer.isBuffer(r[c]) ? (r[c] as Buffer).toString('hex') : r[c]))))
    h.update('\n')
  }
  return { righe: righe.length, impronta: h.digest('hex') }
}

function fotografa(db: Db): Fotografia {
  const f: Fotografia = new Map()
  for (const t of tabelle(db)) {
    const cols = colonneConfrontate(db, t)
    const max = (db.prepare(`SELECT COALESCE(MAX(rowid), 0) AS m FROM "${t}"`).get() as { m: number }).m
    const { righe, impronta: imp } = impronta(db, t, cols, max)
    f.set(t, { colonne: cols, righe, maxRowid: max, impronta: imp })
  }
  return f
}

const problemi: string[] = []
console.log('Escluse dal confronto: configurazioni.aggiornato_il (la data viene già aggiornata a ogni avvio dal codice esistente).')
const db: Db = new Database(copia)
db.pragma('foreign_keys = ON')

const prima = fotografa(db)
console.log(`Database: ${origine}`)
console.log(`Tabelle esistenti: ${prima.size}, righe totali: ${[...prima.values()].reduce((s, t) => s + t.righe, 0)}`)

applicaSchema(db)
applicaSchema(db)

for (const [t, p] of prima) {
  const colsDopo = colonneConfrontate(db, t)
  const mancanti = p.colonne.filter((c) => !colsDopo.includes(c))
  if (mancanti.length > 0) problemi.push(`${t}: colonne sparite ${mancanti.join(', ')}`)
  const dopo = impronta(db, t, p.colonne, p.maxRowid)
  if (dopo.righe !== p.righe) problemi.push(`${t}: righe esistenti ${p.righe} → ${dopo.righe}`)
  if (dopo.impronta !== p.impronta) problemi.push(`${t}: i dati esistenti risultano modificati`)
  const totaleDopo = (db.prepare(`SELECT COUNT(*) AS c FROM "${t}"`).get() as { c: number }).c
  const nuove = totaleDopo - p.righe
  const colonneNuove = colsDopo.filter((c) => !p.colonne.includes(c))
  if (nuove > 0 || colonneNuove.length > 0) {
    console.log(
      `  ${t}: ${nuove > 0 ? `+${nuove} righe nuove` : ''}${nuove > 0 && colonneNuove.length > 0 ? ', ' : ''}${colonneNuove.length > 0 ? `colonne aggiunte: ${colonneNuove.join(', ')}` : ''}`
    )
  }
  if (nuove > 0 && t !== 'configurazioni') problemi.push(`${t}: aggiunte ${nuove} righe inattese`)
}

const tabelleNuove = tabelle(db).filter((t) => !prima.has(t))
console.log(`Tabelle aggiunte (${tabelleNuove.length}): ${tabelleNuove.join(', ')}`)
for (const attesa of ['agri_campi', 'agri_lavorazioni', 'agri_parametri', 'confezionamento_lotti_imballi']) {
  if (!tabelleNuove.includes(attesa) && !prima.has(attesa)) problemi.push(`manca la tabella ${attesa}`)
}

const nonAcquisto = (
  db.prepare(`SELECT COUNT(*) AS c FROM lotti_materie_prime WHERE rowid <= ? AND origine_tipo <> 'acquisto'`).get(
    prima.get('lotti_materie_prime')?.maxRowid ?? 0
  ) as { c: number }
).c
if (nonAcquisto > 0 && !prima.get('lotti_materie_prime')?.colonne.includes('origine_tipo')) {
  problemi.push(`${nonAcquisto} lotti esistenti non risultano "acquisto"`)
}

const integrita = db.pragma('integrity_check', { simple: true })
if (integrita !== 'ok') problemi.push(`integrità del file: ${String(integrita)}`)
const fk = db.pragma('foreign_key_check') as unknown[]
if (fk.length > 0) problemi.push(`${fk.length} riferimenti (chiavi esterne) non validi`)
const modulo = db.prepare(`SELECT valore FROM configurazioni WHERE chiave = 'modulo_agricolo_attivo'`).get() as
  | { valore: string }
  | undefined
console.log(`Modulo agricolo: ${modulo?.valore === '1' ? 'ATTIVO' : 'spento'}`)
db.close()

if (createHash('sha256').update(fs.readFileSync(origine)).digest('hex') !== hashOriginale) {
  problemi.push('ATTENZIONE: il file originale risulta cambiato durante la verifica')
}
fs.rmSync(cartella, { recursive: true, force: true })

if (problemi.length === 0) {
  console.log('\nESITO: OK — nessun dato esistente è stato modificato; integrità e collegamenti corretti.')
  process.exit(0)
}
console.log('\nESITO: PROBLEMI TROVATI')
for (const p of problemi) console.log(` - ${p}`)
process.exit(1)
