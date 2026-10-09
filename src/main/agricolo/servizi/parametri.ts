import type BetterSqlite3 from 'better-sqlite3'
import type {
  FaseLavorazione,
  GruppoParametri,
  GruppoPayload,
  Parametro,
  ParametroPayload,
  TipoParametro,
  ValoreStorico,
  ValoriParametri
} from '../../../shared/agricolo'
import { dataIsoValida } from '../calcoli'
import { ErroreUtente } from '../errori'
import { idObbligatorio, testoObbligatorio, testoOpzionale } from './valida'

type Db = BetterSqlite3.Database

const FASI: FaseLavorazione[] = ['raccolta', 'calibratura', 'maltazione']
const TIPI: TipoParametro[] = ['numero', 'testo', 'scala', 'si_no']

function faseValida(v: unknown): FaseLavorazione {
  if (FASI.includes(v as FaseLavorazione)) return v as FaseLavorazione
  throw new ErroreUtente('Fase non valida.')
}

// ── Configurazione ───────────────────────────────────────────────────────────

/** Gruppi e parametri attivi di una fase, nell'ordine scelto dall'utente. */
export function configParametri(db: Db, fase: FaseLavorazione): GruppoParametri[] {
  const gruppi = db
    .prepare(
      `SELECT id, fase, nome, ordine, con_data FROM agri_gruppi_parametri
       WHERE fase = ? AND attivo = 1 ORDER BY ordine, id`
    )
    .all(fase) as Array<{ id: number; fase: FaseLavorazione; nome: string; ordine: number; con_data: number }>
  const parametri = db
    .prepare(
      `SELECT p.id, p.gruppo_id, p.nome, p.unita, p.tipo, p.ordine FROM agri_parametri p
       JOIN agri_gruppi_parametri g ON g.id = p.gruppo_id
       WHERE g.fase = ? AND g.attivo = 1 AND p.attivo = 1 ORDER BY p.ordine, p.id`
    )
    .all(fase) as Parametro[]
  return gruppi.map((g) => ({
    ...g,
    con_data: g.con_data === 1,
    parametri: parametri.filter((p) => p.gruppo_id === g.id)
  }))
}

export function salvaGruppo(db: Db, id: number | null, p: GruppoPayload): number {
  const fase = faseValida(p.fase)
  const nome = testoObbligatorio(p.nome, 'Nome del gruppo')
  const doppio = db
    .prepare(
      `SELECT id FROM agri_gruppi_parametri WHERE fase = ? AND attivo = 1 AND nome = ? COLLATE NOCASE AND id IS NOT ?`
    )
    .get(fase, nome, id)
  if (doppio) throw new ErroreUtente(`Esiste già un gruppo "${nome}" in questa fase.`)
  if (id === null) {
    const ordine = (
      db.prepare(`SELECT COALESCE(MAX(ordine), 0) + 1 AS o FROM agri_gruppi_parametri WHERE fase = ?`).get(fase) as {
        o: number
      }
    ).o
    return Number(
      db
        .prepare(`INSERT INTO agri_gruppi_parametri (fase, nome, ordine, con_data, attivo) VALUES (?, ?, ?, ?, 1)`)
        .run(fase, nome, ordine, p.con_data ? 1 : 0).lastInsertRowid
    )
  }
  const r = db
    .prepare(`UPDATE agri_gruppi_parametri SET nome = ?, con_data = ? WHERE id = ? AND fase = ?`)
    .run(nome, p.con_data ? 1 : 0, id, fase)
  if (r.changes === 0) throw new ErroreUtente('Gruppo non trovato.')
  return id
}

function haValoriGruppo(db: Db, gruppoId: number): boolean {
  const valori = db
    .prepare(
      `SELECT 1 FROM agri_valori_parametri v JOIN agri_parametri p ON p.id = v.parametro_id WHERE p.gruppo_id = ? LIMIT 1`
    )
    .get(gruppoId)
  const date = db.prepare(`SELECT 1 FROM agri_date_gruppi WHERE gruppo_id = ? LIMIT 1`).get(gruppoId)
  return !!valori || !!date
}

/**
 * Elimina un gruppo. Se ha già valori registrati viene solo nascosto (resta
 * nello storico e nella tracciabilità), altrimenti viene cancellato.
 */
export function eliminaGruppo(db: Db, id: number): 'nascosto' | 'eliminato' {
  return db.transaction((): 'nascosto' | 'eliminato' => {
    if (haValoriGruppo(db, id)) {
      db.prepare(`UPDATE agri_gruppi_parametri SET attivo = 0 WHERE id = ?`).run(id)
      db.prepare(`UPDATE agri_parametri SET attivo = 0 WHERE gruppo_id = ?`).run(id)
      return 'nascosto'
    }
    db.prepare(`DELETE FROM agri_parametri WHERE gruppo_id = ?`).run(id)
    db.prepare(`DELETE FROM agri_gruppi_parametri WHERE id = ?`).run(id)
    return 'eliminato'
  })()
}

export function salvaParametro(db: Db, id: number | null, p: ParametroPayload): number {
  const gruppoId = idObbligatorio(p.gruppo_id, 'Gruppo')
  if (!db.prepare(`SELECT id FROM agri_gruppi_parametri WHERE id = ? AND attivo = 1`).get(gruppoId)) {
    throw new ErroreUtente('Gruppo non trovato.')
  }
  const nome = testoObbligatorio(p.nome, 'Nome del parametro')
  if (!TIPI.includes(p.tipo)) throw new ErroreUtente('Tipo di parametro non valido.')
  const unita = p.tipo === 'numero' ? testoOpzionale(p.unita) : null
  const doppio = db
    .prepare(`SELECT id FROM agri_parametri WHERE gruppo_id = ? AND attivo = 1 AND nome = ? COLLATE NOCASE AND id IS NOT ?`)
    .get(gruppoId, nome, id)
  if (doppio) throw new ErroreUtente(`Esiste già un parametro "${nome}" in questo gruppo.`)
  if (id === null) {
    const ordine = (
      db.prepare(`SELECT COALESCE(MAX(ordine), 0) + 1 AS o FROM agri_parametri WHERE gruppo_id = ?`).get(gruppoId) as {
        o: number
      }
    ).o
    return Number(
      db
        .prepare(`INSERT INTO agri_parametri (gruppo_id, nome, unita, tipo, ordine, attivo) VALUES (?, ?, ?, ?, ?, 1)`)
        .run(gruppoId, nome, unita, p.tipo, ordine).lastInsertRowid
    )
  }
  const attuale = db.prepare(`SELECT tipo FROM agri_parametri WHERE id = ?`).get(id) as { tipo: TipoParametro } | undefined
  if (!attuale) throw new ErroreUtente('Parametro non trovato.')
  if (attuale.tipo !== p.tipo && db.prepare(`SELECT 1 FROM agri_valori_parametri WHERE parametro_id = ? LIMIT 1`).get(id)) {
    throw new ErroreUtente(
      'Questo parametro ha già dei valori registrati: non puoi cambiarne il tipo. Puoi crearne uno nuovo e nascondere questo.'
    )
  }
  db.prepare(`UPDATE agri_parametri SET gruppo_id = ?, nome = ?, unita = ?, tipo = ? WHERE id = ?`).run(
    gruppoId,
    nome,
    unita,
    p.tipo,
    id
  )
  return id
}

export function eliminaParametro(db: Db, id: number): 'nascosto' | 'eliminato' {
  if (db.prepare(`SELECT 1 FROM agri_valori_parametri WHERE parametro_id = ? LIMIT 1`).get(id)) {
    db.prepare(`UPDATE agri_parametri SET attivo = 0 WHERE id = ?`).run(id)
    return 'nascosto'
  }
  db.prepare(`DELETE FROM agri_parametri WHERE id = ?`).run(id)
  return 'eliminato'
}

/** Scambia la posizione con il vicino (tra gli elementi attivi dello stesso livello). */
export function sposta(db: Db, cosa: 'gruppo' | 'parametro', id: number, direzione: 'su' | 'giu'): void {
  db.transaction(() => {
    const fratelli =
      cosa === 'gruppo'
        ? (db
            .prepare(
              `SELECT id FROM agri_gruppi_parametri WHERE attivo = 1
               AND fase = (SELECT fase FROM agri_gruppi_parametri WHERE id = ?) ORDER BY ordine, id`
            )
            .all(id) as Array<{ id: number }>)
        : (db
            .prepare(
              `SELECT id FROM agri_parametri WHERE attivo = 1
               AND gruppo_id = (SELECT gruppo_id FROM agri_parametri WHERE id = ?) ORDER BY ordine, id`
            )
            .all(id) as Array<{ id: number }>)
    const ids = fratelli.map((f) => f.id)
    const i = ids.indexOf(id)
    const j = direzione === 'su' ? i - 1 : i + 1
    if (i < 0 || j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    const tabella = cosa === 'gruppo' ? 'agri_gruppi_parametri' : 'agri_parametri'
    const upd = db.prepare(`UPDATE ${tabella} SET ordine = ? WHERE id = ?`)
    ids.forEach((x, k) => upd.run(k + 1, x))
  })()
}

// ── Valori ───────────────────────────────────────────────────────────────────

export function valoriLavorazione(db: Db, lavorazioneId: number): ValoriParametri {
  const valori: Record<number, string> = {}
  for (const r of db
    .prepare(`SELECT parametro_id, valore FROM agri_valori_parametri WHERE lavorazione_id = ?`)
    .all(lavorazioneId) as Array<{ parametro_id: number; valore: string }>) {
    valori[r.parametro_id] = r.valore
  }
  const date: Record<number, string> = {}
  for (const r of db
    .prepare(`SELECT gruppo_id, data FROM agri_date_gruppi WHERE lavorazione_id = ?`)
    .all(lavorazioneId) as Array<{ gruppo_id: number; data: string }>) {
    date[r.gruppo_id] = r.data
  }
  return { valori, date }
}

/** Valori registrati su parametri o gruppi poi nascosti: restano visibili come storico. */
export function valoriStorici(db: Db, lavorazioneId: number): ValoreStorico[] {
  return db
    .prepare(
      `SELECT g.nome AS gruppo, p.nome AS parametro, p.unita, p.tipo, v.valore
       FROM agri_valori_parametri v
       JOIN agri_parametri p ON p.id = v.parametro_id
       JOIN agri_gruppi_parametri g ON g.id = p.gruppo_id
       WHERE v.lavorazione_id = ? AND (p.attivo = 0 OR g.attivo = 0)
       ORDER BY g.ordine, p.ordine`
    )
    .all(lavorazioneId) as ValoreStorico[]
}

/** Valori leggibili di tutti i parametri (anche nascosti), nell'ordine del processo. */
export function valoriLeggibili(
  db: Db,
  lavorazioneId: number
): Array<{ gruppo: string; data_gruppo: string | null; parametro: string; unita: string | null; tipo: TipoParametro; valore: string }> {
  return db
    .prepare(
      `SELECT g.nome AS gruppo, dg.data AS data_gruppo, p.nome AS parametro, p.unita, p.tipo, v.valore
       FROM agri_valori_parametri v
       JOIN agri_parametri p ON p.id = v.parametro_id
       JOIN agri_gruppi_parametri g ON g.id = p.gruppo_id
       LEFT JOIN agri_date_gruppi dg ON dg.gruppo_id = g.id AND dg.lavorazione_id = v.lavorazione_id
       WHERE v.lavorazione_id = ?
       ORDER BY g.ordine, g.id, p.ordine, p.id`
    )
    .all(lavorazioneId) as Array<{
    gruppo: string
    data_gruppo: string | null
    parametro: string
    unita: string | null
    tipo: TipoParametro
    valore: string
  }>
}

function normalizzaValore(tipo: TipoParametro, nome: string, grezzo: string): string {
  const v = grezzo.trim()
  switch (tipo) {
    case 'numero': {
      const n = Number(v.replace(',', '.'))
      if (!Number.isFinite(n)) throw new ErroreUtente(`"${nome}": inserisci un numero.`)
      return String(n)
    }
    case 'scala': {
      const n = Number(v)
      if (!Number.isInteger(n) || n < 1 || n > 10) throw new ErroreUtente(`"${nome}": scegli un valore da 1 a 10.`)
      return String(n)
    }
    case 'si_no':
      if (v !== 'si' && v !== 'no') throw new ErroreUtente(`"${nome}": scegli sì o no.`)
      return v
    case 'testo':
      if (v.length > 1000) throw new ErroreUtente(`"${nome}": testo troppo lungo.`)
      return v
  }
}

/**
 * Salva i valori dei parametri di una lavorazione. Un valore vuoto cancella il
 * dato. Tutto o niente: se un valore non è valido non si salva nulla.
 */
export function salvaValori(
  db: Db,
  lavorazioneId: number,
  valori: Record<number, string>,
  date: Record<number, string>
): void {
  if (!db.prepare(`SELECT id FROM agri_lavorazioni WHERE id = ?`).get(lavorazioneId)) {
    throw new ErroreUtente('Lavorazione non trovata.')
  }
  const leggiParam = db.prepare(`SELECT id, nome, tipo FROM agri_parametri WHERE id = ?`)
  const upsert = db.prepare(
    `INSERT INTO agri_valori_parametri (lavorazione_id, parametro_id, valore) VALUES (?, ?, ?)
     ON CONFLICT(lavorazione_id, parametro_id) DO UPDATE SET valore = excluded.valore`
  )
  const cancella = db.prepare(`DELETE FROM agri_valori_parametri WHERE lavorazione_id = ? AND parametro_id = ?`)
  const upsertData = db.prepare(
    `INSERT INTO agri_date_gruppi (lavorazione_id, gruppo_id, data) VALUES (?, ?, ?)
     ON CONFLICT(lavorazione_id, gruppo_id) DO UPDATE SET data = excluded.data`
  )
  const cancellaData = db.prepare(`DELETE FROM agri_date_gruppi WHERE lavorazione_id = ? AND gruppo_id = ?`)

  db.transaction(() => {
    for (const [chiave, grezzo] of Object.entries(valori ?? {})) {
      const pid = Number(chiave)
      const p = leggiParam.get(pid) as { id: number; nome: string; tipo: TipoParametro } | undefined
      if (!p) throw new ErroreUtente('Parametro non trovato.')
      const testo = typeof grezzo === 'string' ? grezzo : String(grezzo ?? '')
      if (testo.trim() === '') {
        cancella.run(lavorazioneId, pid)
        continue
      }
      upsert.run(lavorazioneId, pid, normalizzaValore(p.tipo, p.nome, testo))
    }
    for (const [chiave, data] of Object.entries(date ?? {})) {
      const gid = Number(chiave)
      if (!data) {
        cancellaData.run(lavorazioneId, gid)
        continue
      }
      if (!dataIsoValida(data)) throw new ErroreUtente('Data del gruppo non valida.')
      if (!db.prepare(`SELECT id FROM agri_gruppi_parametri WHERE id = ? AND con_data = 1`).get(gid)) {
        throw new ErroreUtente('Questo gruppo non prevede una data.')
      }
      upsertData.run(lavorazioneId, gid, data)
    }
  })()
}
