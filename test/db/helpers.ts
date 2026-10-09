import type BetterSqlite3 from 'better-sqlite3'
import { applicaSchema } from '../../src/main/database'

const Database = require('better-sqlite3') as typeof import('better-sqlite3')

/** DB SQLite in memoria con lo schema reale di produzione (stesso codice di initDatabase). */
export function creaDbTest(): BetterSqlite3.Database {
  const db = new Database(':memory:')
  db.pragma('foreign_keys = ON')
  applicaSchema(db)
  return db
}

export function nomiTabelle(db: BetterSqlite3.Database): string[] {
  return (
    db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`).all() as Array<{
      name: string
    }>
  ).map((r) => r.name)
}

export function colonne(db: BetterSqlite3.Database, tabella: string): string[] {
  return (db.prepare(`PRAGMA table_info(${tabella})`).all() as Array<{ name: string }>).map(
    (r) => r.name
  )
}
