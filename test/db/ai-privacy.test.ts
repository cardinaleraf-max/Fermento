import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  creaRegistroSoggetti,
  ErrorePrivacy,
  guardia,
  pseudonimizza,
  pseudonimizzaValori,
  ripristina,
  ripristinaValori
} from '../../src/main/ai/privacy'
import { creaDbTest } from './helpers'
import {
  CHIAVE_GROQ,
  CLIENTE_BACCO,
  CLIENTE_PUB,
  FORNITORE,
  FORNITORE_LIBERO,
  NOTA_VENDITA,
  OPERATORE,
  PERCORSO_BACKUP,
  RIF_CATASTALE,
  seminaDatiBira,
  TITOLARE
} from './ai-fixture'

function preparato(): {
  reg: ReturnType<typeof creaRegistroSoggetti>
  ids: ReturnType<typeof seminaDatiBira>
} {
  const db = creaDbTest()
  const ids = seminaDatiBira(db)
  return { reg: creaRegistroSoggetti(db), ids }
}

test('i nomi di clienti, fornitori, titolare e operatori diventano codici', () => {
  const { reg, ids } = preparato()
  const testo = `${CLIENTE_PUB.nome} ha preso 3 fusti; ${FORNITORE.nome} consegna; firmato ${TITOLARE}; trattamento di ${OPERATORE}; vetri da ${FORNITORE_LIBERO}`
  const p = pseudonimizza(reg, testo)
  assert.ok(p.includes(`CLIENTE-${ids.pub}`))
  assert.ok(p.includes(`FORNITORE-${ids.fornitore}`))
  assert.ok(p.includes('TITOLARE-1'))
  assert.match(p, /OPERATORE-\d+/)
  assert.match(p, /FORNITORE-T\d+/)
  for (const v of [CLIENTE_PUB.nome, FORNITORE.nome, TITOLARE, OPERATORE, FORNITORE_LIBERO]) {
    assert.ok(!p.includes(v), `è rimasto in chiaro: ${v}`)
  }
  assert.equal(ripristina(reg, p), testo)
})

test('il nome scritto in minuscolo dall’utente viene comunque sostituito', () => {
  const { reg, ids } = preparato()
  const p = pseudonimizza(reg, 'quanto ha preso il pub la botte a settembre?')
  assert.equal(p, `quanto ha preso il CLIENTE-${ids.pub} a settembre?`)
})

test('nome cliente dentro un’altra parola composta: sostituzione reversibile, niente in chiaro', () => {
  const { reg, ids } = preparato()
  const testo = 'Malto Bacco: 10 kg. Bacco ha ricevuto omaggi. Baccone e Bacchetta no.'
  const p = pseudonimizza(reg, testo)
  assert.ok(!/\bBacco\b/.test(p))
  assert.ok(p.includes(`Malto CLIENTE-${ids.bacco}`))
  assert.ok(p.includes('Baccone e Bacchetta'), 'le parole più lunghe non vanno toccate')
  assert.equal(ripristina(reg, p), testo)
})

test('valori annidati: pseudonimizzati e ripristinati (le chiavi non si toccano)', () => {
  const { reg, ids } = preparato()
  const dati = {
    righe: [
      { cliente: CLIENTE_PUB.nome, fusti: 3 },
      { cliente: CLIENTE_BACCO.nome, n: null }
    ],
    ok: true
  }
  const p = pseudonimizzaValori(reg, dati)
  assert.deepEqual(p, {
    righe: [
      { cliente: `CLIENTE-${ids.pub}`, fusti: 3 },
      { cliente: `CLIENTE-${ids.bacco}`, n: null }
    ],
    ok: true
  })
  assert.deepEqual(ripristinaValori(reg, p), dati)
})

test('codici sconosciuti o scritti in altro modo restano come sono', () => {
  const { reg } = preparato()
  assert.equal(ripristina(reg, 'CLIENTE-999 e CLIENTE-'), 'CLIENTE-999 e CLIENTE-')
})

test('la guardia blocca email, telefono (anche solo cifre), P.IVA, indirizzo e nomi dentro un pacchetto', () => {
  const { reg } = preparato()
  const casi = [
    CLIENTE_PUB.email,
    '3281688823',
    CLIENTE_PUB.telefono,
    CLIENTE_BACCO.partita_iva,
    CLIENTE_PUB.indirizzo,
    CLIENTE_PUB.nome,
    'il pub la botte',
    FORNITORE.contatto,
    TITOLARE,
    RIF_CATASTALE,
    CHIAVE_GROQ,
    PERCORSO_BACKUP,
    NOTA_VENDITA,
    CLIENTE_PUB.note
  ]
  for (const c of casi) {
    const payload = JSON.stringify({
      messages: [{ role: 'tool', content: JSON.stringify({ x: [{ y: `testo ${c} fine` }] }) }]
    })
    assert.throws(() => guardia(reg, payload), ErrorePrivacy, `non bloccato: ${c}`)
  }
})

test('la guardia lascia passare un pacchetto di lavoro normale', () => {
  const { reg, ids } = preparato()
  const payload = JSON.stringify({
    messages: [
      { role: 'system', content: 'Sei Bira. Oggi è 22/10/2026.' },
      { role: 'user', content: `Quanti fusti deve rendere CLIENTE-${ids.pub}?` },
      {
        role: 'tool',
        content: JSON.stringify({
          materie: [
            { nome: 'Malto Pilsner', giacenza: 275 },
            { nome: `Malto CLIENTE-${ids.bacco}`, giacenza: 10 }
          ],
          lotto: 'MP-2026-02',
          cotte: 2
        })
      }
    ]
  })
  assert.doesNotThrow(() => guardia(reg, payload))
})

test('DB senza modulo agricolo o vuoto: il registro si crea senza errori', () => {
  const db = creaDbTest()
  db.exec('DROP TABLE agri_operazioni')
  const reg = creaRegistroSoggetti(db)
  assert.equal(pseudonimizza(reg, 'niente da sostituire'), 'niente da sostituire')
  assert.doesNotThrow(() => guardia(reg, '{"a":"b"}'))
})

test('codici scritti dal modello con trattini tipografici (‑ – −) tornano comunque col nome vero', () => {
  const { reg, ids } = preparato()
  for (const trattino of ['‑', '‐', '–', '−']) {
    assert.equal(ripristina(reg, `CLIENTE${trattino}${ids.pub} ok`), `${CLIENTE_PUB.nome} ok`)
  }
})
