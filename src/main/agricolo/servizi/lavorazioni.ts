import type BetterSqlite3 from 'better-sqlite3'
import type {
  CalibraturaPayload,
  Coltura,
  FaseLavorazione,
  InputDettaglio,
  LavorazioneDettaglio,
  LavorazioneRiga,
  MaltazioneAvviaPayload,
  MaltazioneChiudiPayload,
  OutputDettaglio,
  RaccoltaPayload,
  Rese,
  StatoLavorazione,
  ViolazioneCarenzaRiga
} from '../../../shared/agricolo'
import { aggiungiMesi, calcolaFrazioni, calcolaRese, erroriFrazioni, violazioniCarenza } from '../calcoli'
import { ErroreUtente } from '../errori'
import { EPS, aKg, arrotonda, converti, daKg } from '../unita'
import { creaLotto, leggiLotto, lottoUsatoAValle, ripristinaLotto, scaricaLotto } from './magazzino'
import { trattamentiConCarenza } from './operazioni'
import { shelfLifeMaltoMesi } from './config'
import { configParametri, valoriLavorazione, valoriLeggibili, valoriStorici } from './parametri'
import {
  dataObbligatoria,
  dataOpzionale,
  idObbligatorio,
  numeroPositivo,
  stagioneObbligatoria,
  testoObbligatorio,
  testoOpzionale
} from './valida'

type Db = BetterSqlite3.Database

/**
 * Lavorazioni del modulo agricolo con un modello unico: lotti in ingresso →
 * lotti in uscita + parametri. Raccolta, analisi e calibratura, maltazione.
 * Ogni operazione che tocca più tabelle è in una singola transazione.
 */

function fmt(n: number): string {
  return arrotonda(n).toLocaleString('it-IT')
}

function materiaPrima(db: Db, id: number): { id: number; nome: string; categoria: string; unita_misura: string } {
  const mp = db.prepare(`SELECT id, nome, categoria, unita_misura FROM materie_prime WHERE id = ?`).get(id) as
    | { id: number; nome: string; categoria: string; unita_misura: string }
    | undefined
  if (!mp) throw new ErroreUtente('Materia prima non trovata.')
  return mp
}

// ── Parti comuni ─────────────────────────────────────────────────────────────

/** Perché una lavorazione non si può più modificare o eliminare (lotti prodotti già usati). */
export function bloccoLavorazione(db: Db, id: number): string | null {
  const uscite = db
    .prepare(`SELECT lotto_id FROM agri_lavorazione_output WHERE lavorazione_id = ? AND lotto_id IS NOT NULL`)
    .all(id) as Array<{ lotto_id: number }>
  for (const u of uscite) {
    const motivo = lottoUsatoAValle(db, u.lotto_id)
    if (motivo) return motivo.charAt(0).toUpperCase() + motivo.slice(1) + '.'
  }
  return null
}

/** Annulla gli effetti di magazzino di una lavorazione (da chiamare in transazione, dopo il controllo di blocco). */
function annullaEffetti(db: Db, id: number): void {
  const ingressi = db
    .prepare(`SELECT lotto_id, quantita FROM agri_lavorazione_input WHERE lavorazione_id = ?`)
    .all(id) as Array<{ lotto_id: number; quantita: number }>
  for (const i of ingressi) ripristinaLotto(db, i.lotto_id, i.quantita)
  db.prepare(`DELETE FROM agri_lavorazione_input WHERE lavorazione_id = ?`).run(id)
  const lotti = db
    .prepare(`SELECT lotto_id FROM agri_lavorazione_output WHERE lavorazione_id = ? AND lotto_id IS NOT NULL`)
    .all(id) as Array<{ lotto_id: number }>
  db.prepare(`DELETE FROM agri_lavorazione_output WHERE lavorazione_id = ?`).run(id)
  const del = db.prepare(`DELETE FROM lotti_materie_prime WHERE id = ?`)
  for (const l of lotti) del.run(l.lotto_id)
}

function verificaModificabile(db: Db, id: number, tipo: FaseLavorazione): void {
  const lav = db.prepare(`SELECT tipo FROM agri_lavorazioni WHERE id = ?`).get(id) as { tipo: string } | undefined
  if (!lav || lav.tipo !== tipo) throw new ErroreUtente('Lavorazione non trovata.')
  const blocco = bloccoLavorazione(db, id)
  if (blocco) throw new ErroreUtente(`Non si può modificare: ${blocco.charAt(0).toLowerCase()}${blocco.slice(1)}`)
}

export function eliminaLavorazione(db: Db, id: number): void {
  const lav = db.prepare(`SELECT tipo FROM agri_lavorazioni WHERE id = ?`).get(id)
  if (!lav) throw new ErroreUtente('Lavorazione non trovata.')
  const blocco = bloccoLavorazione(db, id)
  if (blocco) throw new ErroreUtente(`Non si può eliminare: ${blocco.charAt(0).toLowerCase()}${blocco.slice(1)}`)
  db.transaction(() => {
    annullaEffetti(db, id)
    db.prepare(`DELETE FROM agri_valori_parametri WHERE lavorazione_id = ?`).run(id)
    db.prepare(`DELETE FROM agri_date_gruppi WHERE lavorazione_id = ?`).run(id)
    db.prepare(`DELETE FROM agri_lavorazioni WHERE id = ?`).run(id)
  })()
}

function codiceLottoLibero(db: Db, materiaPrimaId: number, codice: string, escludiLotto: number | null = null): boolean {
  return !db
    .prepare(`SELECT 1 FROM lotti_materie_prime WHERE materia_prima_id = ? AND lotto_fornitore = ? COLLATE NOCASE AND id IS NOT ?`)
    .get(materiaPrimaId, codice, escludiLotto)
}

/** "1A/2026 3-4 mm", e se esiste già "1A/2026 3-4 mm (2)", "(3)"… */
function codiceUnico(db: Db, materiaPrimaId: number, base: string): string {
  if (codiceLottoLibero(db, materiaPrimaId, base)) return base
  for (let n = 2; n < 1000; n++) {
    const c = `${base} (${n})`
    if (codiceLottoLibero(db, materiaPrimaId, c)) return c
  }
  return `${base} (${Date.now()})`
}

// ── Raccolta ─────────────────────────────────────────────────────────────────

const CATEGORIE_RACCOLTA: Record<Coltura, string[]> = {
  orzo: ['orzo_grezzo'],
  luppolo: ['luppolo_grezzo', 'luppolo']
}

export function verificaCarenza(db: Db, seminaId: number, data: string): ViolazioneCarenzaRiga[] {
  return violazioniCarenza(data, trattamentiConCarenza(db, seminaId)).map((v) => ({
    prodotto: v.prodotto,
    data: v.data,
    giorni: v.giorni,
    fine_carenza: v.fine_carenza
  }))
}

export function salvaRaccolta(db: Db, id: number | null, p: RaccoltaPayload): number {
  const seminaId = idObbligatorio(p.semina_id, 'Semina')
  const semina = db.prepare(`SELECT id, coltura, data FROM agri_semine WHERE id = ?`).get(seminaId) as
    | { id: number; coltura: Coltura; data: string }
    | undefined
  if (!semina) throw new ErroreUtente('Semina non trovata.')
  const data = dataObbligatoria(p.data, 'Data di raccolta')
  if (data < semina.data) throw new ErroreUtente('La data di raccolta è precedente alla data di semina.')
  const stagione = stagioneObbligatoria(p.stagione)
  const mp = materiaPrima(db, idObbligatorio(p.materia_prima_id, 'Materia prima'))
  if (!CATEGORIE_RACCOLTA[semina.coltura].includes(mp.categoria)) {
    throw new ErroreUtente(
      semina.coltura === 'orzo'
        ? 'Il raccolto di orzo va caricato su una materia prima di categoria "Orzo grezzo".'
        : 'Il raccolto di luppolo va caricato su una materia prima di categoria "Luppolo grezzo" o "Luppolo".'
    )
  }
  const quantita = numeroPositivo(p.quantita, 'Quantità raccolta')
  const codice = testoObbligatorio(p.codice, 'Codice lotto')
  const scadenza = dataOpzionale(p.data_scadenza, 'Scadenza')
  const note = testoOpzionale(p.note)

  return db.transaction((): number => {
    let lavId: number
    if (id === null) {
      lavId = Number(
        db
          .prepare(
            `INSERT INTO agri_lavorazioni (tipo, stagione, codice, data_inizio, data_fine, stato, semina_id, materia_prima_id, note)
             VALUES ('raccolta', ?, ?, ?, ?, 'chiusa', ?, ?, ?)`
          )
          .run(stagione, codice, data, data, seminaId, mp.id, note).lastInsertRowid
      )
    } else {
      verificaModificabile(db, id, 'raccolta')
      annullaEffetti(db, id)
      db.prepare(
        `UPDATE agri_lavorazioni SET stagione = ?, codice = ?, data_inizio = ?, data_fine = ?, semina_id = ?,
                materia_prima_id = ?, note = ?, aggiornato_il = CURRENT_TIMESTAMP WHERE id = ?`
      ).run(stagione, codice, data, data, seminaId, mp.id, note, id)
      lavId = id
    }
    if (!codiceLottoLibero(db, mp.id, codice)) {
      throw new ErroreUtente(`Esiste già un lotto "${codice}" di ${mp.nome}: usa un codice diverso.`)
    }
    const lottoId = creaLotto(db, {
      materia_prima_id: mp.id,
      codice,
      data_carico: data,
      data_scadenza: scadenza,
      quantita,
      origine_tipo: 'raccolta',
      origine_id: lavId,
      stagione,
      calibro: null,
      note
    })
    db.prepare(
      `INSERT INTO agri_lavorazione_output (lavorazione_id, ordine, nome, quantita, quantita_kg, scarto, lotto_id)
       VALUES (?, 1, NULL, ?, ?, 0, ?)`
    ).run(lavId, quantita, aKg(quantita, mp.unita_misura), lottoId)
    return lavId
  })()
}

// ── Analisi e calibratura ────────────────────────────────────────────────────

export function salvaCalibratura(db: Db, id: number | null, p: CalibraturaPayload): number {
  const lottoId = idObbligatorio(p.lotto_id, 'Lotto di orzo grezzo')
  const data = dataObbligatoria(p.data, 'Data')
  const stagione = stagioneObbligatoria(p.stagione)
  const quantita = numeroPositivo(p.quantita, 'Quantità lavorata')
  const dest = materiaPrima(db, idObbligatorio(p.materia_prima_id, 'Materia prima di destinazione'))
  if (dest.categoria !== 'orzo_calibrato') {
    throw new ErroreUtente('Le frazioni calibrate vanno caricate su una materia prima di categoria "Orzo calibrato".')
  }
  const frazioni = (Array.isArray(p.frazioni) ? p.frazioni : []).map((f) => ({
    nome: typeof f.nome === 'string' ? f.nome.trim() : '',
    percentuale: Number(f.percentuale),
    scarto: f.scarto === true,
    peso_specifico_gl:
      f.peso_specifico_gl === null || f.peso_specifico_gl === undefined ? null : Number(f.peso_specifico_gl)
  }))
  const errori = erroriFrazioni(frazioni)
  if (errori.length > 0) throw new ErroreUtente(errori.join(' '))
  const note = testoOpzionale(p.note)

  return db.transaction((): number => {
    let lavId: number
    if (id !== null) {
      verificaModificabile(db, id, 'calibratura')
      annullaEffetti(db, id)
    }
    const grezzo = leggiLotto(db, lottoId)
    if (!grezzo) throw new ErroreUtente('Lotto di orzo grezzo non trovato.')
    const mpGrezzo = materiaPrima(db, grezzo.materia_prima_id)
    if (mpGrezzo.categoria !== 'orzo_grezzo') {
      throw new ErroreUtente('Si possono calibrare solo lotti di categoria "Orzo grezzo".')
    }
    if (grezzo.quantita_residua + EPS < quantita) {
      throw new ErroreUtente(
        `Il lotto ${grezzo.lotto_fornitore || '#' + grezzo.id} ha solo ${fmt(grezzo.quantita_residua)} ${mpGrezzo.unita_misura} disponibili.`
      )
    }
    if (converti(1, mpGrezzo.unita_misura, dest.unita_misura) === null) {
      throw new ErroreUtente(
        `Le unità di misura non sono compatibili (${mpGrezzo.unita_misura} → ${dest.unita_misura}): usa kg, q o g per l'orzo.`
      )
    }
    const codiceGrezzo = grezzo.lotto_fornitore || `#${grezzo.id}`
    if (id === null) {
      lavId = Number(
        db
          .prepare(
            `INSERT INTO agri_lavorazioni (tipo, stagione, codice, data_inizio, data_fine, stato, materia_prima_id, note)
             VALUES ('calibratura', ?, ?, ?, ?, 'chiusa', ?, ?)`
          )
          .run(stagione, codiceGrezzo, data, data, dest.id, note).lastInsertRowid
      )
    } else {
      db.prepare(
        `UPDATE agri_lavorazioni SET stagione = ?, codice = ?, data_inizio = ?, data_fine = ?, materia_prima_id = ?,
                note = ?, aggiornato_il = CURRENT_TIMESTAMP WHERE id = ?`
      ).run(stagione, codiceGrezzo, data, data, dest.id, note, id)
      lavId = id
    }

    scaricaLotto(db, lottoId, quantita)
    db.prepare(
      `INSERT INTO agri_lavorazione_input (lavorazione_id, lotto_id, quantita, quantita_kg) VALUES (?, ?, ?, ?)`
    ).run(lavId, lottoId, quantita, aKg(quantita, mpGrezzo.unita_misura))

    const esito = calcolaFrazioni(quantita, frazioni)
    const scadenza = (db.prepare(`SELECT data_scadenza FROM lotti_materie_prime WHERE id = ?`).get(lottoId) as {
      data_scadenza: string | null
    }).data_scadenza
    const insOut = db.prepare(
      `INSERT INTO agri_lavorazione_output
         (lavorazione_id, ordine, nome, percentuale, quantita, quantita_kg, scarto, peso_specifico_gl, lotto_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    esito.righe.forEach((r, i) => {
      const qDest = arrotonda(converti(r.quantita, mpGrezzo.unita_misura, dest.unita_misura) ?? 0, 6)
      let lottoOut: number | null = null
      if (!r.scarto && qDest > EPS) {
        lottoOut = creaLotto(db, {
          materia_prima_id: dest.id,
          codice: codiceUnico(db, dest.id, `${codiceGrezzo} ${r.nome}`),
          data_carico: data,
          data_scadenza: scadenza,
          quantita: qDest,
          origine_tipo: 'calibratura',
          origine_id: lavId,
          stagione,
          calibro: r.nome,
          note: null
        })
      }
      insOut.run(
        lavId,
        i + 1,
        r.nome,
        r.percentuale,
        qDest,
        aKg(r.quantita, mpGrezzo.unita_misura),
        r.scarto ? 1 : 0,
        r.peso_specifico_gl,
        lottoOut
      )
    })
    return lavId
  })()
}

// ── Lettura ──────────────────────────────────────────────────────────────────

type TestataDb = {
  id: number
  tipo: FaseLavorazione
  stagione: string
  codice: string | null
  data_inizio: string
  data_fine: string | null
  stato: StatoLavorazione
  materia_prima_id: number | null
  materia_prima_nome: string | null
  unita_misura: string | null
  semina_id: number | null
  campo_nome: string | null
  coltura: Coltura | null
  varieta: string | null
  note: string | null
}

const SELECT_TESTATA = `
  SELECT lv.id, lv.tipo, lv.stagione, lv.codice, lv.data_inizio, lv.data_fine, lv.stato,
         lv.materia_prima_id, mp.nome AS materia_prima_nome, mp.unita_misura,
         lv.semina_id, c.nome AS campo_nome, s.coltura, s.varieta, lv.note
  FROM agri_lavorazioni lv
  LEFT JOIN materie_prime mp ON mp.id = lv.materia_prima_id
  LEFT JOIN agri_semine s ON s.id = lv.semina_id
  LEFT JOIN agri_campi c ON c.id = s.campo_id`

function ingressi(db: Db, id: number): InputDettaglio[] {
  return db
    .prepare(
      `SELECT i.id, i.lotto_id, COALESCE(l.lotto_fornitore, '') AS codice, mp.nome AS materia_prima_nome,
              mp.categoria, mp.unita_misura, l.calibro, l.stagione, i.quantita, i.quantita_kg
       FROM agri_lavorazione_input i
       JOIN lotti_materie_prime l ON l.id = i.lotto_id
       JOIN materie_prime mp ON mp.id = l.materia_prima_id
       WHERE i.lavorazione_id = ? ORDER BY i.id`
    )
    .all(id) as InputDettaglio[]
}

function uscite(db: Db, id: number, conUso: boolean): OutputDettaglio[] {
  const righe = db
    .prepare(
      `SELECT o.id, o.ordine, o.nome, o.percentuale, o.quantita, o.quantita_kg, o.scarto, o.peso_specifico_gl,
              o.lotto_id, l.lotto_fornitore AS lotto_codice, l.quantita_residua AS lotto_residuo,
              COALESCE(mp.unita_misura, mpl.unita_misura) AS unita_misura
       FROM agri_lavorazione_output o
       JOIN agri_lavorazioni lv ON lv.id = o.lavorazione_id
       LEFT JOIN lotti_materie_prime l ON l.id = o.lotto_id
       LEFT JOIN materie_prime mpl ON mpl.id = l.materia_prima_id
       LEFT JOIN materie_prime mp ON mp.id = lv.materia_prima_id
       WHERE o.lavorazione_id = ? ORDER BY o.ordine, o.id`
    )
    .all(id) as Array<Omit<OutputDettaglio, 'scarto' | 'uso_a_valle'> & { scarto: number }>
  return righe.map((r) => ({
    ...r,
    scarto: r.scarto === 1,
    uso_a_valle: conUso && r.lotto_id !== null ? lottoUsatoAValle(db, r.lotto_id) : null
  }))
}

function descriviIngressi(inp: InputDettaglio[]): string {
  return inp
    .map((i) => `${i.codice || '#' + i.lotto_id} (${fmt(i.quantita)} ${i.unita_misura})`)
    .join(' · ')
}

function descriviUscite(tipo: FaseLavorazione, out: OutputDettaglio[]): string {
  if (tipo === 'calibratura') {
    const utili = out.filter((o) => !o.scarto && o.quantita > EPS)
    return utili.map((o) => `${o.nome} ${fmt(o.quantita)} ${o.unita_misura ?? ''}`.trim()).join(' · ')
  }
  return out
    .filter((o) => o.lotto_id !== null)
    .map((o) => `${o.lotto_codice ?? ''} ${fmt(o.quantita)} ${o.unita_misura ?? ''}`.trim())
    .join(' · ')
}

function riepilogoParametri(db: Db, id: number): string {
  return valoriLeggibili(db, id)
    .slice(0, 3)
    .map((v) => {
      const valore =
        v.tipo === 'si_no' ? (v.valore === 'si' ? 'sì' : 'no') : v.tipo === 'numero' ? v.valore.replace('.', ',') : v.valore
      return `${v.parametro} ${valore}${v.tipo === 'numero' && v.unita ? (v.unita === '%' ? '%' : ` ${v.unita}`) : ''}`
    })
    .join(' · ')
}

// ── Rese ─────────────────────────────────────────────────────────────────────

/**
 * Rese di una maltazione: resa di maltazione (kg malto / kg orzo calibrato) e
 * resa complessiva rispetto all'orzo grezzo, ricostruendo per ogni lotto di
 * orzo calibrato la quota utile della sua calibratura d'origine (proporzionale
 * se la maltazione usa più lotti).
 */
export function reseMaltazione(db: Db, id: number): Rese {
  const ingr = db
    .prepare(
      `SELECT i.quantita_kg, l.origine_tipo, l.origine_id FROM agri_lavorazione_input i
       JOIN lotti_materie_prime l ON l.id = i.lotto_id WHERE i.lavorazione_id = ?`
    )
    .all(id) as Array<{ quantita_kg: number | null; origine_tipo: string; origine_id: number | null }>
  const quote = db.prepare(
    `SELECT
       (SELECT SUM(quantita_kg) FROM agri_lavorazione_input WHERE lavorazione_id = ?) AS grezzo,
       (SELECT SUM(quantita_kg) FROM agri_lavorazione_output WHERE lavorazione_id = ? AND scarto = 0) AS utile,
       (SELECT SUM(quantita_kg) FROM agri_lavorazione_output WHERE lavorazione_id = ? AND scarto = 1) AS scarto`
  )
  const input = ingr.map((i) => {
    let quotaUtile: number | null = null
    let quotaScarto: number | null = null
    if (i.origine_tipo === 'calibratura' && i.origine_id !== null) {
      const q = quote.get(i.origine_id, i.origine_id, i.origine_id) as {
        grezzo: number | null
        utile: number | null
        scarto: number | null
      }
      if (q.grezzo && q.grezzo > 0) {
        quotaUtile = (q.utile ?? 0) / q.grezzo
        quotaScarto = (q.scarto ?? 0) / q.grezzo
      }
    }
    return { kg: i.quantita_kg ?? 0, quota_utile: quotaUtile, quota_scarto: quotaScarto }
  })
  const pesoIniziale = input.reduce((s, i) => s + i.kg, 0)
  const finale = db
    .prepare(
      `SELECT SUM(quantita_kg) AS kg FROM agri_lavorazione_output WHERE lavorazione_id = ? AND scarto = 0 AND lotto_id IS NOT NULL`
    )
    .get(id) as { kg: number | null }
  return calcolaRese(pesoIniziale, finale.kg ?? null, input)
}

function componiRiga(db: Db, t: TestataDb): LavorazioneRiga & { _in: InputDettaglio[]; _out: OutputDettaglio[] } {
  const inp = ingressi(db, t.id)
  const out = uscite(db, t.id, false)
  const sommaKg = (xs: Array<{ quantita_kg: number | null }>): number | null =>
    xs.every((x) => x.quantita_kg !== null) && xs.length > 0
      ? arrotonda(xs.reduce((s, x) => s + (x.quantita_kg ?? 0), 0))
      : null
  return {
    ...t,
    input_kg: sommaKg(inp),
    output_kg: sommaKg(out.filter((o) => !o.scarto)),
    input_descrizione: descriviIngressi(inp),
    output_descrizione: descriviUscite(t.tipo, out),
    riepilogo_parametri: riepilogoParametri(db, t.id),
    carenza: t.tipo === 'raccolta' && t.semina_id !== null ? verificaCarenza(db, t.semina_id, t.data_inizio) : [],
    rese: t.tipo === 'maltazione' ? reseMaltazione(db, t.id) : null,
    _in: inp,
    _out: out
  }
}

export function listaLavorazioni(
  db: Db,
  f: { tipo: FaseLavorazione; stagione?: string | null; stato?: StatoLavorazione | null }
): LavorazioneRiga[] {
  const stagione = f.stagione ?? null
  const stato = f.stato ?? null
  const testate = db
    .prepare(
      `${SELECT_TESTATA}
       WHERE lv.tipo = ? AND (? IS NULL OR lv.stagione = ?) AND (? IS NULL OR lv.stato = ?)
       ORDER BY CASE lv.stato WHEN 'in_corso' THEN 0 ELSE 1 END, lv.data_inizio DESC, lv.id DESC`
    )
    .all(f.tipo, stagione, stagione, stato, stato) as TestataDb[]
  return testate.map((t) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { _in, _out, ...riga } = componiRiga(db, t)
    return riga
  })
}

export function dettaglioLavorazione(db: Db, id: number): LavorazioneDettaglio {
  const t = db.prepare(`${SELECT_TESTATA} WHERE lv.id = ?`).get(id) as TestataDb | undefined
  if (!t) throw new ErroreUtente('Lavorazione non trovata.')
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { _in, _out, ...riga } = componiRiga(db, t)
  const out = uscite(db, id, true)
  const primoLotto = out.find((o) => o.lotto_id !== null)
  const scadenza = primoLotto
    ? ((db.prepare(`SELECT data_scadenza FROM lotti_materie_prime WHERE id = ?`).get(primoLotto.lotto_id) as {
        data_scadenza: string | null
      }).data_scadenza ?? null)
    : null
  return {
    ...riga,
    input: _in,
    output: out,
    gruppi: configParametri(db, t.tipo),
    valori: valoriLavorazione(db, id),
    valori_storici: valoriStorici(db, id),
    bloccata: bloccoLavorazione(db, id),
    data_scadenza_output: scadenza
  }
}

// ── Maltazione ───────────────────────────────────────────────────────────────

type Chiusura = { data_uscita: string; peso_finale_kg: number; data_scadenza: string | null }

export function scadenzaMaltoProposta(db: Db, dataUscita: string): string {
  return aggiungiMesi(dataUscita, shelfLifeMaltoMesi(db))
}

function chiusuraAttuale(db: Db, id: number): Chiusura | null {
  const lav = db.prepare(`SELECT stato, data_fine FROM agri_lavorazioni WHERE id = ?`).get(id) as
    | { stato: StatoLavorazione; data_fine: string | null }
    | undefined
  if (!lav || lav.stato !== 'chiusa' || !lav.data_fine) return null
  const out = db
    .prepare(
      `SELECT o.quantita_kg, l.data_scadenza FROM agri_lavorazione_output o
       LEFT JOIN lotti_materie_prime l ON l.id = o.lotto_id
       WHERE o.lavorazione_id = ? AND o.lotto_id IS NOT NULL LIMIT 1`
    )
    .get(id) as { quantita_kg: number | null; data_scadenza: string | null } | undefined
  if (!out || out.quantita_kg === null) return null
  return { data_uscita: lav.data_fine, peso_finale_kg: out.quantita_kg, data_scadenza: out.data_scadenza }
}

/** Crea il lotto di malto e chiude la maltazione (da chiamare in transazione). */
function applicaChiusura(db: Db, id: number, c: Chiusura): number {
  const lav = db
    .prepare(`SELECT codice, stagione, materia_prima_id, data_inizio FROM agri_lavorazioni WHERE id = ?`)
    .get(id) as { codice: string; stagione: string; materia_prima_id: number; data_inizio: string }
  if (c.data_uscita < lav.data_inizio) {
    throw new ErroreUtente("La data di uscita non può essere precedente all'inizio della maltazione.")
  }
  const malto = materiaPrima(db, lav.materia_prima_id)
  const quantita = daKg(c.peso_finale_kg, malto.unita_misura)
  if (quantita === null) {
    throw new ErroreUtente(`L'unità del malto "${malto.nome}" (${malto.unita_misura}) non è un peso: usa kg o q.`)
  }
  if (!codiceLottoLibero(db, malto.id, lav.codice)) {
    throw new ErroreUtente(`Esiste già un lotto "${lav.codice}" di ${malto.nome}: cambia il codice della maltazione.`)
  }
  const lottoId = creaLotto(db, {
    materia_prima_id: malto.id,
    codice: lav.codice,
    data_carico: c.data_uscita,
    data_scadenza: c.data_scadenza ?? scadenzaMaltoProposta(db, c.data_uscita),
    quantita,
    origine_tipo: 'maltazione',
    origine_id: id,
    stagione: lav.stagione,
    calibro: null,
    note: null
  })
  db.prepare(
    `INSERT INTO agri_lavorazione_output (lavorazione_id, ordine, nome, quantita, quantita_kg, scarto, lotto_id)
     VALUES (?, 1, NULL, ?, ?, 0, ?)`
  ).run(id, quantita, c.peso_finale_kg, lottoId)
  db.prepare(
    `UPDATE agri_lavorazioni SET stato = 'chiusa', data_fine = ?, aggiornato_il = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(c.data_uscita, id)
  return lottoId
}

/** Toglie il lotto di malto e riporta la maltazione "in corso" (da chiamare in transazione). */
function togliChiusura(db: Db, id: number): void {
  const lotti = db
    .prepare(`SELECT lotto_id FROM agri_lavorazione_output WHERE lavorazione_id = ? AND lotto_id IS NOT NULL`)
    .all(id) as Array<{ lotto_id: number }>
  db.prepare(`DELETE FROM agri_lavorazione_output WHERE lavorazione_id = ?`).run(id)
  const del = db.prepare(`DELETE FROM lotti_materie_prime WHERE id = ?`)
  for (const l of lotti) del.run(l.lotto_id)
  db.prepare(
    `UPDATE agri_lavorazioni SET stato = 'in_corso', data_fine = NULL, aggiornato_il = CURRENT_TIMESTAMP WHERE id = ?`
  ).run(id)
}

/**
 * Avvia (o modifica) una maltazione: scarica dal magazzino i lotti di orzo
 * calibrato indicati. Il malto entra in magazzino solo alla chiusura. Se la
 * maltazione era già chiusa (e il malto non è stato usato) il lotto di malto
 * viene ricreato con gli stessi dati di chiusura.
 */
export function avviaMaltazione(db: Db, id: number | null, p: MaltazioneAvviaPayload): number {
  const dataInizio = dataObbligatoria(p.data_inizio, 'Data di inizio')
  const stagione = stagioneObbligatoria(p.stagione)
  const codice = testoObbligatorio(p.codice, 'Codice lotto')
  const malto = materiaPrima(db, idObbligatorio(p.materia_prima_id, 'Tipo di malto'))
  if (malto.categoria !== 'malto') {
    throw new ErroreUtente('Il tipo di malto deve essere una materia prima della categoria "malto".')
  }
  if (daKg(1, malto.unita_misura) === null) {
    throw new ErroreUtente(`L'unità del malto "${malto.nome}" (${malto.unita_misura}) non è un peso: usa kg o q.`)
  }
  const ingressi = Array.isArray(p.input) ? p.input : []
  if (ingressi.length === 0) throw new ErroreUtente("Aggiungi almeno un lotto di orzo calibrato.")
  const perLotto = new Map<number, number>()
  for (const i of ingressi) {
    const lottoId = idObbligatorio(i.lotto_id, 'Lotto di orzo calibrato')
    const kg = numeroPositivo(i.kg, 'Peso orzo (kg)')
    perLotto.set(lottoId, arrotonda((perLotto.get(lottoId) ?? 0) + kg, 6))
  }
  const note = testoOpzionale(p.note)
  const doppio = db
    .prepare(`SELECT id FROM agri_lavorazioni WHERE tipo = 'maltazione' AND codice = ? COLLATE NOCASE AND id IS NOT ?`)
    .get(codice, id)
  if (doppio) throw new ErroreUtente(`Esiste già una maltazione con codice "${codice}".`)

  return db.transaction((): number => {
    let lavId: number
    let chiusura: Chiusura | null = null
    if (id !== null) {
      verificaModificabile(db, id, 'maltazione')
      chiusura = chiusuraAttuale(db, id)
      annullaEffetti(db, id)
      db.prepare(
        `UPDATE agri_lavorazioni SET stagione = ?, codice = ?, data_inizio = ?, materia_prima_id = ?, note = ?,
                stato = 'in_corso', data_fine = NULL, aggiornato_il = CURRENT_TIMESTAMP WHERE id = ?`
      ).run(stagione, codice, dataInizio, malto.id, note, id)
      lavId = id
    } else {
      lavId = Number(
        db
          .prepare(
            `INSERT INTO agri_lavorazioni (tipo, stagione, codice, data_inizio, stato, materia_prima_id, note)
             VALUES ('maltazione', ?, ?, ?, 'in_corso', ?, ?)`
          )
          .run(stagione, codice, dataInizio, malto.id, note).lastInsertRowid
      )
    }
    const insIn = db.prepare(
      `INSERT INTO agri_lavorazione_input (lavorazione_id, lotto_id, quantita, quantita_kg) VALUES (?, ?, ?, ?)`
    )
    for (const [lottoId, kg] of perLotto) {
      const l = leggiLotto(db, lottoId)
      if (!l) throw new ErroreUtente('Lotto di orzo calibrato non trovato.')
      const mp = materiaPrima(db, l.materia_prima_id)
      if (mp.categoria !== 'orzo_calibrato') {
        throw new ErroreUtente(`Il lotto ${l.lotto_fornitore || '#' + l.id} non è orzo calibrato.`)
      }
      const quantita = daKg(kg, mp.unita_misura)
      if (quantita === null) throw new ErroreUtente(`L'unità di ${mp.nome} non è un peso.`)
      scaricaLotto(db, lottoId, quantita)
      insIn.run(lavId, lottoId, quantita, kg)
    }
    if (chiusura) applicaChiusura(db, lavId, chiusura)
    return lavId
  })()
}

/** Chiude la maltazione (o corregge la chiusura): crea il lotto di malto in magazzino. */
export function chiudiMaltazione(db: Db, id: number, p: MaltazioneChiudiPayload): number {
  const lav = db.prepare(`SELECT tipo, stato FROM agri_lavorazioni WHERE id = ?`).get(id) as
    | { tipo: string; stato: StatoLavorazione }
    | undefined
  if (!lav || lav.tipo !== 'maltazione') throw new ErroreUtente('Maltazione non trovata.')
  const chiusura: Chiusura = {
    data_uscita: dataObbligatoria(p.data_uscita, 'Data di uscita'),
    peso_finale_kg: numeroPositivo(p.peso_finale_kg, 'Peso finale'),
    data_scadenza: dataOpzionale(p.data_scadenza, 'Scadenza')
  }
  return db.transaction((): number => {
    if (lav.stato === 'chiusa') {
      verificaModificabile(db, id, 'maltazione')
      togliChiusura(db, id)
    }
    return applicaChiusura(db, id, chiusura)
  })()
}

/** Riporta "in corso" una maltazione chiusa, se il malto non è ancora stato usato. */
export function riapriMaltazione(db: Db, id: number): void {
  const lav = db.prepare(`SELECT tipo, stato FROM agri_lavorazioni WHERE id = ?`).get(id) as
    | { tipo: string; stato: StatoLavorazione }
    | undefined
  if (!lav || lav.tipo !== 'maltazione') throw new ErroreUtente('Maltazione non trovata.')
  if (lav.stato !== 'chiusa') return
  const blocco = bloccoLavorazione(db, id)
  if (blocco) throw new ErroreUtente(`Non si può riaprire: ${blocco.charAt(0).toLowerCase()}${blocco.slice(1)}`)
  db.transaction(() => togliChiusura(db, id))()
}

export function maltazioniInCorso(db: Db): LavorazioneRiga[] {
  return listaLavorazioni(db, { tipo: 'maltazione', stato: 'in_corso' })
}
