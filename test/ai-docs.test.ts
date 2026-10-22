import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cercaDocs, isSezioneValida } from '../src/main/ai/docs'
import { promptDiSistema } from '../src/main/ai/prompt'

const testoVoce = (d: { titolo: string; descrizione: string; azioni: string[] }): string =>
  `${d.titolo} ${d.descrizione} ${d.azioni.join(' ')}`.toLowerCase()

test('guida: gli ingredienti di una cotta si possono modificare, anche dopo l’avvio', () => {
  const r = cercaDocs('come modifico gli ingredienti di una cotta già avviata', 3)
  assert.equal(r[0].sezione, 'produzione')
  const t = testoVoce(r[0])
  assert.match(t, /modifica ingredienti/)
  assert.match(t, /anche a cotta (già )?avviata/)
})

test('guida: le schermate del modulo agricolo si trovano', () => {
  assert.equal(
    cercaDocs('maltazione essiccazione post-essiccazione', 1)[0].sezione,
    'agri-maltazioni'
  )
  assert.equal(cercaDocs('calibratura frazioni calibro', 1)[0].sezione, 'agri-calibrature')
  assert.equal(
    cercaDocs('trattamento fitofarmaco tempo di carenza', 1)[0].sezione,
    'agri-operazioni'
  )
  assert.equal(
    cercaDocs('tracciabilità dal campo alla bottiglia', 1)[0].sezione,
    'agri-tracciabilita'
  )
  assert.equal(cercaDocs('registrare una raccolta di orzo', 1)[0].sezione, 'agri-raccolte')
})

test('guida: chiave di Bira, modulo agricolo, tema chiaro, lotti imballi', () => {
  assert.match(testoVoce(cercaDocs('dove inserisco la chiave di Bira', 1)[0]), /chiave di bira/)
  assert.match(testoVoce(cercaDocs('come attivo il modulo agricolo', 1)[0]), /moduli aggiuntivi/)
  assert.match(testoVoce(cercaDocs('tema chiaro schermo bianco', 1)[0]), /sole/)
  assert.match(testoVoce(cercaDocs('lotti imballi haccp bottiglie', 1)[0]), /haccp/)
})

test('sezioni agricole navigabili solo a modulo acceso', () => {
  assert.equal(isSezioneValida('agri-maltazioni', { moduloAgricolo: false }), false)
  assert.equal(isSezioneValida('agri-maltazioni', { moduloAgricolo: true }), true)
  assert.equal(isSezioneValida('produzione'), true)
  assert.equal(isSezioneValida('inventata', { moduloAgricolo: true }), false)
})

test('prompt di sistema: data di oggi, formati italiani, codici clienti; agricolo solo se acceso', () => {
  const spento = promptDiSistema({ oggi: '2026-10-22', moduloAgricolo: false })
  assert.match(spento, /22\/10\/2026/)
  assert.match(spento, /gg\/mm\/aaaa/)
  assert.match(spento, /CLIENTE-/)
  assert.doesNotMatch(spento, /maltazion/i)
  assert.ok(spento.length < 2500, `prompt: ${spento.length} caratteri`)
  const acceso = promptDiSistema({ oggi: '2026-10-22', moduloAgricolo: true })
  assert.match(acceso, /maltazion/i)
  assert.ok(acceso.length < 2900, `prompt agricolo: ${acceso.length} caratteri`)
})

test('prompt: le schermate si citano col nome, non col codice interno', () => {
  assert.match(
    promptDiSistema({ oggi: '2026-10-22', moduloAgricolo: false }),
    /nome della schermata/
  )
})

test('guida: gli ingredienti si correggono in qualsiasi stato della cotta e si tolgono col cestino', () => {
  const t = testoVoce(cercaDocs('modificare ingredienti cotta confezionata', 1)[0])
  assert.match(t, /anche dopo il confezionamento/)
  assert.match(t, /cestino/)
})

test('prompt: nelle domande di aiuto niente passaggi o limiti inventati', () => {
  const p = promptDiSistema({ oggi: '2026-10-22', moduloAgricolo: false })
  assert.match(p, /non aggiungere passaggi o limiti/)
  assert.ok(p.length < 2500, `prompt: ${p.length}`)
})

test('prompt: i codici dei clienti vanno trattati come nomi', () => {
  assert.match(
    promptDiSistema({ oggi: '2026-10-22', moduloAgricolo: false }),
    /come se fossero nomi/
  )
})
