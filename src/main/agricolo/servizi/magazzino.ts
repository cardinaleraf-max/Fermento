import type BetterSqlite3 from 'better-sqlite3'
import type { ConsumoLotto, LottoDisponibile, OrigineLotto } from '../../../shared/agricolo'
import { ErroreUtente } from '../errori'
import { EPS, arrotonda } from '../unita'

type Db = BetterSqlite3.Database

/**
 * Movimenti di magazzino del modulo agricolo, sulla stessa tabella
 * lotti_materie_prime usata da cotte e carichi (nessuna logica duplicata).
 * Tutte le funzioni che scrivono vanno chiamate dentro una db.transaction().
 */

function fmt(n: number): string {
  return arrotonda(n).toLocaleString('it-IT')
}

type LottoBase = {
  id: number
  materia_prima_id: number
  lotto_fornitore: string | null
  quantita_residua: number
  quantita_iniziale: number
  nome: string
  unita_misura: string
}

export function leggiLotto(db: Db, lottoId: number): LottoBase | undefined {
  return db
    .prepare(
      `SELECT l.id, l.materia_prima_id, l.lotto_fornitore, l.quantita_residua, l.quantita_iniziale,
              mp.nome, mp.unita_misura
       FROM lotti_materie_prime l JOIN materie_prime mp ON mp.id = l.materia_prima_id
       WHERE l.id = ?`
    )
    .get(lottoId) as LottoBase | undefined
}

/** Toglie una quantità da un lotto preciso (errore se non basta). */
export function scaricaLotto(db: Db, lottoId: number, quantita: number): void {
  const l = leggiLotto(db, lottoId)
  if (!l) throw new ErroreUtente('Lotto non trovato.')
  if (l.quantita_residua + EPS < quantita) {
    throw new ErroreUtente(
      `Il lotto ${l.lotto_fornitore || '#' + l.id} di ${l.nome} ha solo ${fmt(l.quantita_residua)} ${l.unita_misura} disponibili (ne servono ${fmt(quantita)}).`
    )
  }
  db.prepare(
    `UPDATE lotti_materie_prime SET quantita_residua = ?, aggiornato_il = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(Math.max(0, arrotonda(l.quantita_residua - quantita, 6)), lottoId)
}

/** Rimette una quantità in un lotto (annullamento di uno scarico). */
export function ripristinaLotto(db: Db, lottoId: number, quantita: number): void {
  db.prepare(
    `UPDATE lotti_materie_prime SET quantita_residua = ROUND(quantita_residua + ?, 6), aggiornato_il = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(quantita, lottoId)
}

/**
 * Scarica una quantità di una materia prima: dal lotto indicato, oppure in
 * automatico prima dal lotto che scade prima (i lotti senza scadenza per ultimi).
 * Blocca se la giacenza non basta: la tracciabilità non ammette giacenze negative.
 */
export function scaricaPerMateria(
  db: Db,
  materiaPrimaId: number,
  quantita: number,
  lottoId: number | null
): Array<{ lotto_id: number; quantita: number }> {
  if (!(quantita > 0)) throw new ErroreUtente('Inserisci una quantità maggiore di zero.')
  const mp = db
    .prepare(`SELECT nome, unita_misura FROM materie_prime WHERE id = ?`)
    .get(materiaPrimaId) as { nome: string; unita_misura: string } | undefined
  if (!mp) throw new ErroreUtente('Prodotto non trovato.')

  if (lottoId !== null) {
    const l = leggiLotto(db, lottoId)
    if (!l || l.materia_prima_id !== materiaPrimaId) {
      throw new ErroreUtente(`Il lotto scelto non appartiene a ${mp.nome}.`)
    }
    scaricaLotto(db, lottoId, quantita)
    return [{ lotto_id: lottoId, quantita: arrotonda(quantita, 6) }]
  }

  const lotti = db
    .prepare(
      `SELECT id, quantita_residua FROM lotti_materie_prime
       WHERE materia_prima_id = ? AND quantita_residua > ?
       ORDER BY data_scadenza IS NULL, data_scadenza ASC, id ASC`
    )
    .all(materiaPrimaId, EPS) as Array<{ id: number; quantita_residua: number }>
  const disponibile = lotti.reduce((s, l) => s + l.quantita_residua, 0)
  if (disponibile + EPS < quantita) {
    throw new ErroreUtente(
      `Giacenza insufficiente di ${mp.nome}: servono ${fmt(quantita)} ${mp.unita_misura}, disponibili ${fmt(disponibile)} ${mp.unita_misura}.`
    )
  }
  const righe: Array<{ lotto_id: number; quantita: number }> = []
  let rimanente = quantita
  for (const l of lotti) {
    if (rimanente <= EPS) break
    const usato = arrotonda(Math.min(l.quantita_residua, rimanente), 6)
    scaricaLotto(db, l.id, usato)
    righe.push({ lotto_id: l.id, quantita: usato })
    rimanente = arrotonda(rimanente - usato, 6)
  }
  return righe
}

export function registraConsumi(
  db: Db,
  rifTipo: 'semina' | 'operazione',
  rifId: number,
  materiaPrimaId: number,
  righe: Array<{ lotto_id: number; quantita: number }>
): void {
  const ins = db.prepare(
    `INSERT INTO agri_consumi (rif_tipo, rif_id, lotto_id, materia_prima_id, quantita) VALUES (?, ?, ?, ?, ?)`
  )
  for (const r of righe) ins.run(rifTipo, rifId, r.lotto_id, materiaPrimaId, r.quantita)
}

/** Rimette in magazzino quanto scaricato da una semina/operazione e cancella i consumi. */
export function annullaConsumi(db: Db, rifTipo: 'semina' | 'operazione', rifId: number): void {
  const righe = db
    .prepare(`SELECT lotto_id, quantita FROM agri_consumi WHERE rif_tipo = ? AND rif_id = ?`)
    .all(rifTipo, rifId) as Array<{ lotto_id: number; quantita: number }>
  for (const r of righe) ripristinaLotto(db, r.lotto_id, r.quantita)
  db.prepare(`DELETE FROM agri_consumi WHERE rif_tipo = ? AND rif_id = ?`).run(rifTipo, rifId)
}

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

/** Lotti con giacenza delle categorie indicate (più eventuali lotti da includere comunque). */
export function lottiDisponibili(
  db: Db,
  categorie: string[],
  opzioni: { stagione?: string | null; includi?: number[] } = {}
): LottoDisponibile[] {
  if (categorie.length === 0) return []
  const segnaposto = categorie.map(() => '?').join(', ')
  const includi = opzioni.includi ?? []
  const segnapostoIncludi = includi.length > 0 ? includi.map(() => '?').join(', ') : 'NULL'
  return db
    .prepare(
      `SELECT l.id, l.materia_prima_id, mp.nome AS materia_prima_nome, mp.categoria, mp.unita_misura,
              COALESCE(l.lotto_fornitore, '') AS codice, l.data_carico, l.data_scadenza,
              l.quantita_residua, l.quantita_iniziale, l.origine_tipo, l.stagione, l.calibro,
              mp.tempo_carenza_giorni
       FROM lotti_materie_prime l
       JOIN materie_prime mp ON mp.id = l.materia_prima_id
       WHERE mp.categoria IN (${segnaposto})
         AND (l.quantita_residua > ? OR l.id IN (${segnapostoIncludi}))
         AND (? IS NULL OR l.stagione = ? OR l.id IN (${segnapostoIncludi}))
       ORDER BY mp.nome COLLATE NOCASE, l.data_scadenza IS NULL, l.data_scadenza, l.id`
    )
    .all(
      ...categorie,
      EPS,
      ...includi,
      opzioni.stagione ?? null,
      opzioni.stagione ?? null,
      ...includi
    ) as LottoDisponibile[]
}

export type NuovoLotto = {
  materia_prima_id: number
  codice: string
  data_carico: string
  data_scadenza: string | null
  quantita: number
  origine_tipo: OrigineLotto
  origine_id: number | null
  stagione: string | null
  calibro: string | null
  note: string | null
}

export function creaLotto(db: Db, p: NuovoLotto): number {
  return Number(
    db
      .prepare(
        `INSERT INTO lotti_materie_prime
           (materia_prima_id, lotto_fornitore, data_carico, data_scadenza, quantita_iniziale, quantita_residua,
            note, origine_tipo, origine_id, stagione, calibro)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        p.materia_prima_id,
        p.codice,
        p.data_carico,
        p.data_scadenza,
        p.quantita,
        p.quantita,
        p.note,
        p.origine_tipo,
        p.origine_id,
        p.stagione,
        p.calibro
      ).lastInsertRowid
  )
}

/**
 * Perché un lotto non si può più toccare (usato in una cotta, in un'altra
 * lavorazione, in una semina/operazione, oppure giacenza già modificata).
 * null = libero.
 */
export function lottoUsatoAValle(db: Db, lottoId: number): string | null {
  const l = leggiLotto(db, lottoId)
  if (!l) return null
  const codice = l.lotto_fornitore || `#${l.id}`
  const cotta = db
    .prepare(
      `SELECT c.numero_lotto FROM cotta_materie_prime cmp JOIN cotte c ON c.id = cmp.cotta_id
       WHERE cmp.lotto_materia_prima_id = ? LIMIT 1`
    )
    .get(lottoId) as { numero_lotto: string } | undefined
  if (cotta) return `il lotto ${codice} è già stato usato nella cotta ${cotta.numero_lotto}`
  const lav = db
    .prepare(
      `SELECT lv.tipo, lv.codice, lv.data_inizio FROM agri_lavorazione_input i
       JOIN agri_lavorazioni lv ON lv.id = i.lavorazione_id WHERE i.lotto_id = ? LIMIT 1`
    )
    .get(lottoId) as { tipo: string; codice: string | null; data_inizio: string } | undefined
  if (lav) {
    const nome =
      lav.tipo === 'maltazione'
        ? 'nella maltazione'
        : lav.tipo === 'calibratura'
          ? "nell'analisi e calibratura"
          : 'nella raccolta'
    return `il lotto ${codice} è già stato usato ${nome} ${lav.codice ?? 'del ' + lav.data_inizio}`
  }
  const consumo = db
    .prepare(`SELECT rif_tipo FROM agri_consumi WHERE lotto_id = ? LIMIT 1`)
    .get(lottoId) as { rif_tipo: string } | undefined
  if (consumo) {
    return `il lotto ${codice} è già stato usato in ${consumo.rif_tipo === 'semina' ? 'una semina' : "un'operazione di campo"}`
  }
  if (l.quantita_residua + EPS < l.quantita_iniziale) {
    return `la giacenza del lotto ${codice} è già stata modificata in magazzino (${fmt(l.quantita_residua)} su ${fmt(l.quantita_iniziale)} ${l.unita_misura})`
  }
  return null
}

export type DatiFitofarmaco = {
  numero_registrazione?: string | null
  principio_attivo?: string | null
  tempo_carenza_giorni?: number | null
}

/** Controlla i dati fitofarmaco e restituisce le colonne da aggiornare (solo quelle presenti). */
export function colonneFitofarmaco(p: DatiFitofarmaco): Array<[string, string | number | null]> {
  const colonne: Array<[string, string | number | null]> = []
  const testo = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
  if ('numero_registrazione' in p)
    colonne.push(['numero_registrazione', testo(p.numero_registrazione)])
  if ('principio_attivo' in p) colonne.push(['principio_attivo', testo(p.principio_attivo)])
  if ('tempo_carenza_giorni' in p) {
    const v = p.tempo_carenza_giorni
    if (v === null || v === undefined || (v as unknown) === '') {
      colonne.push(['tempo_carenza_giorni', null])
    } else {
      const n = Number(v)
      if (!Number.isInteger(n) || n < 0 || n > 3650) {
        throw new ErroreUtente(
          'Tempo di carenza: inserisci un numero intero di giorni (0 se non previsto).'
        )
      }
      colonne.push(['tempo_carenza_giorni', n])
    }
  }
  return colonne
}

/**
 * Aggiorna i dati specifici dei fitofarmaci. Tocca SOLO i campi presenti nel
 * payload: una modifica fatta dal Magazzino materie prime (che non li invia)
 * non li cancella.
 */
export function salvaDatiFitofarmaco(db: Db, materiaPrimaId: number, p: DatiFitofarmaco): void {
  const colonne = colonneFitofarmaco(p)
  if (colonne.length === 0) return
  db.prepare(
    `UPDATE materie_prime SET ${colonne.map(([c]) => `${c} = ?`).join(', ')} WHERE id = ?`
  ).run(...colonne.map(([, v]) => v), materiaPrimaId)
}

// ── Guardie per le eliminazioni dal Magazzino materie prime ────────────────

function tabellaPresente(db: Db, nome: string): boolean {
  return !!db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(nome)
}

function colonnaPresente(db: Db, tabella: string, colonna: string): boolean {
  return (db.prepare(`PRAGMA table_info(${tabella})`).all() as Array<{ name: string }>).some(
    (c) => c.name === colonna
  )
}

const NOMI_ORIGINE: Record<string, string> = {
  raccolta: 'una raccolta',
  calibratura: "un'analisi e calibratura",
  maltazione: 'una maltazione'
}

/**
 * Perché un lotto non si può eliminare dal magazzino per motivi della filiera
 * agricola, o null. Tollera un DB ripristinato da un backup vecchio (tabelle o
 * colonne agricole non ancora create): in quel caso non c'è nulla da proteggere.
 */
export function motivoBloccoEliminazioneLotto(db: Db, lottoId: number): string | null {
  if (colonnaPresente(db, 'lotti_materie_prime', 'origine_tipo')) {
    const l = db
      .prepare(`SELECT origine_tipo FROM lotti_materie_prime WHERE id = ?`)
      .get(lottoId) as { origine_tipo: string | null } | undefined
    if (l?.origine_tipo && l.origine_tipo !== 'acquisto') {
      return `Questo lotto è stato creato da ${NOMI_ORIGINE[l.origine_tipo] ?? 'una lavorazione'}: per toglierlo elimina quella lavorazione.`
    }
  }
  const usi: Array<[tabella: string, sql: string]> = [
    ['agri_lavorazione_input', `SELECT 1 FROM agri_lavorazione_input WHERE lotto_id = ? LIMIT 1`],
    ['agri_lavorazione_output', `SELECT 1 FROM agri_lavorazione_output WHERE lotto_id = ? LIMIT 1`],
    ['agri_consumi', `SELECT 1 FROM agri_consumi WHERE lotto_id = ? LIMIT 1`]
  ]
  for (const [tabella, sql] of usi) {
    if (tabellaPresente(db, tabella) && db.prepare(sql).get(lottoId)) {
      return 'Lotto usato nella filiera agricola (semina, operazione di campo o lavorazione): non si può eliminare.'
    }
  }
  return null
}

/** Perché una materia prima non si può eliminare per motivi della filiera agricola, o null. */
export function motivoBloccoEliminazioneMateria(db: Db, materiaPrimaId: number): string | null {
  if (
    tabellaPresente(db, 'agri_operazioni') &&
    db
      .prepare(`SELECT 1 FROM agri_operazioni WHERE materia_prima_id = ? LIMIT 1`)
      .get(materiaPrimaId)
  ) {
    return 'Prodotto usato in operazioni di campo: non si può eliminare.'
  }
  if (tabellaPresente(db, 'agri_lavorazioni')) {
    const lav = db
      .prepare(`SELECT tipo FROM agri_lavorazioni WHERE materia_prima_id = ? LIMIT 1`)
      .get(materiaPrimaId) as { tipo: string } | undefined
    if (lav) {
      const nome =
        lav.tipo === 'raccolta'
          ? 'raccolte'
          : lav.tipo === 'calibratura'
            ? 'calibrature'
            : 'maltazioni'
      return `Materia prima usata in ${nome}: non si può eliminare.`
    }
  }
  if (
    tabellaPresente(db, 'agri_consumi') &&
    db.prepare(`SELECT 1 FROM agri_consumi WHERE materia_prima_id = ? LIMIT 1`).get(materiaPrimaId)
  ) {
    return 'Prodotto usato nella filiera agricola: non si può eliminare.'
  }
  return null
}
