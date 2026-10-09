import { test } from 'node:test'
import assert from 'node:assert/strict'
import { alberoACsv } from '../src/main/agricolo/csv'
import type { NodoTraccia } from '../src/shared/agricolo'

const albero: NodoTraccia[] = [
  {
    chiave: 'cotta-1',
    tipo: 'cotta',
    titolo: 'Cotta L-2026-01',
    sottotitolo: 'Pils; "Marduk"',
    dettagli: [{ etichetta: 'Data', valore: '01/09/2026' }],
    figli: [
      {
        chiave: 'lotto-5',
        tipo: 'lotto',
        titolo: 'Malto 187/2026PTL',
        sottotitolo: null,
        dettagli: [],
        figli: []
      }
    ]
  }
]

test('alberoACsv: BOM, intestazione, separatore punto e virgola, livelli', () => {
  const csv = alberoACsv(albero)
  assert.ok(csv.startsWith('﻿'))
  const righe = csv.slice(1).split('\r\n')
  assert.equal(righe[0], 'Livello;Tipo;Elemento;Dettagli')
  assert.equal(righe[1], '1;Cotta;"Cotta L-2026-01 — Pils; ""Marduk""";Data: 01/09/2026')
  assert.equal(righe[2], '2;Lotto;    Malto 187/2026PTL;')
})
