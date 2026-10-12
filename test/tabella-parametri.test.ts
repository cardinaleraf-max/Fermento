import { test } from 'node:test'
import assert from 'node:assert/strict'
import { comeTabella } from '../src/renderer/src/lib/tabellaParametri'
import type { Parametro } from '../src/shared/agricolo'

let id = 0
function p(
  nome: string,
  unita: string | null = null,
  tipo: Parametro['tipo'] = 'numero'
): Parametro {
  id += 1
  return { id, gruppo_id: 1, nome, unita, tipo, ordine: id }
}

function essiccazione(): Parametro[] {
  return ['Curva umida', 'Calo peso', 'Colpo di fuoco'].flatMap((f) => [
    p(`${f} – Umidità`, '%'),
    p(`${f} – Temp. entrata`, '°C'),
    p(`${f} – Durata`, 'ore')
  ])
}

test('griglia completa di numeri «Riga – Colonna» → tabella con righe e colonne nell ordine', () => {
  const parametri = essiccazione()
  const t = comeTabella(parametri)
  assert.ok(t)
  assert.deepEqual(t.colonne, [
    { nome: 'Umidità', unita: '%' },
    { nome: 'Temp. entrata', unita: '°C' },
    { nome: 'Durata', unita: 'ore' }
  ])
  assert.deepEqual(
    t.righe.map((r) => [r.nome, r.celle.map((c) => c.id)]),
    [
      ['Curva umida', parametri.slice(0, 3).map((c) => c.id)],
      ['Calo peso', parametri.slice(3, 6).map((c) => c.id)],
      ['Colpo di fuoco', parametri.slice(6, 9).map((c) => c.id)]
    ]
  )
})

test('anche il trattino semplice con gli spazi separa riga e colonna', () => {
  const t = comeTabella([
    p('Curva 1 - Ore', 'ore'),
    p('Curva 1 - Temp', '°C'),
    p('Curva 2 - Ore', 'ore'),
    p('Curva 2 - Temp', '°C')
  ])
  assert.deepEqual(
    t?.righe.map((r) => r.nome),
    ['Curva 1', 'Curva 2']
  )
  assert.deepEqual(
    t?.colonne.map((c) => c.nome),
    ['Ore', 'Temp']
  )
})

test('un parametro fuori schema, un tipo non numerico o una riga incompleta → elenco normale', () => {
  assert.equal(comeTabella([...essiccazione(), p('Friabilità', null, 'scala')]), null)
  assert.equal(comeTabella([...essiccazione(), p('Note')]), null)
  const conTesto = essiccazione()
  conTesto[4] = { ...conTesto[4], tipo: 'testo' }
  assert.equal(comeTabella(conTesto), null)
  assert.equal(comeTabella(essiccazione().slice(0, 8)), null)
  const colonneDiverse = essiccazione()
  colonneDiverse[5] = { ...colonneDiverse[5], nome: 'Calo peso – Ore' }
  assert.equal(comeTabella(colonneDiverse), null)
})

test('servono almeno 2 righe e 2 colonne; i nomi con trattini senza spazi non contano', () => {
  assert.equal(comeTabella([p('Curva – Umidità'), p('Curva – Durata')]), null)
  assert.equal(comeTabella([p('A – X'), p('B – X')]), null)
  assert.equal(comeTabella([p('2,2-2,5 mm'), p('2,5-2,8 mm'), p('>2,8 mm'), p('<2,2 mm')]), null)
  assert.equal(comeTabella([]), null)
})

test('righe o colonne ripetute → elenco normale', () => {
  assert.equal(comeTabella([p('A – X'), p('A – Y'), p('A – X'), p('A – Y')]), null)
})

test('unità diversa nella stessa colonna → la colonna non ha unità comune', () => {
  const t = comeTabella([
    p('A – Durata', 'ore'),
    p('A – Temp', '°C'),
    p('B – Durata', 'min'),
    p('B – Temp', '°C')
  ])
  assert.deepEqual(t?.colonne, [
    { nome: 'Durata', unita: null },
    { nome: 'Temp', unita: '°C' }
  ])
})
