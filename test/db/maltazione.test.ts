import { test } from 'node:test'
import assert from 'node:assert/strict'
import type BetterSqlite3 from 'better-sqlite3'
import { creaDbTest } from './helpers'
import { conta, lotto, materia, residuo } from './fixture'
import { salvaCampo, salvaSemina } from '../../src/main/agricolo/servizi/campi'
import {
  avviaMaltazione,
  chiudiMaltazione,
  dettaglioLavorazione,
  eliminaLavorazione,
  listaLavorazioni,
  maltazioniInCorso,
  riapriMaltazione,
  salvaCalibratura,
  salvaRaccolta,
  scadenzaMaltoProposta
} from '../../src/main/agricolo/servizi/lavorazioni'
import { ErroreUtente } from '../../src/main/agricolo/errori'
import type { MaltazioneAvviaPayload } from '../../src/shared/agricolo'

type Db = BetterSqlite3.Database

/** Prepara la filiera di Mauro fino ai lotti calibrati; ritorna gli id utili. */
function filiera(db: Db): { lotto34: number; lotto45: number; pilsner: number } {
  const campo = salvaCampo(db, null, {
    nome: 'Campo 1A',
    superficie_ha: 10,
    localita: null,
    rif_catastale: null,
    note: null
  })
  const semina = salvaSemina(db, null, {
    campo_id: campo,
    stagione: '2025/2026',
    coltura: 'orzo',
    varieta: 'Concerto',
    data: '2025-11-15',
    superficie_ha: 10,
    semente_testo: null,
    semente: null,
    note: null
  })
  const grezzo = materia(db, 'Orzo grezzo', 'orzo_grezzo', 'q')
  const calibrato = materia(db, 'Orzo calibrato', 'orzo_calibrato', 'q')
  const pilsner = materia(db, 'Malto Pilsner aziendale', 'malto', 'kg')
  const rac = salvaRaccolta(db, null, {
    semina_id: semina,
    data: '2026-06-25',
    stagione: '2025/2026',
    materia_prima_id: grezzo,
    quantita: 300,
    codice: '1A/2026',
    data_scadenza: '2027-06-30',
    note: null
  })
  const lottoGrezzo = (
    db
      .prepare(
        `SELECT id FROM lotti_materie_prime WHERE origine_tipo = 'raccolta' AND origine_id = ?`
      )
      .get(rac) as { id: number }
  ).id
  salvaCalibratura(db, null, {
    lotto_id: lottoGrezzo,
    data: '2026-07-10',
    stagione: '2026/2027',
    quantita: 300,
    materia_prima_id: calibrato,
    note: null,
    frazioni: [
      { nome: '<3 mm', percentuale: 19, scarto: true, peso_specifico_gl: null },
      { nome: '3-4 mm', percentuale: 69, scarto: false, peso_specifico_gl: 62 },
      { nome: '4-5 mm', percentuale: 10, scarto: false, peso_specifico_gl: 66 },
      { nome: '>5 mm', percentuale: 1, scarto: false, peso_specifico_gl: null }
    ]
  })
  const idCal = (calibro: string): number =>
    (
      db.prepare(`SELECT id FROM lotti_materie_prime WHERE calibro = ?`).get(calibro) as {
        id: number
      }
    ).id
  return { lotto34: idCal('3-4 mm'), lotto45: idCal('4-5 mm'), pilsner }
}

function avvio(
  f: { lotto34: number; pilsner: number },
  extra: Partial<MaltazioneAvviaPayload> = {}
): MaltazioneAvviaPayload {
  return {
    data_inizio: '2026-07-20',
    stagione: '2026/2027',
    materia_prima_id: f.pilsner,
    codice: '187/2026PTL',
    input: [{ lotto_id: f.lotto34, kg: 1100 }],
    note: null,
    ...extra
  }
}

/** La stessa query FIFO di prod:avvia-cotta (logica cotte NON modificata). */
function lottiPerCotta(
  db: Db,
  materiaPrimaId: number
): Array<{ id: number; quantita_residua: number }> {
  return db
    .prepare(
      `SELECT id, quantita_residua FROM lotti_materie_prime
       WHERE materia_prima_id = ? AND quantita_residua > 0
       ORDER BY data_scadenza ASC, id ASC`
    )
    .all(materiaPrimaId) as Array<{ id: number; quantita_residua: number }>
}

test('maltazione in corso: scarica l orzo calibrato (kg → q), il malto NON e ancora disponibile per le cotte', () => {
  const db = creaDbTest()
  const f = filiera(db)
  const id = avviaMaltazione(db, null, avvio(f))
  assert.equal(residuo(db, f.lotto34), 196)
  assert.deepEqual(lottiPerCotta(db, f.pilsner), [])
  const [m] = listaLavorazioni(db, { tipo: 'maltazione', stato: 'in_corso' })
  assert.equal(m.id, id)
  assert.equal(m.stato, 'in_corso')
  assert.equal(m.input_kg, 1100)
  assert.equal(maltazioniInCorso(db).length, 1)
})

test('chiusura: crea il lotto 187/2026PTL da 920 kg con data carico = data uscita, ora disponibile per le cotte', () => {
  const db = creaDbTest()
  const f = filiera(db)
  const id = avviaMaltazione(db, null, avvio(f))
  chiudiMaltazione(db, id, {
    data_uscita: '2026-08-29',
    peso_finale_kg: 920,
    data_scadenza: '2027-08-29'
  })
  const malto = db
    .prepare(`SELECT * FROM lotti_materie_prime WHERE origine_tipo = 'maltazione'`)
    .get() as Record<string, unknown>
  assert.equal(malto.lotto_fornitore, '187/2026PTL')
  assert.equal(malto.quantita_iniziale, 920)
  assert.equal(malto.data_carico, '2026-08-29')
  assert.equal(malto.data_scadenza, '2027-08-29')
  assert.equal(malto.origine_id, id)
  assert.equal(malto.stagione, '2026/2027')
  assert.deepEqual(lottiPerCotta(db, f.pilsner), [{ id: malto.id, quantita_residua: 920 }])
  assert.equal(maltazioniInCorso(db).length, 0)
  const d = dettaglioLavorazione(db, id)
  assert.equal(d.stato, 'chiusa')
  assert.equal(d.data_fine, '2026-08-29')
})

test('rese della maltazione di Mauro: 83,6% di maltazione, 66,9% complessiva, 19% di scarto', () => {
  const db = creaDbTest()
  const f = filiera(db)
  const id = avviaMaltazione(db, null, avvio(f))
  assert.equal(dettaglioLavorazione(db, id).rese?.resa_maltazione, null)
  chiudiMaltazione(db, id, { data_uscita: '2026-08-29', peso_finale_kg: 920, data_scadenza: null })
  const r = dettaglioLavorazione(db, id).rese!
  assert.equal(Math.round(r.resa_maltazione! * 1000) / 10, 83.6)
  assert.equal(r.kg_grezzo_equivalenti, 1375)
  assert.equal(Math.round(r.resa_complessiva! * 1000) / 10, 66.9)
  assert.equal(r.perc_scarto_calibratura, 0.19)
  assert.equal(r.parziale, false)
})

test('scadenza proposta dalle impostazioni e usata se non indicata', () => {
  const db = creaDbTest()
  const f = filiera(db)
  assert.equal(scadenzaMaltoProposta(db, '2026-08-29'), '2027-08-29')
  db.prepare(
    `UPDATE configurazioni SET valore = '18' WHERE chiave = 'agri_shelf_life_malto_mesi'`
  ).run()
  const id = avviaMaltazione(db, null, avvio(f))
  chiudiMaltazione(db, id, { data_uscita: '2026-08-29', peso_finale_kg: 920, data_scadenza: null })
  const s = (
    db
      .prepare(`SELECT data_scadenza s FROM lotti_materie_prime WHERE origine_tipo = 'maltazione'`)
      .get() as { s: string }
  ).s
  assert.equal(s, '2028-02-29')
})

test('validazioni: solo orzo calibrato, solo malto come destinazione, codice unico, date coerenti, giacenza', () => {
  const db = creaDbTest()
  const f = filiera(db)
  const luppolo = materia(db, 'Cascade', 'luppolo', 'kg')
  const lotLup = lotto(db, luppolo, 'L1', 50)
  assert.throws(
    () => avviaMaltazione(db, null, avvio(f, { input: [{ lotto_id: lotLup, kg: 10 }] })),
    ErroreUtente
  )
  assert.throws(
    () => avviaMaltazione(db, null, avvio(f, { materia_prima_id: luppolo })),
    ErroreUtente
  )
  assert.throws(() => avviaMaltazione(db, null, avvio(f, { input: [] })), ErroreUtente)
  assert.throws(() => avviaMaltazione(db, null, avvio(f, { codice: '' })), ErroreUtente)
  assert.throws(
    () => avviaMaltazione(db, null, avvio(f, { input: [{ lotto_id: f.lotto34, kg: 20701 }] })),
    ErroreUtente
  )
  const id = avviaMaltazione(db, null, avvio(f))
  assert.throws(() => avviaMaltazione(db, null, avvio(f, { codice: '187/2026ptl' })), ErroreUtente)
  assert.throws(
    () =>
      chiudiMaltazione(db, id, {
        data_uscita: '2026-07-01',
        peso_finale_kg: 920,
        data_scadenza: null
      }),
    ErroreUtente
  )
  assert.throws(
    () =>
      chiudiMaltazione(db, id, {
        data_uscita: '2026-08-29',
        peso_finale_kg: 0,
        data_scadenza: null
      }),
    ErroreUtente
  )
  assert.equal(conta(db, 'agri_lavorazioni'), 3) // raccolta + calibratura + 1 maltazione
})

test('piu lotti calibrati in ingresso: scarichi separati e rese proporzionali', () => {
  const db = creaDbTest()
  const f = filiera(db)
  const id = avviaMaltazione(
    db,
    null,
    avvio(f, {
      input: [
        { lotto_id: f.lotto34, kg: 800 },
        { lotto_id: f.lotto45, kg: 300 }
      ]
    })
  )
  assert.equal(residuo(db, f.lotto34), 199)
  assert.equal(residuo(db, f.lotto45), 27)
  chiudiMaltazione(db, id, { data_uscita: '2026-08-29', peso_finale_kg: 920, data_scadenza: null })
  const r = dettaglioLavorazione(db, id).rese!
  assert.equal(r.kg_grezzo_equivalenti, 1375)
})

test('modifica di una maltazione in corso: ripristina e riapplica gli scarichi', () => {
  const db = creaDbTest()
  const f = filiera(db)
  const id = avviaMaltazione(db, null, avvio(f))
  avviaMaltazione(db, id, avvio(f, { input: [{ lotto_id: f.lotto34, kg: 1200 }] }))
  assert.equal(residuo(db, f.lotto34), 195)
  assert.equal(dettaglioLavorazione(db, id).input_kg, 1200)
})

test('modifica di una maltazione chiusa con malto non ancora usato: il lotto di malto viene rifatto', () => {
  const db = creaDbTest()
  const f = filiera(db)
  const id = avviaMaltazione(db, null, avvio(f))
  chiudiMaltazione(db, id, {
    data_uscita: '2026-08-29',
    peso_finale_kg: 920,
    data_scadenza: '2027-08-29'
  })
  avviaMaltazione(db, id, avvio(f, { note: 'nota aggiunta' }))
  const d = dettaglioLavorazione(db, id)
  assert.equal(d.stato, 'chiusa')
  assert.equal(d.output_kg, 920)
  assert.equal(conta(db, 'lotti_materie_prime') - 0 > 0, true)
  assert.equal(
    (
      db
        .prepare(`SELECT COUNT(*) c FROM lotti_materie_prime WHERE origine_tipo = 'maltazione'`)
        .get() as { c: number }
    ).c,
    1
  )
  // la chiusura si puo correggere (peso finale)
  chiudiMaltazione(db, id, {
    data_uscita: '2026-08-30',
    peso_finale_kg: 925,
    data_scadenza: '2027-08-30'
  })
  assert.equal(
    (
      db
        .prepare(
          `SELECT quantita_iniziale q FROM lotti_materie_prime WHERE origine_tipo = 'maltazione'`
        )
        .get() as { q: number }
    ).q,
    925
  )
})

test('malto gia usato in una cotta: niente riapertura, modifica o eliminazione', () => {
  const db = creaDbTest()
  const f = filiera(db)
  const id = avviaMaltazione(db, null, avvio(f))
  chiudiMaltazione(db, id, { data_uscita: '2026-08-29', peso_finale_kg: 920, data_scadenza: null })
  const lottoMalto = (
    db.prepare(`SELECT id FROM lotti_materie_prime WHERE origine_tipo = 'maltazione'`).get() as {
      id: number
    }
  ).id
  const birra = Number(db.prepare(`INSERT INTO birre (nome) VALUES ('Pils')`).run().lastInsertRowid)
  const cotta = Number(
    db
      .prepare(
        `INSERT INTO cotte (numero_lotto, birra_id, data_inizio, litri_teorici) VALUES ('L-2026-30', ?, '2026-09-05', 1000)`
      )
      .run(birra).lastInsertRowid
  )
  db.prepare(
    `INSERT INTO cotta_materie_prime (cotta_id, lotto_materia_prima_id, materia_prima_id, quantita_usata) VALUES (?, ?, ?, 200)`
  ).run(cotta, lottoMalto, f.pilsner)
  db.prepare(`UPDATE lotti_materie_prime SET quantita_residua = 720 WHERE id = ?`).run(lottoMalto)
  assert.throws(() => riapriMaltazione(db, id), ErroreUtente)
  assert.throws(() => avviaMaltazione(db, id, avvio(f, { note: 'x' })), ErroreUtente)
  assert.throws(
    () =>
      chiudiMaltazione(db, id, {
        data_uscita: '2026-08-29',
        peso_finale_kg: 900,
        data_scadenza: null
      }),
    ErroreUtente
  )
  assert.throws(() => eliminaLavorazione(db, id), ErroreUtente)
  assert.match(dettaglioLavorazione(db, id).bloccata ?? '', /L-2026-30/)
})

test('riapri ed elimina una maltazione: tutto torna come prima', () => {
  const db = creaDbTest()
  const f = filiera(db)
  const id = avviaMaltazione(db, null, avvio(f))
  chiudiMaltazione(db, id, { data_uscita: '2026-08-29', peso_finale_kg: 920, data_scadenza: null })
  riapriMaltazione(db, id)
  assert.equal(dettaglioLavorazione(db, id).stato, 'in_corso')
  assert.deepEqual(lottiPerCotta(db, f.pilsner), [])
  eliminaLavorazione(db, id)
  assert.equal(residuo(db, f.lotto34), 207)
})
