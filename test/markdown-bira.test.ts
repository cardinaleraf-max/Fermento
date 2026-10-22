import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analizzaInline, analizzaMarkdown } from '../src/renderer/src/lib/markdownBira'

test('inline: grassetto, corsivo, codice e testo', () => {
  assert.deepEqual(analizzaInline('Hai **2 lotti** in *scadenza*: `CA-1` ok'), [
    { tipo: 'testo', testo: 'Hai ' },
    { tipo: 'grassetto', testo: '2 lotti' },
    { tipo: 'testo', testo: ' in ' },
    { tipo: 'corsivo', testo: 'scadenza' },
    { tipo: 'testo', testo: ': ' },
    { tipo: 'codice', testo: 'CA-1' },
    { tipo: 'testo', testo: ' ok' }
  ])
})

test('inline: asterischi isolati e nomi con trattino basso restano testo', () => {
  assert.deepEqual(analizzaInline('3 * 4 = 12 e ai_groq'), [
    { tipo: 'testo', testo: '3 * 4 = 12 e ai_groq' }
  ])
})

test('titoli, paragrafi separati da riga vuota, separatore', () => {
  const b = analizzaMarkdown('## Scadenze\nRiga uno\nriga due\n\nAltro paragrafo\n\n---')
  assert.equal(b[0].tipo, 'titolo')
  assert.deepEqual(b[1], {
    tipo: 'paragrafo',
    righe: [[{ tipo: 'testo', testo: 'Riga uno' }], [{ tipo: 'testo', testo: 'riga due' }]]
  })
  assert.equal(b[2].tipo, 'paragrafo')
  assert.equal(b[3].tipo, 'separatore')
})

test('elenchi puntati e numerati', () => {
  const b = analizzaMarkdown('- primo\n- **secondo**\n\n1. uno\n2) due')
  assert.deepEqual(b[0], {
    tipo: 'elenco',
    ordinato: false,
    voci: [[{ tipo: 'testo', testo: 'primo' }], [{ tipo: 'grassetto', testo: 'secondo' }]]
  })
  assert.equal(b[1].tipo, 'elenco')
  assert.equal(b[1].tipo === 'elenco' && b[1].ordinato, true)
  assert.equal(b[1].tipo === 'elenco' && b[1].voci.length, 2)
})

test('tabella con riga di separazione', () => {
  const b = analizzaMarkdown(
    '| Materia | Scadenza |\n|---|:---:|\n| Cascade | 21/11/2026 |\n| Saaz | 02/12/2026 |'
  )
  assert.equal(b.length, 1)
  const t = b[0]
  assert.equal(t.tipo, 'tabella')
  if (t.tipo !== 'tabella') return
  assert.deepEqual(t.intestazioni, [
    [{ tipo: 'testo', testo: 'Materia' }],
    [{ tipo: 'testo', testo: 'Scadenza' }]
  ])
  assert.equal(t.righe.length, 2)
  assert.deepEqual(t.righe[1][0], [{ tipo: 'testo', testo: 'Saaz' }])
})

test('codice HTML resta testo (nessuna interpretazione)', () => {
  assert.deepEqual(analizzaMarkdown('<script>alert(1)</script>'), [
    { tipo: 'paragrafo', righe: [[{ tipo: 'testo', testo: '<script>alert(1)</script>' }]] }
  ])
})

test('testo vuoto: nessun blocco', () => {
  assert.deepEqual(analizzaMarkdown('  \n\n'), [])
})

test('citazioni con «>» diventano testo normale', () => {
  assert.deepEqual(analizzaMarkdown('> Vuoi aprire la schermata?\n> Dimmi tu'), [
    {
      tipo: 'paragrafo',
      righe: [
        [{ tipo: 'testo', testo: 'Vuoi aprire la schermata?' }],
        [{ tipo: 'testo', testo: 'Dimmi tu' }]
      ]
    }
  ])
})
