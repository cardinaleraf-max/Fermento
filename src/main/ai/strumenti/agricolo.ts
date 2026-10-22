/**
 * Strumenti di Bira sul modulo agricolo (filiera campo → malto → birra).
 * Disponibili solo a modulo acceso; riusano i servizi delle schermate.
 * Mai il riferimento catastale dei campi.
 */
import {
  CATEGORIE_INPUT_AGRICOLI,
  CATEGORIE_MP_AGRICOLE,
  ETICHETTE_CATEGORIA,
  type FaseLavorazione,
  type NodoTraccia,
  type Rese
} from '../../../shared/agricolo'
import { listaCampi, listaSemine } from '../../agricolo/servizi/campi'
import { listaOperazioni } from '../../agricolo/servizi/operazioni'
import { dettaglioLavorazione, listaLavorazioni } from '../../agricolo/servizi/lavorazioni'
import { valoriLeggibili } from '../../agricolo/servizi/parametri'
import { cercaPartenze, traccia } from '../../agricolo/servizi/tracciabilita'
import { asString, testo, type Db, type ToolDefinition } from './comuni'

const FASI: FaseLavorazione[] = ['raccolta', 'calibratura', 'maltazione']
const DETTAGLI_ESCLUSI = new Set(['Riferimento catastale'])

const percento = (v: number | null): number | null =>
  v === null ? null : Math.round(v * 1000) / 10

/** Rese in percentuale: il modello non deve convertire frazioni. */
function resePercento(r: Rese | null): Record<string, unknown> | null {
  if (!r) return null
  return {
    resa_maltazione_percento: percento(r.resa_maltazione),
    resa_complessiva_percento: percento(r.resa_complessiva),
    kg_grezzo_equivalenti: r.kg_grezzo_equivalenti,
    scarto_calibratura_percento: percento(r.perc_scarto_calibratura),
    parziale: r.parziale
  }
}

function stagioneArg(v: unknown): string | null {
  const s = asString(v).trim()
  return s || null
}

function nodoCompatto(n: NodoTraccia): Record<string, unknown> {
  const dettagli = n.dettagli
    .filter((d) => !DETTAGLI_ESCLUSI.has(d.etichetta) && d.valore)
    .map((d) => `${d.etichetta}: ${d.valore}`)
    .join(' · ')
  return {
    tipo: n.tipo,
    titolo: n.titolo,
    sottotitolo: n.sottotitolo,
    dettagli,
    figli: n.figli.map(nodoCompatto)
  }
}

type Partenza = { tipo: 'cotta' | 'lotto' | 'campo' | 'semina'; id: number }

function trovaPartenza(db: Db, testoCercato: string): Partenza | null {
  const cotta = db.prepare(`SELECT id FROM cotte WHERE numero_lotto = ?`).get(testoCercato) as
    | { id: number }
    | undefined
  if (cotta) return { tipo: 'cotta', id: cotta.id }
  const lotto = db
    .prepare(
      `SELECT id FROM lotti_materie_prime WHERE lotto_fornitore = ? ORDER BY id DESC LIMIT 1`
    )
    .get(testoCercato) as { id: number } | undefined
  if (lotto) return { tipo: 'lotto', id: lotto.id }
  const campo = db.prepare(`SELECT id FROM agri_campi WHERE nome = ?`).get(testoCercato) as
    | { id: number }
    | undefined
  if (campo) return { tipo: 'campo', id: campo.id }
  const simili = cercaPartenze(db, testoCercato)
  return simili.length > 0 ? { tipo: simili[0].tipo, id: simili[0].id } : null
}

export const strumentiAgricoli: ToolDefinition[] = [
  {
    name: 'agri_campi_semine',
    agricolo: true,
    description: 'Campi e semine (coltura, varietà, data, superficie, semente).',
    parameters: { type: 'object', properties: { stagione: testo('Es. 2025/2026 (facoltativa).') } },
    handler: (db, args) => {
      const stagione = stagioneArg(args.stagione)
      const campi = listaCampi(db, stagione).map((c) => ({
        campo: c.nome,
        ettari: c.superficie_ha,
        localita: c.localita,
        attivo: c.attivo,
        note: c.note
      }))
      const semine = listaSemine(db, { stagione }).map((s) => ({
        campo: s.campo_nome,
        stagione: s.stagione,
        coltura: s.coltura,
        varieta: s.varieta,
        data: s.data,
        ettari: s.superficie_ha,
        semente:
          s.semente
            .map(
              (c) =>
                `${c.materia_prima_nome} lotto ${c.lotto_codice} ${c.quantita} ${c.unita_misura}`
            )
            .join('; ') || s.semente_testo,
        operazioni: s.operazioni,
        raccolte: s.raccolte
      }))
      return { campi, semine }
    }
  },

  {
    name: 'agri_operazioni',
    agricolo: true,
    description:
      'Operazioni sui campi: concimazioni, trattamenti con fitofarmaci (e fine carenza), lavorazioni, irrigazioni.',
    parameters: {
      type: 'object',
      properties: {
        stagione: testo('Es. 2025/2026 (facoltativa).'),
        tipo: testo(
          'Filtro: concimazione, trattamento, lavorazione, irrigazione, altro. Lascia vuoto per tutte.'
        )
      }
    },
    handler: (db, args) => {
      const tipo = asString(args.tipo).trim() || null
      const operazioni = listaOperazioni(db, { stagione: stagioneArg(args.stagione), tipo })
        .slice(0, 60)
        .map((o) => ({
          data: o.data,
          tipo: o.tipo,
          campo: o.campo_nome,
          coltura: o.coltura,
          prodotto: o.materia_prima_nome,
          quantita: o.quantita,
          unita: o.unita_misura,
          dose_ha: o.dose_ha,
          motivo: o.motivo,
          operatore: o.operatore,
          fine_carenza: o.fine_carenza,
          lotti: o.lotti.map((l) => l.lotto_codice).join(', '),
          note: o.note
        }))
      return { totale: operazioni.length, operazioni }
    }
  },

  {
    name: 'agri_lavorazioni',
    agricolo: true,
    description:
      'Raccolte, calibrature o maltazioni; col codice il dettaglio (parametri, ingressi, uscite, rese).',
    parameters: {
      type: 'object',
      properties: {
        tipo: testo('raccolta, calibratura o maltazione.'),
        stagione: testo('Es. 2026/2027 (facoltativa).'),
        codice: testo('Codice della lavorazione per il dettaglio.')
      },
      required: ['tipo']
    },
    handler: (db, args) => {
      const tipo = asString(args.tipo).trim() as FaseLavorazione
      if (!FASI.includes(tipo))
        return { errore: 'tipo deve essere raccolta, calibratura o maltazione' }
      const codice = asString(args.codice).trim()
      if (!codice) {
        const lavorazioni = listaLavorazioni(db, { tipo, stagione: stagioneArg(args.stagione) })
          .slice(0, 40)
          .map((l) => ({
            codice: l.codice,
            stagione: l.stagione,
            stato: l.stato,
            inizio: l.data_inizio,
            fine: l.data_fine,
            materia: l.materia_prima_nome,
            campo: l.campo_nome,
            varieta: l.varieta,
            ingressi: l.input_descrizione,
            uscite: l.output_descrizione,
            parametri: l.riepilogo_parametri,
            rese: resePercento(l.rese),
            carenza: l.carenza
          }))
        return { totale: lavorazioni.length, lavorazioni }
      }
      const riga = (db
        .prepare(`SELECT id FROM agri_lavorazioni WHERE tipo = ? AND codice = ?`)
        .get(tipo, codice) ??
        db
          .prepare(
            `SELECT id FROM agri_lavorazioni WHERE tipo = ? AND codice LIKE ? ORDER BY id DESC LIMIT 1`
          )
          .get(tipo, `%${codice}%`)) as { id: number } | undefined
      if (!riga) return { trovata: false }
      const d = dettaglioLavorazione(db, riga.id)
      return {
        codice: d.codice,
        stagione: d.stagione,
        stato: d.stato,
        inizio: d.data_inizio,
        fine: d.data_fine,
        materia: d.materia_prima_nome,
        campo: d.campo_nome,
        varieta: d.varieta,
        note: d.note,
        ingressi: d.input.map((i) => ({
          lotto: i.codice,
          materia: i.materia_prima_nome,
          calibro: i.calibro,
          quantita: i.quantita,
          unita: i.unita_misura,
          kg: i.quantita_kg
        })),
        uscite: d.output.map((o) => ({
          nome: o.nome,
          percentuale: o.percentuale,
          quantita: o.quantita,
          unita: o.unita_misura,
          kg: o.quantita_kg,
          scarto: o.scarto,
          peso_specifico_gl: o.peso_specifico_gl,
          lotto: o.lotto_codice
        })),
        parametri: valoriLeggibili(db, riga.id).map((p) => ({
          gruppo: p.gruppo,
          data: p.data_gruppo,
          parametro: p.parametro,
          valore: p.valore,
          unita: p.unita
        })),
        rese: resePercento(d.rese),
        scadenza_malto: d.data_scadenza_output
      }
    }
  },

  {
    name: 'agri_magazzino_input',
    agricolo: true,
    description:
      'Magazzino agricolo: sementi, concimi, fitofarmaci (con carenza), orzo grezzo e calibrato (per calibro), luppolo grezzo.',
    parameters: {
      type: 'object',
      properties: { categoria: testo('Es. fitofarmaco, semente (facoltativa).') }
    },
    handler: (db, args) => {
      const categorie: string[] = [...CATEGORIE_INPUT_AGRICOLI, ...CATEGORIE_MP_AGRICOLE]
      const filtro = asString(args.categoria).trim().toLowerCase()
      const scelte = filtro ? categorie.filter((c) => c.includes(filtro)) : categorie
      if (scelte.length === 0) return { totale: 0, materie: [] }
      const materie = db
        .prepare(
          `SELECT mp.id, mp.nome AS materia, mp.categoria, mp.unita_misura AS unita,
                  mp.soglia_riordino_fissa AS soglia, mp.tempo_carenza_giorni AS carenza_giorni,
                  mp.principio_attivo, mp.numero_registrazione,
                  COALESCE((SELECT SUM(l.quantita_residua) FROM lotti_materie_prime l
                            WHERE l.materia_prima_id = mp.id AND l.quantita_residua > 0), 0) AS giacenza
           FROM materie_prime mp
           WHERE mp.categoria IN (${scelte.map(() => '?').join(',')})
           ORDER BY mp.categoria, mp.nome`
        )
        .all(...scelte) as Array<Record<string, unknown> & { id: number; categoria: string }>
      const lotti = db.prepare(
        `SELECT lotto_fornitore AS lotto, data_scadenza AS scadenza, quantita_residua AS residuo, calibro, stagione
         FROM lotti_materie_prime WHERE materia_prima_id = ? AND quantita_residua > 0
         ORDER BY data_scadenza IS NULL, data_scadenza`
      )
      return {
        totale: materie.length,
        materie: materie.map(({ id, categoria, ...m }) => ({
          ...m,
          categoria: ETICHETTE_CATEGORIA[categoria] ?? categoria,
          lotti: lotti.all(id)
        }))
      }
    }
  },

  {
    name: 'tracciabilita',
    agricolo: true,
    description:
      'Tracciabilità di lotto, cotta o campo: a ritroso fino al campo, in avanti fino ai clienti.',
    parameters: {
      type: 'object',
      properties: {
        lotto: testo('Codice di lotto, numero di cotta o nome del campo.'),
        direzione: testo('indietro o avanti (facoltativa).')
      },
      required: ['lotto']
    },
    handler: (db, args) => {
      const cercato = asString(args.lotto).trim()
      const partenza = cercato ? trovaPartenza(db, cercato) : null
      if (!partenza) return { trovato: false }
      const richiesta = asString(args.direzione).trim()
      const direzioni: Array<'indietro' | 'avanti'> =
        richiesta === 'indietro' || richiesta === 'avanti'
          ? [richiesta]
          : partenza.tipo === 'cotta'
            ? ['indietro']
            : partenza.tipo === 'lotto'
              ? ['indietro', 'avanti']
              : ['avanti']
      const out: Record<string, unknown> = { partenza: partenza.tipo }
      for (const d of direzioni) out[d] = traccia(db, partenza, d).map(nodoCompatto)
      return out
    }
  }
]
