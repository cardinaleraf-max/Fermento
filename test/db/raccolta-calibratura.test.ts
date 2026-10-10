import { test } from 'node:test'
import assert from 'node:assert/strict'
import type BetterSqlite3 from 'better-sqlite3'
import { creaDbTest } from './helpers'
import { conta, lotto, materia, residuo } from './fixture'
import { salvaCampo, salvaSemina } from '../../src/main/agricolo/servizi/campi'
import { salvaOperazione } from '../../src/main/agricolo/servizi/operazioni'
import {
  dettaglioLavorazione,
  eliminaLavorazione,
  listaLavorazioni,
  salvaCalibratura,
  salvaRaccolta,
  verificaCarenza
} from '../../src/main/agricolo/servizi/lavorazioni'
import { generaAvvisiCarenza } from '../../src/main/agricolo/servizi/avvisi'
import { ErroreUtente } from '../../src/main/agricolo/errori'
import type { CalibraturaPayload, FrazionePayload, RaccoltaPayload } from '../../src/shared/agricolo'

type Db = BetterSqlite3.Database

function scenario(db: Db): { semina: number; orzoGrezzo: number; orzoCalibrato: number } {
  const campo = salvaCampo(db, null, { nome: 'Campo 1A', superficie_ha: 10, localita: 'Irgoli', rif_catastale: null, note: null })
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
  return {
    semina,
    orzoGrezzo: materia(db, 'Orzo grezzo', 'orzo_grezzo', 'q'),
    orzoCalibrato: materia(db, 'Orzo calibrato', 'orzo_calibrato', 'q')
  }
}

function raccolta(semina: number, mp: number, extra: Partial<RaccoltaPayload> = {}): RaccoltaPayload {
  return {
    semina_id: semina,
    data: '2026-06-25',
    stagione: '2025/2026',
    materia_prima_id: mp,
    quantita: 300,
    codice: '1A/2026',
    data_scadenza: '2027-06-30',
    note: null,
    ...extra
  }
}

const FRAZIONI: FrazionePayload[] = [
  { nome: '<3 mm', percentuale: 19, scarto: true, peso_specifico_gl: null },
  { nome: '3-4 mm', percentuale: 69, scarto: false, peso_specifico_gl: 62 },
  { nome: '4-5 mm', percentuale: 10, scarto: false, peso_specifico_gl: 66 },
  { nome: '>5 mm', percentuale: 1, scarto: false, peso_specifico_gl: null }
]

function calibratura(lotto_id: number, mp: number, extra: Partial<CalibraturaPayload> = {}): CalibraturaPayload {
  return {
    lotto_id,
    data: '2026-07-10',
    stagione: '2026/2027',
    quantita: 300,
    materia_prima_id: mp,
    frazioni: FRAZIONI,
    note: null,
    ...extra
  }
}

function lottoDiRaccolta(db: Db, lavId: number): number {
  return (db.prepare(`SELECT id FROM lotti_materie_prime WHERE origine_tipo = 'raccolta' AND origine_id = ?`).get(lavId) as { id: number }).id
}

test('raccolta: crea il lotto di orzo grezzo con origine, stagione e scadenza', () => {
  const db = creaDbTest()
  const s = scenario(db)
  const id = salvaRaccolta(db, null, raccolta(s.semina, s.orzoGrezzo))
  const l = db.prepare(`SELECT * FROM lotti_materie_prime WHERE origine_tipo = 'raccolta'`).get() as Record<string, unknown>
  assert.equal(l.lotto_fornitore, '1A/2026')
  assert.equal(l.quantita_iniziale, 300)
  assert.equal(l.quantita_residua, 300)
  assert.equal(l.origine_id, id)
  assert.equal(l.stagione, '2025/2026')
  assert.equal(l.data_carico, '2026-06-25')
  assert.equal(l.data_scadenza, '2027-06-30')
  const [r] = listaLavorazioni(db, { tipo: 'raccolta', stagione: '2025/2026' })
  assert.equal(r.campo_nome, 'Campo 1A')
  assert.equal(r.output_kg, 30000)
  assert.equal(r.codice, '1A/2026')
})

test('raccolta: validazioni (categoria, coltura, codice ripetuto, data prima della semina)', () => {
  const db = creaDbTest()
  const s = scenario(db)
  const luppoloGrezzo = materia(db, 'Luppolo fresco', 'luppolo_grezzo', 'kg')
  assert.throws(() => salvaRaccolta(db, null, raccolta(s.semina, s.orzoCalibrato)), ErroreUtente)
  assert.throws(() => salvaRaccolta(db, null, raccolta(s.semina, luppoloGrezzo)), ErroreUtente)
  assert.throws(() => salvaRaccolta(db, null, raccolta(s.semina, s.orzoGrezzo, { data: '2025-10-01' })), ErroreUtente)
  assert.throws(() => salvaRaccolta(db, null, raccolta(s.semina, s.orzoGrezzo, { codice: ' ' })), ErroreUtente)
  salvaRaccolta(db, null, raccolta(s.semina, s.orzoGrezzo))
  assert.throws(() => salvaRaccolta(db, null, raccolta(s.semina, s.orzoGrezzo)), ErroreUtente)
  assert.equal(conta(db, 'agri_lavorazioni'), 1)
})

test('raccolta di luppolo: ammessa su luppolo grezzo o su luppolo pronto per le ricette', () => {
  const db = creaDbTest()
  const campo = salvaCampo(db, null, { nome: 'Luppoleto', superficie_ha: 0.5, localita: null, rif_catastale: null, note: null })
  const sem = salvaSemina(db, null, {
    campo_id: campo, stagione: '2025/2026', coltura: 'luppolo', varieta: 'Cascade', data: '2026-03-10',
    superficie_ha: 0.5, semente_testo: null, semente: null, note: null
  })
  const grezzo = materia(db, 'Luppolo fresco', 'luppolo_grezzo', 'kg')
  const pronto = materia(db, 'Cascade aziendale', 'luppolo', 'kg')
  salvaRaccolta(db, null, { ...raccolta(sem, grezzo), quantita: 80, codice: 'LUP-1', data: '2026-09-01' })
  salvaRaccolta(db, null, { ...raccolta(sem, pronto), quantita: 20, codice: 'LUP-2', data: '2026-09-02' })
  assert.equal(conta(db, 'agri_lavorazioni'), 2)
})

test('modifica ed eliminazione della raccolta, bloccate se il lotto e gia stato calibrato', () => {
  const db = creaDbTest()
  const s = scenario(db)
  const id = salvaRaccolta(db, null, raccolta(s.semina, s.orzoGrezzo))
  salvaRaccolta(db, id, raccolta(s.semina, s.orzoGrezzo, { quantita: 310 }))
  assert.equal(residuo(db, lottoDiRaccolta(db, id)), 310)
  salvaCalibratura(db, null, calibratura(lottoDiRaccolta(db, id), s.orzoCalibrato, { quantita: 310 }))
  assert.throws(() => salvaRaccolta(db, id, raccolta(s.semina, s.orzoGrezzo, { quantita: 320 })), ErroreUtente)
  assert.throws(() => eliminaLavorazione(db, id), ErroreUtente)
  assert.match(dettaglioLavorazione(db, id).bloccata ?? '', /calibratura/)
})

test('calibratura del lotto 1A/2026 di Mauro: frazioni, lotti calibrati, scarto e calo', () => {
  const db = creaDbTest()
  const s = scenario(db)
  const rac = salvaRaccolta(db, null, raccolta(s.semina, s.orzoGrezzo))
  const grezzo = lottoDiRaccolta(db, rac)
  const id = salvaCalibratura(db, null, calibratura(grezzo, s.orzoCalibrato))
  assert.equal(residuo(db, grezzo), 0)
  const lotti = db
    .prepare(`SELECT lotto_fornitore, quantita_iniziale, calibro, stagione, data_scadenza, origine_id FROM lotti_materie_prime WHERE origine_tipo = 'calibratura' ORDER BY id`)
    .all() as Array<Record<string, unknown>>
  assert.deepEqual(
    lotti.map((l) => [l.lotto_fornitore, l.quantita_iniziale, l.calibro]),
    [
      ['1A/2026 3-4 mm', 207, '3-4 mm'],
      ['1A/2026 4-5 mm', 30, '4-5 mm'],
      ['1A/2026 >5 mm', 3, '>5 mm']
    ]
  )
  assert.equal(lotti[0].stagione, '2026/2027')
  assert.equal(lotti[0].data_scadenza, '2027-06-30')
  assert.equal(lotti[0].origine_id, id)
  const d = dettaglioLavorazione(db, id)
  assert.equal(d.input.length, 1)
  assert.equal(d.input[0].quantita_kg, 30000)
  const scarto = d.output.find((o) => o.scarto)!
  assert.equal(scarto.quantita, 57)
  assert.equal(scarto.lotto_id, null)
  assert.equal(d.output.find((o) => o.nome === '3-4 mm')!.peso_specifico_gl, 62)
  assert.equal(d.bloccata, null)
})

test('calibratura: conversione di unita (grezzo in quintali, calibrato in kg)', () => {
  const db = creaDbTest()
  const s = scenario(db)
  const calibratoKg = materia(db, 'Orzo calibrato kg', 'orzo_calibrato', 'kg')
  const grezzo = lottoDiRaccolta(db, salvaRaccolta(db, null, raccolta(s.semina, s.orzoGrezzo)))
  salvaCalibratura(db, null, calibratura(grezzo, calibratoKg))
  const q = (db.prepare(`SELECT quantita_iniziale q FROM lotti_materie_prime WHERE calibro = '3-4 mm'`).get() as { q: number }).q
  assert.equal(q, 20700)
})

test('calibratura: errori su frazioni, categoria, giacenza; nessuna modifica parziale', () => {
  const db = creaDbTest()
  const s = scenario(db)
  const grezzo = lottoDiRaccolta(db, salvaRaccolta(db, null, raccolta(s.semina, s.orzoGrezzo)))
  const oltre = FRAZIONI.map((f) => (f.nome === '<3 mm' ? { ...f, percentuale: 21 } : f))
  assert.throws(() => salvaCalibratura(db, null, calibratura(grezzo, s.orzoCalibrato, { frazioni: oltre })), ErroreUtente)
  assert.throws(() => salvaCalibratura(db, null, calibratura(grezzo, s.orzoGrezzo)), ErroreUtente)
  assert.throws(() => salvaCalibratura(db, null, calibratura(grezzo, s.orzoCalibrato, { quantita: 301 })), ErroreUtente)
  const comprato = materia(db, 'Malto comprato', 'malto', 'kg')
  const lm = lotto(db, comprato, 'M1', 100)
  assert.throws(() => salvaCalibratura(db, null, calibratura(lm, s.orzoCalibrato)), ErroreUtente)
  assert.equal(residuo(db, grezzo), 300)
  assert.equal(conta(db, 'agri_lavorazioni'), 1)
})

test('calibratura parziale e codici dei lotti senza doppioni', () => {
  const db = creaDbTest()
  const s = scenario(db)
  const grezzo = lottoDiRaccolta(db, salvaRaccolta(db, null, raccolta(s.semina, s.orzoGrezzo)))
  salvaCalibratura(db, null, calibratura(grezzo, s.orzoCalibrato, { quantita: 100 }))
  salvaCalibratura(db, null, calibratura(grezzo, s.orzoCalibrato, { quantita: 200 }))
  assert.equal(residuo(db, grezzo), 0)
  const codici = (db.prepare(`SELECT lotto_fornitore c FROM lotti_materie_prime WHERE calibro = '3-4 mm' ORDER BY id`).all() as Array<{ c: string }>).map((r) => r.c)
  assert.deepEqual(codici, ['1A/2026 3-4 mm', '1A/2026 3-4 mm (2)'])
})

test('modifica calibratura con lotti non usati: annulla e riapplica, poi elimina ripristina il grezzo', () => {
  const db = creaDbTest()
  const s = scenario(db)
  const grezzo = lottoDiRaccolta(db, salvaRaccolta(db, null, raccolta(s.semina, s.orzoGrezzo)))
  const id = salvaCalibratura(db, null, calibratura(grezzo, s.orzoCalibrato))
  const nuove = FRAZIONI.map((f) => (f.nome === '3-4 mm' ? { ...f, percentuale: 70 } : f.nome === '4-5 mm' ? { ...f, percentuale: 9 } : f))
  salvaCalibratura(db, id, calibratura(grezzo, s.orzoCalibrato, { frazioni: nuove }))
  const usciteDi = (lav: number): number =>
    (db.prepare(`SELECT COUNT(*) c FROM agri_lavorazione_output WHERE lavorazione_id = ?`).get(lav) as { c: number }).c
  assert.equal((db.prepare(`SELECT quantita_iniziale q FROM lotti_materie_prime WHERE calibro = '3-4 mm'`).get() as { q: number }).q, 210)
  assert.equal(usciteDi(id), 4)
  assert.equal((db.prepare(`SELECT COUNT(*) c FROM lotti_materie_prime WHERE calibro = '3-4 mm'`).get() as { c: number }).c, 1)
  eliminaLavorazione(db, id)
  assert.equal(residuo(db, grezzo), 300)
  assert.equal((db.prepare(`SELECT COUNT(*) c FROM lotti_materie_prime WHERE origine_tipo = 'calibratura'`).get() as { c: number }).c, 0)
  assert.equal(usciteDi(id), 0)
  assert.equal(conta(db, 'agri_lavorazioni'), 1)
})

test('tempo di carenza: raccolta dentro la carenza segnalata e avviso generato', () => {
  const db = creaDbTest()
  const s = scenario(db)
  const fung = materia(db, 'Fungicida X', 'fitofarmaco', 'L', { carenza: 30 })
  lotto(db, fung, 'F1', 10)
  salvaOperazione(db, null, {
    semina_id: s.semina, tipo: 'trattamento', data: '2026-06-01', prodotto: { materia_prima_id: fung, quantita: 2, lotto_id: null },
    motivo: 'Ruggine', operatore: null, note: null
  })
  assert.deepEqual(verificaCarenza(db, s.semina, '2026-06-25'), [
    { prodotto: 'Fungicida X', data: '2026-06-01', giorni: 30, fine_carenza: '2026-07-01' }
  ])
  assert.deepEqual(verificaCarenza(db, s.semina, '2026-07-01'), [])
  salvaRaccolta(db, null, raccolta(s.semina, s.orzoGrezzo))
  const [r] = listaLavorazioni(db, { tipo: 'raccolta', stagione: null })
  assert.equal(r.carenza.length, 1)
  db.prepare(`UPDATE configurazioni SET valore = '2025/2026' WHERE chiave = 'agri_stagione_corrente'`).run()
  generaAvvisiCarenza(db)
  const avvisi = db.prepare(`SELECT tipo, riferimento_tabella, messaggio FROM avvisi WHERE tipo = 'carenza_raccolta'`).all() as Array<{ messaggio: string }>
  assert.equal(avvisi.length, 1)
  assert.match(avvisi[0].messaggio, /1A\/2026/)
  assert.match(avvisi[0].messaggio, /Fungicida X/)
})
