import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CHIAVE_TEMA, inkTesto, leggiTema, salvaTema } from '../src/renderer/src/lib/tema'

function archivioFinto(iniziale: Record<string, string> = {}): Pick<
  Storage,
  'getItem' | 'setItem'
> & {
  dati: Record<string, string>
} {
  const dati = { ...iniziale }
  return {
    dati,
    getItem: (k) => (k in dati ? dati[k] : null),
    setItem: (k, v) => {
      dati[k] = v
    }
  }
}

test('senza scelta salvata resta il tema scuro di sempre', () => {
  assert.equal(leggiTema(archivioFinto()), 'scuro')
  assert.equal(leggiTema(null), 'scuro')
})

test('il tema chiaro scelto viene riletto', () => {
  assert.equal(leggiTema(archivioFinto({ [CHIAVE_TEMA]: 'chiaro' })), 'chiaro')
})

test('valori sconosciuti o archivio illeggibile → tema scuro', () => {
  assert.equal(leggiTema(archivioFinto({ [CHIAVE_TEMA]: 'viola' })), 'scuro')
  const rotto = {
    getItem: () => {
      throw new Error('accesso negato')
    },
    setItem: () => {}
  }
  assert.equal(leggiTema(rotto), 'scuro')
})

test('salvaTema scrive la scelta e non si rompe se l’archivio non funziona', () => {
  const a = archivioFinto()
  salvaTema(a, 'chiaro')
  assert.equal(a.dati[CHIAVE_TEMA], 'chiaro')
  salvaTema(a, 'scuro')
  assert.equal(leggiTema(a), 'scuro')
  const rotto = {
    getItem: () => null,
    setItem: () => {
      throw new Error('pieno')
    }
  }
  assert.doesNotThrow(() => salvaTema(rotto, 'chiaro'))
  assert.doesNotThrow(() => salvaTema(null, 'chiaro'))
})

test('inkTesto: nel tema scuro (a0=0, k=1) l’opacità resta quella indicata', () => {
  assert.equal(
    inkTesto(0.4),
    'rgb(var(--ink) / calc(var(--ink-a0-testo) + var(--ink-k-testo) * 0.4))'
  )
})
