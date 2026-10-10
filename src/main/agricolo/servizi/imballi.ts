import type BetterSqlite3 from 'better-sqlite3'
import type { CaricoImballo, LottoImballoRiga, MaterialeImballo } from '../../../shared/agricolo'
import { ErroreUtente } from '../errori'

type Db = BetterSqlite3.Database

/**
 * Lotti dei materiali di confezionamento (HACCP) collegati alle cotte.
 * Vale per tutti i clienti, è facoltativo e non tocca le giacenze: è solo
 * informazione di tracciabilità in più.
 */

/** true se la tabella esiste (un DB ripristinato da un backup vecchio potrebbe non averla fino al riavvio). */
export function tabellaEsiste(db: Db, nome: string): boolean {
  return !!db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(nome)
}

function colonnaEsiste(db: Db, tabella: string, colonna: string): boolean {
  return (db.prepare(`PRAGMA table_info(${tabella})`).all() as Array<{ name: string }>).some((c) => c.name === colonna)
}

function carichiDi(db: Db, materialeId: number): CaricoImballo[] {
  const conLotto = colonnaEsiste(db, 'movimenti_confezionamento', 'lotto_fornitore')
  return db
    .prepare(
      `SELECT id, data, quantita, ${conLotto ? 'lotto_fornitore, fornitore' : 'NULL AS lotto_fornitore, NULL AS fornitore'}, note
       FROM movimenti_confezionamento
       WHERE materiale_id = ? AND tipo_movimento = 'carico'
       ORDER BY data DESC, id DESC LIMIT 20`
    )
    .all(materialeId) as CaricoImballo[]
}

/**
 * Materiali di cui proporre i lotti al confezionamento di una cotta: bottiglia
 * e tappo scelti come fa il confezionamento (primo attivo della categoria), i
 * fusti indicati, più quelli già collegati alla cotta.
 */
export function materialiImballoConfezionamento(
  db: Db,
  cottaId: number,
  opzioni: { bottiglie: boolean; fusti: number[] }
): MaterialeImballo[] {
  const ids: number[] = []
  const aggiungi = (id: number | undefined): void => {
    if (id !== undefined && !ids.includes(id)) ids.push(id)
  }
  if (opzioni.bottiglie) {
    for (const categoria of ['bottiglia', 'tappo']) {
      const m = db
        .prepare(`SELECT id FROM materiali_confezionamento WHERE categoria = ? AND attivo = 1 LIMIT 1`)
        .get(categoria) as { id: number } | undefined
      aggiungi(m?.id)
    }
  }
  for (const f of opzioni.fusti ?? []) aggiungi(Number(f))
  if (tabellaEsiste(db, 'confezionamento_lotti_imballi')) {
    const gia = db
      .prepare(`SELECT DISTINCT materiale_id FROM confezionamento_lotti_imballi WHERE cotta_id = ?`)
      .all(cottaId) as Array<{ materiale_id: number }>
    for (const g of gia) aggiungi(g.materiale_id)
  }
  const leggi = db.prepare(`SELECT id, nome, categoria FROM materiali_confezionamento WHERE id = ?`)
  return ids
    .map((id) => leggi.get(id) as { id: number; nome: string; categoria: string } | undefined)
    .filter((m): m is { id: number; nome: string; categoria: string } => m !== undefined)
    .map((m) => ({ materiale_id: m.id, nome: m.nome, categoria: m.categoria, carichi: carichiDi(db, m.id) }))
}

export function lottiImballiCotta(db: Db, cottaId: number): LottoImballoRiga[] {
  if (!tabellaEsiste(db, 'confezionamento_lotti_imballi')) return []
  const conLotto = colonnaEsiste(db, 'movimenti_confezionamento', 'lotto_fornitore')
  return db
    .prepare(
      `SELECT li.movimento_id, li.materiale_id, mc.nome AS materiale_nome, mc.categoria, mov.data, mov.quantita,
              ${conLotto ? 'mov.lotto_fornitore, mov.fornitore' : 'NULL AS lotto_fornitore, NULL AS fornitore'}
       FROM confezionamento_lotti_imballi li
       JOIN materiali_confezionamento mc ON mc.id = li.materiale_id
       JOIN movimenti_confezionamento mov ON mov.id = li.movimento_id
       WHERE li.cotta_id = ?
       ORDER BY CASE mc.categoria WHEN 'bottiglia' THEN 0 WHEN 'tappo' THEN 1 WHEN 'fusto' THEN 2 ELSE 3 END, mc.nome, mov.data`
    )
    .all(cottaId) as LottoImballoRiga[]
}

/** Inserisce i collegamenti (senza transazione propria: va chiamata dentro una). */
export function inserisciLottiImballi(db: Db, cottaId: number, movimentoIds: number[]): void {
  const leggi = db.prepare(`SELECT id, materiale_id, tipo_movimento FROM movimenti_confezionamento WHERE id = ?`)
  const ins = db.prepare(
    `INSERT OR IGNORE INTO confezionamento_lotti_imballi (cotta_id, materiale_id, movimento_id) VALUES (?, ?, ?)`
  )
  for (const id of [...new Set(movimentoIds.map(Number))]) {
    const m = leggi.get(id) as { id: number; materiale_id: number; tipo_movimento: string } | undefined
    if (!m) throw new ErroreUtente('Lotto di imballo non trovato.')
    if (m.tipo_movimento !== 'carico') throw new ErroreUtente('Si possono indicare solo i carichi (lotti ricevuti).')
    ins.run(cottaId, m.materiale_id, m.id)
  }
}

/** Sostituisce l'insieme dei lotti imballi collegati a una cotta. */
export function salvaLottiImballi(db: Db, cottaId: number, movimentoIds: number[]): void {
  if (!db.prepare(`SELECT id FROM cotte WHERE id = ?`).get(cottaId)) throw new ErroreUtente('Cotta non trovata.')
  db.transaction(() => {
    db.prepare(`DELETE FROM confezionamento_lotti_imballi WHERE cotta_id = ?`).run(cottaId)
    inserisciLottiImballi(db, cottaId, Array.isArray(movimentoIds) ? movimentoIds : [])
  })()
}

/** Cotte a cui è collegato un carico (per bloccarne l'eliminazione), o null. */
export function collegamentiMovimento(db: Db, movimentoId: number): string | null {
  if (!tabellaEsiste(db, 'confezionamento_lotti_imballi')) return null
  const cotte = db
    .prepare(
      `SELECT c.numero_lotto FROM confezionamento_lotti_imballi li JOIN cotte c ON c.id = li.cotta_id
       WHERE li.movimento_id = ? ORDER BY c.numero_lotto`
    )
    .all(movimentoId) as Array<{ numero_lotto: string }>
  return cotte.length > 0 ? cotte.map((c) => c.numero_lotto).join(', ') : null
}
