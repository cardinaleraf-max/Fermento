import type BetterSqlite3 from 'better-sqlite3'
import type { ConsumoLotto } from '../../../shared/agricolo'

type Db = BetterSqlite3.Database

/** Lotti di magazzino scaricati da una semina o da un'operazione di campo. */
export function consumiDi(db: Db, rifTipo: 'semina' | 'operazione', rifId: number): ConsumoLotto[] {
  return db
    .prepare(
      `SELECT c.lotto_id, COALESCE(l.lotto_fornitore, '') AS lotto_codice, c.materia_prima_id,
              mp.nome AS materia_prima_nome, mp.unita_misura, c.quantita
       FROM agri_consumi c
       JOIN lotti_materie_prime l ON l.id = c.lotto_id
       JOIN materie_prime mp ON mp.id = c.materia_prima_id
       WHERE c.rif_tipo = ? AND c.rif_id = ?
       ORDER BY c.id`
    )
    .all(rifTipo, rifId) as ConsumoLotto[]
}
