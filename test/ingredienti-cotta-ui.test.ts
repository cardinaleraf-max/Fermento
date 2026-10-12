import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  insufficiente,
  payloadDaRighe,
  rigaPerMateria,
  righeDaCotta,
  sostituisci,
  righeDaRicetta,
  righeModificate,
  tolti,
  type RigaBozza
} from '../src/renderer/src/lib/ingredientiCotta'

const ricetta = [
  {
    materia_prima_id: 1,
    mp_nome: 'Malto Pilsner',
    unita_misura: 'kg',
    quantita: 55,
    giacenza_totale: 160
  },
  {
    materia_prima_id: 2,
    mp_nome: 'Luppolo Saaz',
    unita_misura: 'g',
    quantita: 5.5,
    giacenza_totale: 3
  }
]

function conQuantita(righe: RigaBozza[], mp: number, quantita: string): RigaBozza[] {
  return righe.map((r) => (r.materia_prima_id === mp ? { ...r, quantita } : r))
}

test('righe dalla ricetta: quantità con la virgola, riferimento e disponibilità = giacenza', () => {
  const righe = righeDaRicetta(ricetta)
  assert.deepEqual(
    righe.map((r) => [r.mp_nome, r.quantita, r.riferimento, r.giacenza, r.disponibile]),
    [
      ['Malto Pilsner', '55', 55, 160, 160],
      ['Luppolo Saaz', '5,5', 5.5, 3, 3]
    ]
  )
  assert.equal(new Set(righe.map((r) => r.chiave)).size, 2)
})

test('righe da una cotta avviata: si può usare la giacenza più quanto già scaricato', () => {
  const righe = righeDaCotta([
    {
      materia_prima_id: 1,
      mp_nome: 'Malto Pilsner',
      unita_misura: 'kg',
      quantita: 55,
      giacenza: 105
    }
  ])
  assert.equal(righe[0].disponibile, 160)
  assert.equal(righe[0].riferimento, 55)
  assert.equal(righe[0].quantita, '55')
})

test('payload: virgola decimale, duplicati sommati, zero ammesso (= togli)', () => {
  let righe = righeDaRicetta(ricetta)
  righe = conQuantita(righe, 1, '60,5')
  righe = [...righe, { ...righe[0], chiave: 'x', quantita: '1' }]
  righe = conQuantita(righe, 2, '0')
  const p = payloadDaRighe(righe)
  assert.deepEqual(p, {
    ok: true,
    ingredienti: [
      { materia_prima_id: 1, quantita: 61.5 },
      { materia_prima_id: 2, quantita: 0 }
    ]
  })
})

test('payload: errori leggibili per quantità vuota, non numerica, negativa e ingrediente non scelto', () => {
  const righe = righeDaRicetta(ricetta)
  assert.deepEqual(payloadDaRighe(conQuantita(righe, 1, ' ')), {
    ok: false,
    errore: 'Inserisci la quantità di Malto Pilsner.'
  })
  for (const q of ['abc', '-1', '1,2,3']) {
    const p = payloadDaRighe(conQuantita(righe, 1, q))
    assert.equal(p.ok, false)
    assert.match((p as { errore: string }).errore, /Quantità non valida per Malto Pilsner/)
  }
  const vuota: RigaBozza = { ...righe[0], chiave: 'n', materia_prima_id: 0, mp_nome: '' }
  assert.deepEqual(payloadDaRighe([...righe, vuota]), {
    ok: false,
    errore: "Scegli l'ingrediente nella riga aggiunta, oppure toglila."
  })
})

test('righeModificate: ordine e scrittura dei numeri non contano, quantità e composizione sì', () => {
  const iniziali = righeDaRicetta(ricetta)
  assert.equal(righeModificate([...iniziali].reverse(), iniziali), false)
  assert.equal(righeModificate(conQuantita(iniziali, 1, '55,0'), iniziali), false)
  assert.equal(righeModificate(conQuantita(iniziali, 1, '56'), iniziali), true)
  assert.equal(righeModificate(iniziali.slice(1), iniziali), true)
  assert.equal(righeModificate(conQuantita(iniziali, 1, 'x'), iniziali), true)
})

test('insufficiente: confronta la quantità digitata con il disponibile', () => {
  const [pils, saaz] = righeDaRicetta(ricetta)
  assert.equal(insufficiente(pils), false)
  assert.equal(insufficiente(saaz), true)
  assert.equal(insufficiente({ ...pils, quantita: '160' }), false)
  assert.equal(insufficiente({ ...pils, quantita: '160,1' }), true)
  assert.equal(insufficiente({ ...pils, quantita: '' }), false)
})

test('tolti: ingredienti iniziali che non sono più nella cotta', () => {
  const iniziali = righeDaRicetta(ricetta)
  assert.deepEqual(tolti(iniziali.slice(0, 1), iniziali), [
    { mp_nome: 'Luppolo Saaz', riferimento: 5.5, unita_misura: 'g' }
  ])
  assert.deepEqual(tolti(iniziali, iniziali), [])
})

test('rigaPerMateria: riferimento e disponibilità tengono conto di quanto già nella cotta', () => {
  const m = { id: 7, nome: 'Luppolo Cascade', unita_misura: 'g', giacenza_totale: 300 }
  const riferimenti = new Map([[7, 200]])
  const giaUsato = new Map([[7, 200]])
  const r = rigaPerMateria(m, 'k1', '', riferimenti, giaUsato)
  assert.deepEqual(
    [r.materia_prima_id, r.mp_nome, r.riferimento, r.giacenza, r.disponibile, r.quantita],
    [7, 'Luppolo Cascade', 200, 300, 500, '']
  )
  const nuova = rigaPerMateria(m, 'k2', '10', new Map(), new Map())
  assert.equal(nuova.riferimento, null)
  assert.equal(nuova.disponibile, 300)
})

test('sostituisci: la quantità resta solo se l unità è la stessa, altrimenti va riscritta', () => {
  const [, saaz] = righeDaRicetta(ricetta)
  const citra = { id: 8, nome: 'Luppolo Citra', unita_misura: 'g', giacenza_totale: 1550 }
  const frumento = { id: 9, nome: 'Malto di Frumento', unita_misura: 'kg', giacenza_totale: 90 }
  const conCitra = sostituisci(saaz, citra, new Map(), new Map())
  assert.deepEqual(
    [conCitra.chiave, conCitra.materia_prima_id, conCitra.quantita],
    [saaz.chiave, 8, '5,5']
  )
  const conFrumento = sostituisci(saaz, frumento, new Map(), new Map())
  assert.deepEqual(
    [conFrumento.materia_prima_id, conFrumento.quantita, conFrumento.unita_misura],
    [9, '', 'kg']
  )
  const vuota = { ...saaz, materia_prima_id: 0, quantita: '3' }
  assert.equal(sostituisci(vuota, citra, new Map(), new Map()).quantita, '')
})
