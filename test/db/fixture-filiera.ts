/**
 * Filiera agricola completa per i test (tracciabilità, strumenti di Bira).
 */
import type BetterSqlite3 from 'better-sqlite3'
import { lotto, materia } from './fixture'
import { salvaCampo, salvaSemina } from '../../src/main/agricolo/servizi/campi'
import { salvaOperazione } from '../../src/main/agricolo/servizi/operazioni'
import { salvaValori, configParametri } from '../../src/main/agricolo/servizi/parametri'
import {
  avviaMaltazione,
  chiudiMaltazione,
  salvaCalibratura,
  salvaRaccolta
} from '../../src/main/agricolo/servizi/lavorazioni'
import { salvaLottiImballi } from '../../src/main/agricolo/servizi/imballi'

type Db = BetterSqlite3.Database

/** Filiera completa: campo → semina (con semente) → trattamento → raccolta → calibratura → maltazione → cotta → vendita. */
export function filiera(db: Db): {
  campo: number
  semina: number
  cotta: number
  lottoMalto: number
  lottoFungicida: number
} {
  const campo = salvaCampo(db, null, {
    nome: 'Campo 1A',
    superficie_ha: 10,
    localita: 'Irgoli',
    rif_catastale: 'Fg 12',
    note: null
  })
  const seme = materia(db, 'Orzo da seme Concerto', 'semente', 'kg')
  lotto(db, seme, 'SEM-77', 2000)
  const semina = salvaSemina(db, null, {
    campo_id: campo,
    stagione: '2025/2026',
    coltura: 'orzo',
    varieta: 'Concerto',
    data: '2025-11-15',
    superficie_ha: 10,
    semente_testo: null,
    semente: { materia_prima_id: seme, quantita: 1800, lotto_id: null },
    note: null
  })
  const fung = materia(db, 'Fungicida X', 'fitofarmaco', 'L', { carenza: 30 })
  const lottoFungicida = lotto(db, fung, 'FG-1', 10)
  salvaOperazione(db, null, {
    semina_id: semina,
    tipo: 'trattamento',
    data: '2026-04-10',
    prodotto: { materia_prima_id: fung, quantita: 2, lotto_id: null },
    motivo: 'Ruggine',
    operatore: 'Mauro',
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
    data_scadenza: null,
    note: null
  })
  const lg = (
    db
      .prepare(`SELECT id FROM lotti_materie_prime WHERE origine_tipo='raccolta' AND origine_id=?`)
      .get(rac) as { id: number }
  ).id
  const cal = salvaCalibratura(db, null, {
    lotto_id: lg,
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
  const umidita = configParametri(db, 'calibratura')[0].parametri[0].id
  salvaValori(db, cal, { [umidita]: '10' }, {})
  const l34 = (
    db.prepare(`SELECT id FROM lotti_materie_prime WHERE calibro = '3-4 mm'`).get() as {
      id: number
    }
  ).id
  const mal = avviaMaltazione(db, null, {
    data_inizio: '2026-07-20',
    stagione: '2026/2027',
    materia_prima_id: pilsner,
    codice: '187/2026PTL',
    input: [{ lotto_id: l34, kg: 1100 }],
    note: null
  })
  const dolcezza = (
    db.prepare(`SELECT id FROM agri_parametri WHERE nome = 'Dolcezza'`).get() as { id: number }
  ).id
  salvaValori(db, mal, { [dolcezza]: '8' }, {})
  chiudiMaltazione(db, mal, { data_uscita: '2026-08-29', peso_finale_kg: 920, data_scadenza: null })
  const lottoMalto = (
    db.prepare(`SELECT id FROM lotti_materie_prime WHERE origine_tipo='maltazione'`).get() as {
      id: number
    }
  ).id
  // cotta che usa il malto (come farebbe prod:avvia-cotta)
  const birra = Number(
    db.prepare(`INSERT INTO birre (nome, stile) VALUES ('Marduk Pils', 'Pils')`).run()
      .lastInsertRowid
  )
  const cotta = Number(
    db
      .prepare(
        `INSERT INTO cotte (numero_lotto, birra_id, data_inizio, litri_teorici, stato) VALUES ('L-2026-50', ?, '2026-09-05', 1000, 'confezionata')`
      )
      .run(birra).lastInsertRowid
  )
  db.prepare(
    `INSERT INTO cotta_materie_prime (cotta_id, lotto_materia_prima_id, materia_prima_id, quantita_usata) VALUES (?, ?, ?, 200)`
  ).run(cotta, lottoMalto, pilsner)
  const luppolo = materia(db, 'Cascade', 'luppolo', 'kg')
  const ll = lotto(db, luppolo, 'HOP-9', 5)
  db.prepare(
    `INSERT INTO cotta_materie_prime (cotta_id, lotto_materia_prima_id, materia_prima_id, quantita_usata) VALUES (?, ?, ?, 2)`
  ).run(cotta, ll, luppolo)
  // imballi
  const bott = Number(
    db
      .prepare(
        `INSERT INTO materiali_confezionamento (nome, categoria, attivo) VALUES ('Bottiglia 33 cl', 'bottiglia', 1)`
      )
      .run().lastInsertRowid
  )
  const car = Number(
    db
      .prepare(
        `INSERT INTO movimenti_confezionamento (materiale_id, tipo_movimento, quantita, causale, lotto_fornitore, fornitore) VALUES (?, 'carico', 5000, 'acquisto', 'VER-1', 'Verallia')`
      )
      .run(bott).lastInsertRowid
  )
  salvaLottiImballi(db, cotta, [car])
  // vendita
  const cliente = Number(
    db.prepare(`INSERT INTO clienti (nome) VALUES ('Bar Centrale Orosei')`).run().lastInsertRowid
  )
  const vendita = Number(
    db.prepare(`INSERT INTO vendite (cliente_id, data) VALUES (?, '2026-09-20')`).run(cliente)
      .lastInsertRowid
  )
  db.prepare(
    `INSERT INTO vendita_dettaglio (vendita_id, cotta_id, tipo_prodotto, quantita) VALUES (?, ?, 'bottiglia', 120)`
  ).run(vendita, cotta)
  return { campo, semina, cotta, lottoMalto, lottoFungicida }
}
