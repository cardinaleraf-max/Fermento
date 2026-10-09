import { test } from 'node:test'
import assert from 'node:assert/strict'
import { creaDbTest } from './helpers'
import { conta, lotto, materia, residuo } from './fixture'
import {
  annullaConsumi,
  lottiDisponibili,
  lottoUsatoAValle,
  registraConsumi,
  scaricaPerMateria
} from '../../src/main/agricolo/servizi/magazzino'
import { eliminaSemina, listaSemine, salvaCampo, salvaSemina } from '../../src/main/agricolo/servizi/campi'
import { ErroreUtente } from '../../src/main/agricolo/errori'
import type { SeminaPayload } from '../../src/shared/agricolo'

test('scarico FIFO: prima il lotto che scade prima, i lotti senza scadenza per ultimi', () => {
  const db = creaDbTest()
  const sem = materia(db, 'Orzo Concerto da seme', 'semente', 'kg')
  const senza = lotto(db, sem, 'SENZA', 100, null)
  const tardi = lotto(db, sem, 'TARDI', 100, '2027-12-31')
  const presto = lotto(db, sem, 'PRESTO', 50, '2026-12-31')
  const righe = db.transaction(() => scaricaPerMateria(db, sem, 120, null))()
  assert.deepEqual(righe, [
    { lotto_id: presto, quantita: 50 },
    { lotto_id: tardi, quantita: 70 }
  ])
  assert.equal(residuo(db, presto), 0)
  assert.equal(residuo(db, tardi), 30)
  assert.equal(residuo(db, senza), 100)
})

test('scarico da un lotto scelto a mano', () => {
  const db = creaDbTest()
  const sem = materia(db, 'Seme', 'semente', 'q')
  const a = lotto(db, sem, 'A', 10, '2026-12-31')
  const b = lotto(db, sem, 'B', 10, '2027-12-31')
  const righe = db.transaction(() => scaricaPerMateria(db, sem, 4, b))()
  assert.deepEqual(righe, [{ lotto_id: b, quantita: 4 }])
  assert.equal(residuo(db, a), 10)
  assert.equal(residuo(db, b), 6)
})

test('scarico oltre la giacenza: errore chiaro e nessuna modifica', () => {
  const db = creaDbTest()
  const sem = materia(db, 'Seme', 'semente', 'kg')
  const a = lotto(db, sem, 'A', 10)
  assert.throws(() => db.transaction(() => scaricaPerMateria(db, sem, 11, null))(), ErroreUtente)
  assert.throws(() => db.transaction(() => scaricaPerMateria(db, sem, 11, a))(), ErroreUtente)
  assert.equal(residuo(db, a), 10)
})

test('scarico da un lotto di un altra materia prima: rifiutato', () => {
  const db = creaDbTest()
  const sem = materia(db, 'Seme', 'semente', 'kg')
  const concime = materia(db, 'NPK', 'concime', 'q')
  const lc = lotto(db, concime, 'C1', 10)
  assert.throws(() => db.transaction(() => scaricaPerMateria(db, sem, 1, lc))(), ErroreUtente)
})

test('registra e annulla consumi ripristina esattamente le giacenze', () => {
  const db = creaDbTest()
  const sem = materia(db, 'Seme', 'semente', 'kg')
  const a = lotto(db, sem, 'A', 10, '2026-12-31')
  const b = lotto(db, sem, 'B', 10, '2027-12-31')
  db.transaction(() => registraConsumi(db, 'semina', 7, sem, scaricaPerMateria(db, sem, 15, null)))()
  assert.equal(conta(db, 'agri_consumi'), 2)
  db.transaction(() => annullaConsumi(db, 'semina', 7))()
  assert.equal(residuo(db, a), 10)
  assert.equal(residuo(db, b), 10)
  assert.equal(conta(db, 'agri_consumi'), 0)
})

test('lotti disponibili per categoria, con calibro e stagione', () => {
  const db = creaDbTest()
  const sem = materia(db, 'Seme', 'semente', 'kg')
  const conc = materia(db, 'NPK', 'concime', 'q')
  lotto(db, sem, 'A', 10)
  lotto(db, sem, 'VUOTO', 0)
  lotto(db, conc, 'C', 5)
  const l = lottiDisponibili(db, ['semente'])
  assert.equal(l.length, 1)
  assert.equal(l[0].codice, 'A')
  assert.equal(l[0].materia_prima_nome, 'Seme')
  assert.equal(l[0].unita_misura, 'kg')
  assert.equal(l[0].origine_tipo, 'acquisto')
})

test('lotto usato a valle: cotta, consumo agricolo, residuo modificato', () => {
  const db = creaDbTest()
  const sem = materia(db, 'Seme', 'semente', 'kg')
  const libero = lotto(db, sem, 'LIBERO', 10)
  const usato = lotto(db, sem, 'USATO', 10)
  assert.equal(lottoUsatoAValle(db, libero), null)
  db.transaction(() => registraConsumi(db, 'operazione', 1, sem, scaricaPerMateria(db, sem, 2, usato)))()
  assert.match(lottoUsatoAValle(db, usato) ?? '', /usato/i)
})

function seminaConSemente(campo_id: number, materia_prima_id: number, quantita: number, lotto_id: number | null = null): SeminaPayload {
  return {
    campo_id,
    stagione: '2025/2026',
    coltura: 'orzo',
    varieta: 'Concerto',
    data: '2025-11-15',
    superficie_ha: 10,
    semente_testo: null,
    semente: { materia_prima_id, quantita, lotto_id },
    note: null
  }
}

test('semina con semente dal magazzino: scarica, mostra il lotto, modifica e elimina ripristinano', () => {
  const db = creaDbTest()
  const campo = salvaCampo(db, null, { nome: 'C1', superficie_ha: 10, localita: null, rif_catastale: null, note: null })
  const sem = materia(db, 'Orzo da seme', 'semente', 'kg')
  const a = lotto(db, sem, 'SEM-77', 2000, '2026-06-30')
  const id = salvaSemina(db, null, seminaConSemente(campo, sem, 1800))
  assert.equal(residuo(db, a), 200)
  const s = listaSemine(db, { stagione: null })[0]
  assert.equal(s.semente.length, 1)
  assert.equal(s.semente[0].lotto_codice, 'SEM-77')
  assert.equal(s.semente[0].quantita, 1800)
  // modifica: 1500 kg → il lotto torna a 500
  salvaSemina(db, id, seminaConSemente(campo, sem, 1500))
  assert.equal(residuo(db, a), 500)
  // modifica oltre la giacenza (2000 disponibili contando quanto gia scaricato): ok fino a 2000, 2001 no
  assert.throws(() => salvaSemina(db, id, seminaConSemente(campo, sem, 2001)), ErroreUtente)
  assert.equal(residuo(db, a), 500, 'un errore non deve lasciare scarichi a meta')
  // togliere la semente dal magazzino ripristina tutto
  salvaSemina(db, id, { ...seminaConSemente(campo, sem, 1), semente: null, semente_testo: 'altro' })
  assert.equal(residuo(db, a), 2000)
  salvaSemina(db, id, seminaConSemente(campo, sem, 1000))
  eliminaSemina(db, id)
  assert.equal(residuo(db, a), 2000)
  assert.equal(conta(db, 'agri_consumi'), 0)
})

test('semina: la semente deve essere una materia prima di categoria semente', () => {
  const db = creaDbTest()
  const campo = salvaCampo(db, null, { nome: 'C1', superficie_ha: 10, localita: null, rif_catastale: null, note: null })
  const conc = materia(db, 'NPK', 'concime', 'q')
  lotto(db, conc, 'C', 10)
  assert.throws(() => salvaSemina(db, null, seminaConSemente(campo, conc, 1)), ErroreUtente)
})

test('dati fitofarmaco: si aggiornano solo i campi presenti, gli altri restano', async () => {
  const { salvaDatiFitofarmaco } = await import('../../src/main/agricolo/servizi/magazzino')
  const db = creaDbTest()
  const f = materia(db, 'Fungicida X', 'fitofarmaco', 'L')
  salvaDatiFitofarmaco(db, f, { numero_registrazione: 'REG-123', principio_attivo: 'Tebuconazolo', tempo_carenza_giorni: 30 })
  salvaDatiFitofarmaco(db, f, {}) // modifica dal magazzino normale: non tocca nulla
  salvaDatiFitofarmaco(db, f, { principio_attivo: ' Procloraz ' })
  const r = db.prepare(`SELECT numero_registrazione, principio_attivo, tempo_carenza_giorni FROM materie_prime WHERE id = ?`).get(f)
  assert.deepEqual(r, { numero_registrazione: 'REG-123', principio_attivo: 'Procloraz', tempo_carenza_giorni: 30 })
  salvaDatiFitofarmaco(db, f, { tempo_carenza_giorni: null })
  assert.equal((db.prepare(`SELECT tempo_carenza_giorni t FROM materie_prime WHERE id = ?`).get(f) as { t: number | null }).t, null)
  assert.throws(() => salvaDatiFitofarmaco(db, f, { tempo_carenza_giorni: -3 }), ErroreUtente)
  assert.throws(() => salvaDatiFitofarmaco(db, f, { tempo_carenza_giorni: 2.5 }), ErroreUtente)
})
