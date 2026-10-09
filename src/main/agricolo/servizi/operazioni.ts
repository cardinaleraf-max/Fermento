import type BetterSqlite3 from 'better-sqlite3'
import {
  CATEGORIE_PER_TIPO,
  PRODOTTO_OBBLIGATORIO,
  type OperazionePayload,
  type OperazioneRiga,
  type TipoOperazione
} from '../../../shared/agricolo'
import { aggiungiGiorni, doseEttaro, type TrattamentoCarenza } from '../calcoli'
import { ErroreUtente } from '../errori'
import { annullaConsumi, consumiDi, registraConsumi, scaricaPerMateria } from './magazzino'
import { dataObbligatoria, idObbligatorio, numeroPositivo, testoOpzionale } from './valida'

type Db = BetterSqlite3.Database

const TIPI: TipoOperazione[] = [
  'concimazione',
  'trattamento',
  'lavorazione',
  'irrigazione',
  'altro'
]

type RigaDb = Omit<OperazioneRiga, 'dose_ha' | 'fine_carenza' | 'lotti'>

export function listaOperazioni(
  db: Db,
  f: {
    stagione?: string | null
    campo_id?: number | null
    semina_id?: number | null
    tipo?: string | null
  }
): OperazioneRiga[] {
  const stagione = f.stagione ?? null
  const campo = f.campo_id ?? null
  const semina = f.semina_id ?? null
  const tipo = f.tipo ?? null
  const righe = db
    .prepare(
      `SELECT o.id, o.semina_id, s.campo_id, c.nome AS campo_nome, s.stagione, s.coltura, s.varieta,
              s.superficie_ha, o.tipo, o.data, o.materia_prima_id, mp.nome AS materia_prima_nome,
              mp.categoria, mp.unita_misura, o.quantita, mp.tempo_carenza_giorni, o.motivo, o.operatore, o.note
       FROM agri_operazioni o
       JOIN agri_semine s ON s.id = o.semina_id
       JOIN agri_campi c ON c.id = s.campo_id
       LEFT JOIN materie_prime mp ON mp.id = o.materia_prima_id
       WHERE (? IS NULL OR s.stagione = ?) AND (? IS NULL OR s.campo_id = ?)
         AND (? IS NULL OR o.semina_id = ?) AND (? IS NULL OR o.tipo = ?)
       ORDER BY o.data DESC, o.id DESC`
    )
    .all(stagione, stagione, campo, campo, semina, semina, tipo, tipo) as RigaDb[]
  return righe.map((r) => ({
    ...r,
    dose_ha: doseEttaro(r.quantita, r.superficie_ha),
    fine_carenza:
      r.tipo === 'trattamento' && r.tempo_carenza_giorni !== null && r.tempo_carenza_giorni > 0
        ? aggiungiGiorni(r.data, r.tempo_carenza_giorni)
        : null,
    lotti: consumiDi(db, 'operazione', r.id)
  }))
}

export function salvaOperazione(db: Db, id: number | null, p: OperazionePayload): number {
  const seminaId = idObbligatorio(p.semina_id, 'Semina')
  if (!db.prepare(`SELECT id FROM agri_semine WHERE id = ?`).get(seminaId)) {
    throw new ErroreUtente('Semina non trovata.')
  }
  if (!TIPI.includes(p.tipo)) throw new ErroreUtente('Tipo di operazione non valido.')
  const tipo = p.tipo
  const data = dataObbligatoria(p.data, "Data dell'operazione")

  let prodotto: { materia_prima_id: number; quantita: number; lotto_id: number | null } | null =
    null
  if (p.prodotto) {
    const mpId = idObbligatorio(p.prodotto.materia_prima_id, 'Prodotto')
    const mp = db.prepare(`SELECT nome, categoria FROM materie_prime WHERE id = ?`).get(mpId) as
      | { nome: string; categoria: string }
      | undefined
    if (!mp) throw new ErroreUtente('Prodotto non trovato.')
    if (!CATEGORIE_PER_TIPO[tipo].includes(mp.categoria)) {
      throw new ErroreUtente(
        tipo === 'trattamento'
          ? 'Per un trattamento scegli un fitofarmaco (o un prodotto "Altro input").'
          : tipo === 'concimazione'
            ? 'Per una concimazione scegli un concime (o un prodotto "Altro input").'
            : `"${mp.nome}" non è un input agricolo.`
      )
    }
    prodotto = {
      materia_prima_id: mpId,
      quantita: numeroPositivo(p.prodotto.quantita, 'Quantità'),
      lotto_id: p.prodotto.lotto_id ? idObbligatorio(p.prodotto.lotto_id, 'Lotto') : null
    }
  } else if (PRODOTTO_OBBLIGATORIO[tipo]) {
    throw new ErroreUtente(
      tipo === 'trattamento'
        ? 'Indica il fitofarmaco usato e la quantità.'
        : 'Indica il concime usato e la quantità.'
    )
  }

  const valori = [
    seminaId,
    tipo,
    data,
    prodotto?.materia_prima_id ?? null,
    prodotto?.quantita ?? null,
    testoOpzionale(p.motivo),
    testoOpzionale(p.operatore),
    testoOpzionale(p.note)
  ]

  return db.transaction((): number => {
    let opId: number
    if (id === null) {
      opId = Number(
        db
          .prepare(
            `INSERT INTO agri_operazioni (semina_id, tipo, data, materia_prima_id, quantita, motivo, operatore, note)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(...valori).lastInsertRowid
      )
    } else {
      const r = db
        .prepare(
          `UPDATE agri_operazioni SET semina_id = ?, tipo = ?, data = ?, materia_prima_id = ?, quantita = ?,
                  motivo = ?, operatore = ?, note = ?, aggiornato_il = CURRENT_TIMESTAMP WHERE id = ?`
        )
        .run(...valori, id)
      if (r.changes === 0) throw new ErroreUtente('Operazione non trovata.')
      opId = id
    }
    annullaConsumi(db, 'operazione', opId)
    if (prodotto) {
      const righe = scaricaPerMateria(
        db,
        prodotto.materia_prima_id,
        prodotto.quantita,
        prodotto.lotto_id
      )
      registraConsumi(db, 'operazione', opId, prodotto.materia_prima_id, righe)
    }
    return opId
  })()
}

export function eliminaOperazione(db: Db, id: number): void {
  db.transaction(() => {
    annullaConsumi(db, 'operazione', id)
    db.prepare(`DELETE FROM agri_operazioni WHERE id = ?`).run(id)
  })()
}

/** Trattamenti di una semina con tempo di carenza (per il controllo alla raccolta). */
export function trattamentiConCarenza(db: Db, seminaId: number): TrattamentoCarenza[] {
  return db
    .prepare(
      `SELECT o.data, mp.tempo_carenza_giorni AS giorni, mp.nome AS prodotto
       FROM agri_operazioni o JOIN materie_prime mp ON mp.id = o.materia_prima_id
       WHERE o.semina_id = ? AND o.tipo = 'trattamento' AND mp.tempo_carenza_giorni > 0
       ORDER BY o.data, o.id`
    )
    .all(seminaId) as TrattamentoCarenza[]
}
