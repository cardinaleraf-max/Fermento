import { test } from 'node:test'
import assert from 'node:assert/strict'
import { creaDbTest } from './helpers'
import { filiera } from './fixture-filiera'
import { cercaPartenze, traccia } from '../../src/main/agricolo/servizi/tracciabilita'
import { alberoACsv } from '../../src/main/agricolo/csv'
import type { NodoTraccia } from '../../src/shared/agricolo'

function appiattisci(
  nodi: NodoTraccia[],
  livello = 1,
  out: Array<{ livello: number; nodo: NodoTraccia }> = []
): Array<{ livello: number; nodo: NodoTraccia }> {
  for (const n of nodi) {
    out.push({ livello, nodo: n })
    appiattisci(n.figli, livello + 1, out)
  }
  return out
}

function dettaglio(n: NodoTraccia, etichetta: string): string | undefined {
  return n.dettagli.find((d) => d.etichetta === etichetta)?.valore
}

test('a ritroso dalla cotta: malto → maltazione → orzo calibrato → calibratura → grezzo → raccolta → semina → campo e operazioni; imballi', () => {
  const db = creaDbTest()
  const f = filiera(db)
  const albero = traccia(db, { tipo: 'cotta', id: f.cotta }, 'indietro')
  const tutti = appiattisci(albero)
  const tipi = tutti.map((t) => t.nodo.tipo)
  for (const t of [
    'cotta',
    'lotto',
    'maltazione',
    'calibratura',
    'raccolta',
    'semina',
    'campo',
    'operazione',
    'imballo'
  ]) {
    assert.ok(tipi.includes(t as NodoTraccia['tipo']), `manca il nodo ${t}`)
  }
  const ordineMalto = [
    'cotta',
    'lotto',
    'maltazione',
    'lotto',
    'calibratura',
    'lotto',
    'raccolta',
    'semina'
  ]
  // il percorso del malto scende di un livello a ogni passo
  const percorso: string[] = []
  let corrente: NodoTraccia | undefined = albero[0]
  while (corrente && percorso.length < ordineMalto.length) {
    percorso.push(corrente.tipo)
    corrente = corrente.figli.find((x) => x.tipo !== 'gruppo' && x.titolo.indexOf('Cascade') < 0)
  }
  assert.deepEqual(percorso, ordineMalto)
  const campo = tutti.find((t) => t.nodo.tipo === 'campo')!.nodo
  assert.equal(campo.titolo, 'Campo 1A')
  const op = tutti.find((t) => t.nodo.tipo === 'operazione')!.nodo
  assert.match(op.titolo, /Trattamento/)
  assert.equal(dettaglio(op, 'Prodotto'), 'Fungicida X · lotto FG-1 · 2 L')
  const malt = tutti.find((t) => t.nodo.tipo === 'maltazione')!.nodo
  assert.equal(dettaglio(malt, 'Resa di maltazione'), '83,6%')
  assert.equal(dettaglio(malt, 'Germinazione · Dolcezza'), '8/10')
  const cal = tutti.find((t) => t.nodo.tipo === 'calibratura')!.nodo
  assert.equal(dettaglio(cal, 'Analisi orzo · Umidità'), '10 %')
  const imb = tutti.find((t) => t.nodo.tipo === 'imballo')!.nodo
  assert.match(imb.titolo, /Bottiglia 33 cl/)
  assert.match(imb.sottotitolo ?? '', /VER-1/)
  // la semente compare sotto la semina
  assert.ok(tutti.some((t) => t.nodo.tipo === 'lotto' && /SEM-77/.test(t.nodo.titolo)))
})

test('in avanti dal campo: semina → raccolta → lotti → calibratura → maltazione → malto → cotta → vendita al cliente', () => {
  const db = creaDbTest()
  const f = filiera(db)
  const tutti = appiattisci(traccia(db, { tipo: 'campo', id: f.campo }, 'avanti'))
  const tipi = tutti.map((t) => t.nodo.tipo)
  for (const t of [
    'campo',
    'semina',
    'raccolta',
    'lotto',
    'calibratura',
    'maltazione',
    'cotta',
    'vendita'
  ]) {
    assert.ok(tipi.includes(t as NodoTraccia['tipo']), `manca il nodo ${t}`)
  }
  const vendita = tutti.find((t) => t.nodo.tipo === 'vendita')!.nodo
  assert.match(vendita.titolo, /Bar Centrale Orosei/)
  assert.equal(dettaglio(vendita, 'Quantità'), '120 bottiglie')
})

test('in avanti da un lotto di fitofarmaco: dove e finito (operazione → semina → … → cotta)', () => {
  const db = creaDbTest()
  const f = filiera(db)
  const tipi = appiattisci(traccia(db, { tipo: 'lotto', id: f.lottoFungicida }, 'avanti')).map(
    (t) => t.nodo.tipo
  )
  assert.ok(tipi.includes('operazione'))
  assert.ok(tipi.includes('cotta'))
})

test('ricerca dei punti di partenza per codice e nome', () => {
  const db = creaDbTest()
  filiera(db)
  const p = cercaPartenze(db, '187')
  assert.ok(p.some((x) => x.tipo === 'lotto' && /187\/2026PTL/.test(x.etichetta)))
  assert.ok(cercaPartenze(db, 'L-2026-50').some((x) => x.tipo === 'cotta'))
  assert.ok(cercaPartenze(db, 'campo 1a').some((x) => x.tipo === 'campo'))
  assert.ok(cercaPartenze(db, '').length > 0)
})

test('il CSV contiene tutta la catena', () => {
  const db = creaDbTest()
  const f = filiera(db)
  const csv = alberoACsv(traccia(db, { tipo: 'cotta', id: f.cotta }, 'indietro'))
  assert.match(csv, /Cotta L-2026-50/)
  assert.match(csv, /Campo 1A/)
  assert.match(csv, /187\/2026PTL/)
})
