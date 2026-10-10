import type BetterSqlite3 from 'better-sqlite3'

type Db = BetterSqlite3.Database

/** Crea una materia prima e ritorna l'id. */
export function materia(
  db: Db,
  nome: string,
  categoria: string,
  unita: string,
  extra: { carenza?: number } = {}
): number {
  return Number(
    db
      .prepare(
        `INSERT INTO materie_prime (nome, categoria, unita_misura, tempo_carenza_giorni) VALUES (?, ?, ?, ?)`
      )
      .run(nome, categoria, unita, extra.carenza ?? null).lastInsertRowid
  )
}

/** Carica un lotto "acquistato" e ritorna l'id. */
export function lotto(
  db: Db,
  materiaPrimaId: number,
  codice: string,
  quantita: number,
  scadenza: string | null = null,
  dataCarico = '2026-01-10'
): number {
  return Number(
    db
      .prepare(
        `INSERT INTO lotti_materie_prime (materia_prima_id, lotto_fornitore, data_carico, data_scadenza, quantita_iniziale, quantita_residua)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(materiaPrimaId, codice, dataCarico, scadenza, quantita, quantita).lastInsertRowid
  )
}

export function residuo(db: Db, lottoId: number): number {
  return (
    db
      .prepare(`SELECT quantita_residua AS r FROM lotti_materie_prime WHERE id = ?`)
      .get(lottoId) as { r: number }
  ).r
}

export function conta(db: Db, tabella: string): number {
  return (db.prepare(`SELECT COUNT(*) AS c FROM ${tabella}`).get() as { c: number }).c
}
