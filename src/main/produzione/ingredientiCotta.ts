import type BetterSqlite3 from 'better-sqlite3'
import { isCategoriaInputAgricolo } from '../../shared/agricolo'
import { ErroreUtente } from '../agricolo/errori'
import { arrotonda } from '../agricolo/unita'

type Db = BetterSqlite3.Database

/**
 * Ingredienti di una cotta: scarico all'avvio (dalla ricetta o modificati per
 * quella cotta) e correzioni a cotta avviata. La ricetta non viene mai toccata.
 * Lo scarico segue sempre l'ordine storico: scadenza più vicina, poi lotto più vecchio.
 */

export type IngredienteRichiesto = { materia_prima_id: number; quantita: number }

export type AvviaCottaDati = {
  numero_lotto: string
  birra_id: number
  ricetta_id: number
  data_inizio: string
  litri_teorici: number
  /** Facoltativo: ingredienti modificati per QUESTA cotta. Assente = ricetta, come prima. */
  ingredienti?: IngredienteRichiesto[]
}

export type IngredienteCottaRiga = {
  materia_prima_id: number
  mp_nome: string
  unita_misura: string
  categoria: string
  /** Totale già scaricato per la cotta. */
  quantita: number
  /** Giacenza attuale in magazzino (lotti con residuo). */
  giacenza: number
}

type Materia = { id: number; nome: string; unita_misura: string; categoria: string | null }

/** Quantità senza il rumore dei decimali (0,1 + 0,2 = 0,30000000000000004). */
const q6 = (n: number): number => arrotonda(n, 6)

const oggiIso = (): string => new Date().toISOString().split('T')[0]

const fmt = (n: number): string => n.toLocaleString('it-IT', { maximumFractionDigits: 3 })

function leggiMateria(db: Db, id: number): Materia | undefined {
  return db
    .prepare(`SELECT id, nome, unita_misura, categoria FROM materie_prime WHERE id = ?`)
    .get(id) as Materia | undefined
}

/**
 * Valida gli ingredienti richiesti e li riduce a una quantità per materia prima
 * (duplicati sommati, zeri tolti), nell'ordine in cui compaiono.
 */
function normalizza(db: Db, righe: IngredienteRichiesto[]): Map<number, number> {
  const totali = new Map<number, number>()
  for (const r of righe) {
    const m = Number.isInteger(r.materia_prima_id)
      ? leggiMateria(db, r.materia_prima_id)
      : undefined
    if (!m) throw new ErroreUtente('Materia prima non trovata: forse è stata eliminata.')
    if (m.categoria && isCategoriaInputAgricolo(m.categoria))
      throw new ErroreUtente(`${m.nome} non è un ingrediente da birra (è un prodotto per i campi).`)
    if (typeof r.quantita !== 'number' || !Number.isFinite(r.quantita) || r.quantita < 0)
      throw new ErroreUtente(
        `Quantità non valida per ${m.nome}: inserisci un numero maggiore o uguale a zero.`
      )
    totali.set(m.id, q6((totali.get(m.id) ?? 0) + r.quantita))
  }
  for (const [id, q] of totali) if (q <= 0) totali.delete(id)
  return totali
}

/** Cosa cambia passando da `prima` a `dopo` (per le note della cotta); '' se niente. */
function descriviVariazioni(db: Db, prima: Map<number, number>, dopo: Map<number, number>): string {
  const parti: string[] = []
  const m = (id: number): Materia =>
    leggiMateria(db, id) ?? { id, nome: `Materia prima #${id}`, unita_misura: '', categoria: null }
  for (const [id, q] of prima) {
    const nuova = dopo.get(id)
    if (nuova === undefined) parti.push(`tolto ${m(id).nome}`)
    else if (q6(nuova) !== q6(q))
      parti.push(`${m(id).nome} ${fmt(q)} → ${fmt(nuova)} ${m(id).unita_misura}`.trimEnd())
  }
  for (const [id, q] of dopo)
    if (!prima.has(id))
      parti.push(`aggiunto ${m(id).nome} ${fmt(q)} ${m(id).unita_misura}`.trimEnd())
  return parti.join('; ')
}

function aggiungiNota(db: Db, cottaId: number, riga: string): void {
  db.prepare(
    `UPDATE cotte
     SET note = CASE WHEN note IS NULL OR note = '' THEN ? ELSE note || char(10) || ? END,
         aggiornato_il = CURRENT_TIMESTAMP
     WHERE id = ?`
  ).run(riga, riga, cottaId)
}

/**
 * Scarica `quantita` dai lotti disponibili (scadenza più vicina prima) e la
 * registra sulla cotta. Con `unisci` somma sulla riga già presente per lo stesso
 * lotto invece di crearne un'altra. Ritorna quanto non è stato possibile scaricare.
 */
function scaricaFifo(
  db: Db,
  cottaId: number,
  materiaPrimaId: number,
  quantita: number,
  unisci: boolean
): number {
  const lotti = db
    .prepare(
      `SELECT id, quantita_residua FROM lotti_materie_prime
       WHERE materia_prima_id = ? AND quantita_residua > 0
       ORDER BY data_scadenza ASC, id ASC`
    )
    .all(materiaPrimaId) as Array<{ id: number; quantita_residua: number }>
  const scaricaLotto = db.prepare(
    `UPDATE lotti_materie_prime SET quantita_residua = ? WHERE id = ?`
  )
  const rigaEsistente = db.prepare(
    `SELECT id, quantita_usata FROM cotta_materie_prime
     WHERE cotta_id = ? AND lotto_materia_prima_id = ? AND materia_prima_id = ? ORDER BY id LIMIT 1`
  )
  const aggiornaRiga = db.prepare(`UPDATE cotta_materie_prime SET quantita_usata = ? WHERE id = ?`)
  const nuovaRiga = db.prepare(
    `INSERT INTO cotta_materie_prime (cotta_id, lotto_materia_prima_id, materia_prima_id, quantita_usata)
     VALUES (?, ?, ?, ?)`
  )

  let rimanente = q6(quantita)
  for (const lotto of lotti) {
    if (rimanente <= 0) break
    const usato = q6(Math.min(lotto.quantita_residua, rimanente))
    scaricaLotto.run(q6(lotto.quantita_residua - usato), lotto.id)
    const esistente = unisci
      ? (rigaEsistente.get(cottaId, lotto.id, materiaPrimaId) as
          | { id: number; quantita_usata: number }
          | undefined)
      : undefined
    if (esistente) aggiornaRiga.run(q6(esistente.quantita_usata + usato), esistente.id)
    else nuovaRiga.run(cottaId, lotto.id, materiaPrimaId, usato)
    rimanente = q6(rimanente - usato)
  }
  return rimanente
}

/** Rimette in magazzino `quantita`, partendo dagli ultimi lotti scaricati per la cotta. */
function restituisci(db: Db, cottaId: number, materiaPrimaId: number, quantita: number): void {
  const righe = db
    .prepare(
      `SELECT id, lotto_materia_prima_id, quantita_usata FROM cotta_materie_prime
       WHERE cotta_id = ? AND materia_prima_id = ? ORDER BY id DESC`
    )
    .all(cottaId, materiaPrimaId) as Array<{
    id: number
    lotto_materia_prima_id: number
    quantita_usata: number
  }>
  const ricarica = db.prepare(
    `UPDATE lotti_materie_prime SET quantita_residua = ROUND(quantita_residua + ?, 6) WHERE id = ?`
  )
  const riduci = db.prepare(`UPDATE cotta_materie_prime SET quantita_usata = ? WHERE id = ?`)
  const elimina = db.prepare(`DELETE FROM cotta_materie_prime WHERE id = ?`)

  let rimanente = q6(quantita)
  for (const riga of righe) {
    if (rimanente <= 0) break
    const preso = q6(Math.min(riga.quantita_usata, rimanente))
    ricarica.run(preso, riga.lotto_materia_prima_id)
    const resta = q6(riga.quantita_usata - preso)
    if (resta <= 0) elimina.run(riga.id)
    else riduci.run(resta, riga.id)
    rimanente = q6(rimanente - preso)
  }
}

/** Totale scaricato per materia prima, nell'ordine del primo scarico. */
function totaliCotta(db: Db, cottaId: number): Map<number, number> {
  const righe = db
    .prepare(
      `SELECT materia_prima_id AS id, SUM(quantita_usata) AS q FROM cotta_materie_prime
       WHERE cotta_id = ? GROUP BY materia_prima_id ORDER BY MIN(id)`
    )
    .all(cottaId) as Array<{ id: number; q: number }>
  return new Map(righe.map((r) => [r.id, q6(r.q)]))
}

function giacenza(db: Db, materiaPrimaId: number): number {
  const r = db
    .prepare(
      `SELECT COALESCE(SUM(quantita_residua), 0) AS g FROM lotti_materie_prime
       WHERE materia_prima_id = ? AND quantita_residua > 0`
    )
    .get(materiaPrimaId) as { g: number }
  return q6(r.g)
}

function comeEsito<T>(f: () => T): T | { ok: false; errore: string } {
  try {
    return f()
  } catch (e) {
    if (e instanceof ErroreUtente) return { ok: false, errore: e.message }
    throw e
  }
}

/**
 * Avvia una cotta e scarica gli ingredienti. Senza `ingredienti` usa la ricetta
 * esattamente come prima (giacenza insufficiente = scarico parziale + avviso);
 * con `ingredienti` scarica quelli e annota le variazioni rispetto alla ricetta.
 */
export function avviaCotta(
  db: Db,
  dati: AvviaCottaDati
): { ok: true; cotta_id: number; avvisi: string[] } | { ok: false; errore: string } {
  return comeEsito(() => {
    const esistente = db
      .prepare(`SELECT id FROM cotte WHERE numero_lotto = ?`)
      .get(dati.numero_lotto) as { id: number } | undefined
    if (esistente) {
      return { ok: false as const, errore: `Numero lotto "${dati.numero_lotto}" gia esistente` }
    }

    const ricetta = db
      .prepare(
        `SELECT materia_prima_id, quantita FROM ricetta_ingredienti WHERE ricetta_id = ? ORDER BY id`
      )
      .all(dati.ricetta_id) as Array<{ materia_prima_id: number; quantita: number }>
    const personalizzati = dati.ingredienti ? normalizza(db, dati.ingredienti) : null

    const avvisi: string[] = []
    const avvisa = (materiaPrimaId: number, rimanente: number): void => {
      if (rimanente <= 0) return
      const nome = leggiMateria(db, materiaPrimaId)?.nome ?? 'MP #' + materiaPrimaId
      avvisi.push(`Giacenza insufficiente per ${nome}: mancano ${rimanente}`)
    }

    let cottaId = 0
    db.transaction(() => {
      cottaId = Number(
        db
          .prepare(
            `INSERT INTO cotte (numero_lotto, birra_id, ricetta_id, data_inizio, litri_teorici, stato)
             VALUES (?, ?, ?, ?, ?, 'in_corso')`
          )
          .run(
            dati.numero_lotto,
            dati.birra_id,
            dati.ricetta_id,
            dati.data_inizio,
            dati.litri_teorici
          ).lastInsertRowid
      )

      if (!personalizzati) {
        for (const ing of ricetta)
          avvisa(
            ing.materia_prima_id,
            scaricaFifo(db, cottaId, ing.materia_prima_id, ing.quantita, false)
          )
        return
      }

      for (const [id, q] of personalizzati) avvisa(id, scaricaFifo(db, cottaId, id, q, true))
      const daRicetta = new Map<number, number>()
      for (const ing of ricetta)
        daRicetta.set(
          ing.materia_prima_id,
          q6((daRicetta.get(ing.materia_prima_id) ?? 0) + ing.quantita)
        )
      const variazioni = descriviVariazioni(db, daRicetta, personalizzati)
      if (variazioni) aggiungiNota(db, cottaId, `Variazioni rispetto alla ricetta: ${variazioni}`)
    })()

    return { ok: true as const, cotta_id: cottaId, avvisi }
  })
}

/** Ingredienti già scaricati per la cotta, uno per materia prima, con la giacenza attuale. */
export function ingredientiCotta(db: Db, cottaId: number): IngredienteCottaRiga[] {
  const righe = db
    .prepare(
      `SELECT cmp.materia_prima_id, mp.nome AS mp_nome, mp.unita_misura,
              COALESCE(mp.categoria, '') AS categoria, SUM(cmp.quantita_usata) AS quantita
       FROM cotta_materie_prime cmp
       JOIN materie_prime mp ON mp.id = cmp.materia_prima_id
       WHERE cmp.cotta_id = ?
       GROUP BY cmp.materia_prima_id
       ORDER BY mp.categoria, mp.nome`
    )
    .all(cottaId) as Array<Omit<IngredienteCottaRiga, 'giacenza'>>
  return righe.map((r) => ({
    ...r,
    quantita: q6(r.quantita),
    giacenza: giacenza(db, r.materia_prima_id)
  }))
}

/**
 * Porta gli ingredienti della cotta alle quantità richieste (lista completa:
 * ciò che manca viene tolto). Le quantità in più si scaricano dai lotti con
 * scadenza più vicina, quelle in meno tornano nei lotti da cui erano uscite.
 * Se la giacenza non basta non cambia nulla. Annota la modifica sulla cotta.
 */
export function modificaIngredientiCotta(
  db: Db,
  cottaId: number,
  nuovi: IngredienteRichiesto[],
  data: string = oggiIso()
): { ok: true } | { ok: false; errore: string } {
  return comeEsito(() => {
    const cotta = db.prepare(`SELECT id FROM cotte WHERE id = ?`).get(cottaId)
    if (!cotta) return { ok: false as const, errore: 'Cotta non trovata' }

    const richiesti = normalizza(db, nuovi)
    const attuali = totaliCotta(db, cottaId)
    const variazioni = descriviVariazioni(db, attuali, richiesti)
    if (!variazioni) return { ok: true as const }

    db.transaction(() => {
      const tutte = [...attuali.keys(), ...[...richiesti.keys()].filter((id) => !attuali.has(id))]
      for (const id of tutte) {
        const delta = q6((richiesti.get(id) ?? 0) - (attuali.get(id) ?? 0))
        if (delta < 0) restituisci(db, cottaId, id, -delta)
        else if (delta > 0) {
          const disponibile = giacenza(db, id)
          if (disponibile < delta) {
            const m = leggiMateria(db, id)
            const u = m?.unita_misura ?? ''
            throw new ErroreUtente(
              `Giacenza insufficiente per ${m?.nome ?? 'MP #' + id}: in magazzino ci sono ${fmt(disponibile)} ${u}, ne servono altri ${fmt(delta)} ${u}.`
            )
          }
          scaricaFifo(db, cottaId, id, delta, true)
        }
      }
      aggiungiNota(db, cottaId, `Modifica ingredienti del ${data}: ${variazioni}`)
    })()
    return { ok: true as const }
  })
}
