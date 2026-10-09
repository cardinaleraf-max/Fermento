import type BetterSqlite3 from 'better-sqlite3'
import type { CampoPayload, CampoRiga, Coltura, SeminaPayload, SeminaRiga } from '../../../shared/agricolo'
import { ErroreUtente } from '../errori'
import { annullaConsumi, consumiDi, registraConsumi, scaricaPerMateria } from './magazzino'
import {
  dataObbligatoria,
  idObbligatorio,
  numeroOpzionale,
  numeroPositivo,
  stagioneObbligatoria,
  testoObbligatorio,
  testoOpzionale
} from './valida'

type Db = BetterSqlite3.Database

// ── Campi ────────────────────────────────────────────────────────────────────

export function listaCampi(db: Db, stagione: string | null): CampoRiga[] {
  return db
    .prepare(
      `SELECT c.id, c.nome, c.superficie_ha, c.localita, c.rif_catastale, c.note, c.attivo,
              (SELECT COUNT(*) FROM agri_semine s WHERE s.campo_id = c.id AND (? IS NULL OR s.stagione = ?)) AS semine_stagione,
              (SELECT COUNT(*) FROM agri_semine s WHERE s.campo_id = c.id) AS semine_totali
       FROM agri_campi c
       ORDER BY c.attivo DESC, c.nome COLLATE NOCASE`
    )
    .all(stagione, stagione) as CampoRiga[]
}

export function salvaCampo(db: Db, id: number | null, p: CampoPayload): number {
  const nome = testoObbligatorio(p.nome, 'Nome del campo')
  const superficie = numeroOpzionale(p.superficie_ha, 'Superficie', { min: 0 })
  const doppio = db
    .prepare(`SELECT id FROM agri_campi WHERE nome = ? COLLATE NOCASE AND id IS NOT ?`)
    .get(nome, id) as { id: number } | undefined
  if (doppio) throw new ErroreUtente(`Esiste già un campo chiamato "${nome}".`)
  const valori = [nome, superficie, testoOpzionale(p.localita), testoOpzionale(p.rif_catastale), testoOpzionale(p.note)]
  if (id === null) {
    return Number(
      db
        .prepare(
          `INSERT INTO agri_campi (nome, superficie_ha, localita, rif_catastale, note) VALUES (?, ?, ?, ?, ?)`
        )
        .run(...valori).lastInsertRowid
    )
  }
  const r = db
    .prepare(
      `UPDATE agri_campi SET nome = ?, superficie_ha = ?, localita = ?, rif_catastale = ?, note = ?,
              aggiornato_il = CURRENT_TIMESTAMP WHERE id = ?`
    )
    .run(...valori, id)
  if (r.changes === 0) throw new ErroreUtente('Campo non trovato.')
  return id
}

export function archiviaCampo(db: Db, id: number, attivo: boolean): void {
  db.prepare(`UPDATE agri_campi SET attivo = ?, aggiornato_il = CURRENT_TIMESTAMP WHERE id = ?`).run(
    attivo ? 1 : 0,
    id
  )
}

export function eliminaCampo(db: Db, id: number): void {
  const n = (db.prepare(`SELECT COUNT(*) AS c FROM agri_semine WHERE campo_id = ?`).get(id) as { c: number }).c
  if (n > 0) {
    throw new ErroreUtente(
      'Il campo ha semine registrate: non si può eliminare (perderesti la tracciabilità). Puoi archiviarlo.'
    )
  }
  db.prepare(`DELETE FROM agri_campi WHERE id = ?`).run(id)
}

// ── Semine ───────────────────────────────────────────────────────────────────

type SeminaDb = Omit<SeminaRiga, 'semente'>

export function listaSemine(
  db: Db,
  filtro: { campo_id?: number | null; stagione?: string | null }
): SeminaRiga[] {
  const campo = filtro.campo_id ?? null
  const stagione = filtro.stagione ?? null
  const righe = db
    .prepare(
      `SELECT s.id, s.campo_id, c.nome AS campo_nome, s.stagione, s.coltura, s.varieta, s.data,
              s.superficie_ha, s.semente_testo, s.note,
              (SELECT COUNT(*) FROM agri_operazioni o WHERE o.semina_id = s.id) AS operazioni,
              (SELECT COUNT(*) FROM agri_lavorazioni l WHERE l.tipo = 'raccolta' AND l.semina_id = s.id) AS raccolte
       FROM agri_semine s
       JOIN agri_campi c ON c.id = s.campo_id
       WHERE (? IS NULL OR s.campo_id = ?) AND (? IS NULL OR s.stagione = ?)
       ORDER BY s.data DESC, s.id DESC`
    )
    .all(campo, campo, stagione, stagione) as SeminaDb[]
  return righe.map((r) => ({ ...r, semente: consumiDi(db, 'semina', r.id) }))
}

function colturaValida(v: unknown): Coltura {
  if (v === 'orzo' || v === 'luppolo') return v
  throw new ErroreUtente('Coltura non valida: scegli orzo o luppolo.')
}

export function salvaSemina(db: Db, id: number | null, p: SeminaPayload): number {
  const campoId = idObbligatorio(p.campo_id, 'Campo')
  const campo = db.prepare(`SELECT id FROM agri_campi WHERE id = ?`).get(campoId)
  if (!campo) throw new ErroreUtente('Campo non trovato.')
  const stagione = stagioneObbligatoria(p.stagione)
  const coltura = colturaValida(p.coltura)
  const data = dataObbligatoria(p.data, 'Data di semina')
  const superficie = numeroOpzionale(p.superficie_ha, 'Superficie seminata', { min: 0 })
  const valori = [campoId, stagione, coltura, testoOpzionale(p.varieta), data, superficie, testoOpzionale(p.semente_testo), testoOpzionale(p.note)]

  let semente: { materia_prima_id: number; quantita: number; lotto_id: number | null } | null = null
  if (p.semente) {
    const mpId = idObbligatorio(p.semente.materia_prima_id, 'Semente')
    const mp = db.prepare(`SELECT categoria FROM materie_prime WHERE id = ?`).get(mpId) as
      | { categoria: string }
      | undefined
    if (!mp || mp.categoria !== 'semente') {
      throw new ErroreUtente('La semente dal magazzino deve essere un prodotto della categoria "Semente".')
    }
    semente = {
      materia_prima_id: mpId,
      quantita: numeroPositivo(p.semente.quantita, 'Quantità di semente'),
      lotto_id: p.semente.lotto_id ? idObbligatorio(p.semente.lotto_id, 'Lotto di semente') : null
    }
  }

  const applicaSemente = (seminaId: number): void => {
    annullaConsumi(db, 'semina', seminaId)
    if (semente) {
      const righe = scaricaPerMateria(db, semente.materia_prima_id, semente.quantita, semente.lotto_id)
      registraConsumi(db, 'semina', seminaId, semente.materia_prima_id, righe)
    }
  }

  const tx = db.transaction((): number => {
    if (id === null) {
      const nuovoId = Number(
        db
          .prepare(
            `INSERT INTO agri_semine (campo_id, stagione, coltura, varieta, data, superficie_ha, semente_testo, note)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(...valori).lastInsertRowid
      )
      applicaSemente(nuovoId)
      return nuovoId
    }
    const attuale = db.prepare(`SELECT coltura FROM agri_semine WHERE id = ?`).get(id) as
      | { coltura: Coltura }
      | undefined
    if (!attuale) throw new ErroreUtente('Semina non trovata.')
    if (attuale.coltura !== coltura) {
      const raccolte = (
        db
          .prepare(`SELECT COUNT(*) AS c FROM agri_lavorazioni WHERE tipo = 'raccolta' AND semina_id = ?`)
          .get(id) as { c: number }
      ).c
      if (raccolte > 0) {
        throw new ErroreUtente('Questa semina ha già delle raccolte: non puoi cambiarne la coltura.')
      }
    }
    db.prepare(
      `UPDATE agri_semine SET campo_id = ?, stagione = ?, coltura = ?, varieta = ?, data = ?, superficie_ha = ?,
              semente_testo = ?, note = ?, aggiornato_il = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(...valori, id)
    applicaSemente(id)
    return id
  })
  return tx()
}

export function eliminaSemina(db: Db, id: number): void {
  const operazioni = (db.prepare(`SELECT COUNT(*) AS c FROM agri_operazioni WHERE semina_id = ?`).get(id) as { c: number }).c
  const raccolte = (
    db.prepare(`SELECT COUNT(*) AS c FROM agri_lavorazioni WHERE tipo = 'raccolta' AND semina_id = ?`).get(id) as {
      c: number
    }
  ).c
  if (operazioni > 0 || raccolte > 0) {
    throw new ErroreUtente(
      'Questa semina ha operazioni di campo o raccolte collegate: elimina prima quelle, oppure correggi la semina.'
    )
  }
  db.transaction(() => {
    annullaConsumi(db, 'semina', id)
    db.prepare(`DELETE FROM agri_semine WHERE id = ?`).run(id)
  })()
}
