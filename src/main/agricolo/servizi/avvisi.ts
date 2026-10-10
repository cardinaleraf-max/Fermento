import type BetterSqlite3 from 'better-sqlite3'
import { stagioneCorrente } from './config'
import { verificaCarenza } from './lavorazioni'

type Db = BetterSqlite3.Database

function dataIt(iso: string): string {
  const [a, m, g] = iso.split('-')
  return `${g}/${m}/${a}`
}

/**
 * Avvisi "tempo di carenza": raccolte della stagione corrente registrate prima
 * della fine della carenza di un trattamento sulla stessa semina. Va chiamata
 * dentro la rigenerazione degli avvisi (che parte da avvisi tutti risolti).
 */
export function generaAvvisiCarenza(db: Db): void {
  const raccolte = db
    .prepare(
      `SELECT lv.id, lv.codice, lv.data_inizio, lv.semina_id, c.nome AS campo
       FROM agri_lavorazioni lv
       JOIN agri_semine s ON s.id = lv.semina_id
       JOIN agri_campi c ON c.id = s.campo_id
       WHERE lv.tipo = 'raccolta' AND lv.stagione = ?`
    )
    .all(stagioneCorrente(db)) as Array<{ id: number; codice: string | null; data_inizio: string; semina_id: number; campo: string }>
  const ins = db.prepare(
    `INSERT INTO avvisi (tipo, riferimento_tabella, riferimento_id, messaggio, data_generazione, letto, risolto, priorita)
     VALUES ('carenza_raccolta', 'agri_lavorazioni', ?, ?, CURRENT_TIMESTAMP, 0, 0, 'alta')`
  )
  for (const r of raccolte) {
    for (const v of verificaCarenza(db, r.semina_id, r.data_inizio)) {
      ins.run(
        r.id,
        `Raccolta ${r.codice ?? ''} (${r.campo}, ${dataIt(r.data_inizio)}) fatta prima della fine del tempo di carenza di ${v.prodotto}: trattamento del ${dataIt(v.data)}, carenza fino al ${dataIt(v.fine_carenza)}`
      )
    }
  }
}
