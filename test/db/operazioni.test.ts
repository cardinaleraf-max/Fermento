import { test } from 'node:test'
import assert from 'node:assert/strict'
import { creaDbTest } from './helpers'
import { conta, lotto, materia, residuo } from './fixture'
import { salvaCampo, salvaSemina } from '../../src/main/agricolo/servizi/campi'
import {
  eliminaOperazione,
  listaOperazioni,
  salvaOperazione,
  trattamentiConCarenza
} from '../../src/main/agricolo/servizi/operazioni'
import { ErroreUtente } from '../../src/main/agricolo/errori'
import type BetterSqlite3 from 'better-sqlite3'
import type { OperazionePayload } from '../../src/shared/agricolo'

function preparaSemina(db: BetterSqlite3.Database, superficie = 10): number {
  const campo = salvaCampo(db, null, { nome: 'Campo 1A', superficie_ha: superficie, localita: null, rif_catastale: null, note: null })
  return salvaSemina(db, null, {
    campo_id: campo,
    stagione: '2025/2026',
    coltura: 'orzo',
    varieta: 'Concerto',
    data: '2025-11-15',
    superficie_ha: superficie,
    semente_testo: null,
    semente: null,
    note: null
  })
}

const base = (semina_id: number, extra: Partial<OperazionePayload> = {}): OperazionePayload => ({
  semina_id,
  tipo: 'concimazione',
  data: '2026-02-10',
  prodotto: null,
  motivo: 'Concimazione di copertura',
  operatore: 'Mauro',
  note: null,
  ...extra
})

test('concimazione con prodotto: scarica il lotto, calcola la dose per ettaro', () => {
  const db = creaDbTest()
  const semina = preparaSemina(db, 10)
  const npk = materia(db, 'Nitrato ammonico 27%', 'concime', 'q')
  const l = lotto(db, npk, 'NA-1', 30)
  salvaOperazione(db, null, base(semina, { prodotto: { materia_prima_id: npk, quantita: 15, lotto_id: null } }))
  assert.equal(residuo(db, l), 15)
  const [op] = listaOperazioni(db, { stagione: '2025/2026' })
  assert.equal(op.tipo, 'concimazione')
  assert.equal(op.materia_prima_nome, 'Nitrato ammonico 27%')
  assert.equal(op.quantita, 15)
  assert.equal(op.dose_ha, 1.5)
  assert.equal(op.lotti.length, 1)
  assert.equal(op.lotti[0].lotto_codice, 'NA-1')
  assert.equal(op.campo_nome, 'Campo 1A')
})

test('trattamento: prodotto obbligatorio, deve essere un fitofarmaco; fine carenza calcolata', () => {
  const db = creaDbTest()
  const semina = preparaSemina(db)
  const fungicida = materia(db, 'Fungicida X', 'fitofarmaco', 'L', { carenza: 30 })
  const npk = materia(db, 'NPK', 'concime', 'q')
  lotto(db, fungicida, 'F1', 10)
  lotto(db, npk, 'N1', 10)
  assert.throws(() => salvaOperazione(db, null, base(semina, { tipo: 'trattamento' })), ErroreUtente)
  assert.throws(
    () => salvaOperazione(db, null, base(semina, { tipo: 'trattamento', prodotto: { materia_prima_id: npk, quantita: 1, lotto_id: null } })),
    ErroreUtente
  )
  salvaOperazione(
    db,
    null,
    base(semina, { tipo: 'trattamento', data: '2026-05-20', motivo: 'Ruggine', prodotto: { materia_prima_id: fungicida, quantita: 2, lotto_id: null } })
  )
  const [op] = listaOperazioni(db, { tipo: 'trattamento' })
  assert.equal(op.fine_carenza, '2026-06-19')
  assert.equal(op.tempo_carenza_giorni, 30)
  assert.deepEqual(trattamentiConCarenza(db, semina), [{ data: '2026-05-20', giorni: 30, prodotto: 'Fungicida X' }])
})

test('lavorazione e irrigazione senza prodotto sono valide', () => {
  const db = creaDbTest()
  const semina = preparaSemina(db)
  salvaOperazione(db, null, base(semina, { tipo: 'lavorazione', motivo: 'Erpicatura' }))
  salvaOperazione(db, null, base(semina, { tipo: 'irrigazione' }))
  const ops = listaOperazioni(db, {})
  assert.equal(ops.length, 2)
  assert.equal(ops[0].materia_prima_id, null)
  assert.equal(ops[0].dose_ha, null)
})

test('modifica quantita e cambio prodotto ripristinano e riapplicano gli scarichi', () => {
  const db = creaDbTest()
  const semina = preparaSemina(db)
  const a = materia(db, 'Concime A', 'concime', 'q')
  const b = materia(db, 'Concime B', 'concime', 'kg')
  const la = lotto(db, a, 'A1', 20)
  const lb = lotto(db, b, 'B1', 500)
  const id = salvaOperazione(db, null, base(semina, { prodotto: { materia_prima_id: a, quantita: 10, lotto_id: null } }))
  salvaOperazione(db, id, base(semina, { prodotto: { materia_prima_id: a, quantita: 12, lotto_id: null } }))
  assert.equal(residuo(db, la), 8)
  salvaOperazione(db, id, base(semina, { prodotto: { materia_prima_id: b, quantita: 100, lotto_id: lb } }))
  assert.equal(residuo(db, la), 20)
  assert.equal(residuo(db, lb), 400)
  // una modifica che fallisce non cambia nulla
  assert.throws(() => salvaOperazione(db, id, base(semina, { prodotto: { materia_prima_id: b, quantita: 501, lotto_id: null } })), ErroreUtente)
  assert.equal(residuo(db, lb), 400)
  eliminaOperazione(db, id)
  assert.equal(residuo(db, lb), 500)
  assert.equal(conta(db, 'agri_consumi'), 0)
  assert.equal(conta(db, 'agri_operazioni'), 0)
})

test('filtri: stagione, campo, semina e tipo', () => {
  const db = creaDbTest()
  const semina = preparaSemina(db)
  salvaOperazione(db, null, base(semina, { tipo: 'lavorazione' }))
  salvaOperazione(db, null, base(semina, { tipo: 'irrigazione' }))
  assert.equal(listaOperazioni(db, { stagione: '2024/2025' }).length, 0)
  assert.equal(listaOperazioni(db, { semina_id: semina }).length, 2)
  assert.equal(listaOperazioni(db, { tipo: 'irrigazione' }).length, 1)
})

test('validazioni: semina inesistente, tipo non valido, data errata', () => {
  const db = creaDbTest()
  const semina = preparaSemina(db)
  assert.throws(() => salvaOperazione(db, null, base(999)), ErroreUtente)
  assert.throws(() => salvaOperazione(db, null, base(semina, { tipo: 'potatura' as unknown as 'altro' })), ErroreUtente)
  assert.throws(() => salvaOperazione(db, null, base(semina, { tipo: 'lavorazione', data: '10/02/2026' })), ErroreUtente)
})
