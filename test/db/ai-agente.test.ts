import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ensureAiConfigRows, eseguiTurno, type EventoAgente } from '../../src/main/ai/bira'
import { generaAvvisiIntelligenti } from '../../src/main/ai/avvisi_intelligenti'
import { GestoreModelli } from '../../src/main/ai/modelli'
import type { ChatClient, ChatRequest, ChatResponse } from '../../src/main/ai/tipi'
import { creaDbTest } from './helpers'
import { CHIAVE_GROQ, CLIENTE_PUB, seminaDatiBira, VALORI_VIETATI } from './ai-fixture'

type Risposta = Pick<ChatResponse, 'message'>

/** Modello finto: risponde in sequenza e registra ogni pacchetto che «esce». */
function modelloFinto(risposte: Risposta[]): {
  client: ChatClient
  usciti: string[]
  richieste: ChatRequest[]
} {
  const usciti: string[] = []
  const richieste: ChatRequest[] = []
  const client: ChatClient = {
    async chat(body) {
      usciti.push(JSON.stringify(body))
      richieste.push(body)
      const r = risposte.shift() ?? { message: { role: 'assistant', content: 'fine' } }
      return { model: body.model, ...r }
    },
    async listaModelli() {
      return []
    }
  }
  return { client, usciti, richieste }
}

function preparato(): {
  db: ReturnType<typeof creaDbTest>
  ids: ReturnType<typeof seminaDatiBira>
} {
  const db = creaDbTest()
  return { db, ids: seminaDatiBira(db) }
}

function controllaNienteDatiClienti(usciti: string[]): void {
  assert.ok(usciti.length > 0, 'nessun pacchetto inviato')
  for (const p of usciti) {
    for (const v of VALORI_VIETATI) assert.ok(!p.includes(v), `uscito in chiaro: «${v}»`)
    assert.ok(!/\bBacco\b/.test(p), 'uscito in chiaro il nome Bacco')
  }
}

test('turno completo: nome cliente nella domanda e nella cronologia escono solo come codice e tornano col nome vero', async () => {
  const { db, ids } = preparato()
  const codice = `CLIENTE-${ids.pub}`
  const { client, usciti } = modelloFinto([
    {
      message: {
        role: 'assistant',
        content: '',
        tool_calls: [
          { id: 'c1', function: { name: 'vendite_cliente', arguments: { cliente: codice } } }
        ]
      }
    },
    {
      message: {
        role: 'assistant',
        content: `**${codice}** ha preso 120 bottiglie e 3 fusti di Bionda.`
      }
    }
  ])
  const eventi: EventoAgente[] = []
  await eseguiTurno({
    db,
    gestore: new GestoreModelli(client, { attendi: async () => {} }),
    oggi: '2026-10-22',
    cronologia: [
      { ruolo: 'user', contenuto: 'Chi ha fusti da rendere?' },
      { ruolo: 'assistant', contenuto: `${CLIENTE_PUB.nome} ha 3 fusti da 20 L da restituire.` },
      { ruolo: 'user', contenuto: 'Quanto ha preso il pub la botte quest’anno?' }
    ],
    emit: (e) => eventi.push(e)
  })
  controllaNienteDatiClienti(usciti)
  const risultatoStrumento = usciti[1]
  assert.match(
    risultatoStrumento,
    /120/,
    'lo strumento ha ricevuto il nome vero e ha trovato le vendite'
  )
  assert.ok(risultatoStrumento.includes(codice))
  const chiamata = eventi.find((e) => e.tipo === 'tool_call')
  assert.deepEqual(chiamata && chiamata.tipo === 'tool_call' ? chiamata.argomenti : null, {
    cliente: CLIENTE_PUB.nome
  })
  const risposta = eventi.find((e) => e.tipo === 'risposta')
  assert.equal(
    risposta && risposta.tipo === 'risposta' ? risposta.testo : '',
    `**${CLIENTE_PUB.nome}** ha preso 120 bottiglie e 3 fusti di Bionda.`
  )
})

test('ogni strumento usato nel turno lascia uscire solo dati di lavoro', async () => {
  const { db } = preparato()
  const nomi = [
    'fusti_a_rendere',
    'top_clienti',
    'clienti_inattivi',
    'omaggi',
    'avvisi_attivi',
    'giacenze_materie_prime',
    'dettaglio_cotta',
    'configurazione',
    'agri_operazioni',
    'agri_campi_semine'
  ]
  db.prepare(`UPDATE configurazioni SET valore = '1' WHERE chiave = 'modulo_agricolo_attivo'`).run()
  const { client, usciti } = modelloFinto([
    {
      message: {
        role: 'assistant',
        content: '',
        tool_calls: nomi.map((n, i) => ({
          id: `c${i}`,
          function: {
            name: n,
            arguments: n === 'dettaglio_cotta' ? { numero_lotto: 'L-2026-01' } : { giorni: 365 }
          }
        }))
      }
    },
    { message: { role: 'assistant', content: 'ok' } }
  ])
  await eseguiTurno({
    db,
    gestore: new GestoreModelli(client, { attendi: async () => {} }),
    oggi: '2026-10-22',
    cronologia: [{ ruolo: 'user', contenuto: 'Dimmi tutto' }],
    emit: () => {}
  })
  controllaNienteDatiClienti(usciti)
  assert.match(usciti[1], /OPERATORE-1/)
  assert.match(usciti[1], /FORNITORE-/)
})

test('domanda con un contatto del cliente: non parte nulla e l’utente lo sa', async () => {
  const { db } = preparato()
  const { client, usciti } = modelloFinto([])
  const eventi: EventoAgente[] = []
  await eseguiTurno({
    db,
    gestore: new GestoreModelli(client, { attendi: async () => {} }),
    oggi: '2026-10-22',
    cronologia: [{ ruolo: 'user', contenuto: `Scrivi una mail a ${CLIENTE_PUB.email}` }],
    emit: (e) => eventi.push(e)
  })
  assert.equal(usciti.length, 0)
  const errore = eventi.find((e) => e.tipo === 'errore')
  assert.match(
    errore && errore.tipo === 'errore' ? errore.messaggio : '',
    /proteggere i dati dei tuoi clienti/
  )
  assert.equal(eventi.at(-1)?.tipo, 'fine')
})

test('chiave non valida: messaggio chiaro che porta alle Impostazioni', async () => {
  const { db } = preparato()
  const { ErroreProvider } = await import('../../src/main/ai/groq')
  const client: ChatClient = {
    async chat() {
      throw new ErroreProvider('chiave_non_valida', 'no', null, 401)
    },
    async listaModelli() {
      return []
    }
  }
  const eventi: EventoAgente[] = []
  await eseguiTurno({
    db,
    gestore: new GestoreModelli(client, { attendi: async () => {} }),
    oggi: '2026-10-22',
    cronologia: [{ ruolo: 'user', contenuto: 'ciao' }],
    emit: (e) => eventi.push(e)
  })
  const errore = eventi.find((e) => e.tipo === 'errore')
  assert.match(errore && errore.tipo === 'errore' ? errore.messaggio : '', /Impostazioni → Bira/)
})

test('migrazione: restano solo la chiave (invariata) e l’etichetta nuova; via modello e impostazioni obsolete', () => {
  const db = creaDbTest()
  const ins = db.prepare(
    `INSERT OR REPLACE INTO configurazioni (chiave, valore, tipo, etichetta, categoria) VALUES (?, ?, 'string', ?, 'assistente_ai')`
  )
  for (const [k, v] of [
    ['ai_abilitato', '1'],
    ['ai_provider', 'groq'],
    ['ai_url', 'http://localhost:11434'],
    ['ai_modello', 'qwen2.5:3b'],
    ['ai_groq_modello', 'llama-3.3-70b-versatile'],
    ['ai_groq_url', 'https://api.groq.com/openai/v1'],
    ['ai_temperatura', '0.2'],
    ['ai_max_iterazioni', '8'],
    ['ai_timeout_secondi', '600'],
    ['ai_groq_api_key', CHIAVE_GROQ]
  ])
    ins.run(k, v, k)
  ensureAiConfigRows(db)
  const righe = db
    .prepare(
      `SELECT chiave, valore, etichetta FROM configurazioni WHERE chiave LIKE 'ai\\_%' ESCAPE '\\'`
    )
    .all()
  assert.deepEqual(righe, [
    { chiave: 'ai_groq_api_key', valore: CHIAVE_GROQ, etichetta: 'Chiave di Bira' }
  ])
})

test('migrazione: la chiave incollata per errore nel campo URL viene recuperata', () => {
  const db = creaDbTest()
  db.prepare(
    `INSERT OR REPLACE INTO configurazioni (chiave, valore, tipo, etichetta, categoria) VALUES ('ai_groq_url', ?, 'string', 'x', 'assistente_ai')`
  ).run(CHIAVE_GROQ)
  ensureAiConfigRows(db)
  const v = db
    .prepare(`SELECT valore FROM configurazioni WHERE chiave = 'ai_groq_api_key'`)
    .get() as { valore: string }
  assert.equal(v.valore, CHIAVE_GROQ)
})

test('avvisi intelligenti: materie prime in chiaro, clienti solo come codici', async () => {
  const { db } = preparato()
  const { client, usciti, richieste } = modelloFinto([
    { message: { role: 'assistant', content: '{"raccomandazioni":[]}' } }
  ])
  const r = await generaAvvisiIntelligenti(
    db,
    new GestoreModelli(client, { attendi: async () => {} })
  )
  assert.ok(r.ok, r.ok ? '' : r.errore)
  controllaNienteDatiClienti(usciti)
  assert.match(usciti[0], /Luppolo Cascade/)
  assert.match(usciti[0], /CLIENTE-/)
  assert.equal(richieste[0].json, true)
})

test('nome di strumento sbagliato dal modello (detaglio_cotta): Bira lo corregge e continua', async () => {
  const { db } = preparato()
  const { ErroreProvider } = await import('../../src/main/ai/groq')
  let chiamate = 0
  const client: ChatClient = {
    async chat(body) {
      chiamate++
      if (chiamate === 1) {
        throw Object.assign(
          new ErroreProvider('strumento_sbagliato', 'tool_use_failed', null, 400),
          {
            generazione: '{"name": "detaglio_cotta", "arguments": {"numero_lotto":"L-2026-01"}}'
          }
        )
      }
      return {
        model: body.model,
        message: { role: 'assistant', content: 'Cotta L-2026-01: 50 kg di Pilsner.' }
      }
    },
    async listaModelli() {
      return []
    }
  }
  const eventi: EventoAgente[] = []
  await eseguiTurno({
    db,
    gestore: new GestoreModelli(client, { attendi: async () => {} }),
    oggi: '2026-10-22',
    cronologia: [{ ruolo: 'user', contenuto: 'Dettaglio della cotta L-2026-01' }],
    emit: (e) => eventi.push(e)
  })
  const strumento = eventi.find((e) => e.tipo === 'tool_risultato')
  assert.ok(
    strumento &&
      strumento.tipo === 'tool_risultato' &&
      strumento.nome === 'dettaglio_cotta' &&
      strumento.ok
  )
  assert.ok(eventi.some((e) => e.tipo === 'risposta'))
})

test('chiamata illeggibile: Bira riprova con un altro modello invece di fermarsi', async () => {
  const { db } = preparato()
  const { ErroreProvider } = await import('../../src/main/ai/groq')
  const modelli: string[] = []
  const client: ChatClient = {
    async chat(body) {
      modelli.push(body.model)
      if (modelli.length === 1)
        throw new ErroreProvider('strumento_sbagliato', 'tool_use_failed', null, 400)
      return { model: body.model, message: { role: 'assistant', content: 'ok' } }
    },
    async listaModelli() {
      return []
    }
  }
  const eventi: EventoAgente[] = []
  await eseguiTurno({
    db,
    gestore: new GestoreModelli(client, { attendi: async () => {} }),
    oggi: '2026-10-22',
    cronologia: [{ ruolo: 'user', contenuto: 'ciao' }],
    emit: (e) => eventi.push(e)
  })
  assert.notEqual(modelli[0], modelli[1])
  assert.ok(eventi.some((e) => e.tipo === 'risposta'))
})

test('trattini tipografici nella risposta: codici ripristinati e testo con trattini normali', async () => {
  const { db, ids } = preparato()
  const { client } = modelloFinto([
    { message: { role: 'assistant', content: `CLIENTE‑${ids.pub} ha il lotto WB‑2604` } }
  ])
  const eventi: EventoAgente[] = []
  await eseguiTurno({
    db,
    gestore: new GestoreModelli(client, { attendi: async () => {} }),
    oggi: '2026-10-22',
    cronologia: [{ ruolo: 'user', contenuto: 'chi?' }],
    emit: (e) => eventi.push(e)
  })
  const r = eventi.find((e) => e.tipo === 'risposta')
  assert.equal(r && r.tipo === 'risposta' ? r.testo : '', `${CLIENTE_PUB.nome} ha il lotto WB-2604`)
})

test('testo scritto insieme a una chiamata di strumento non si perde', async () => {
  const { db } = preparato()
  const { client } = modelloFinto([
    {
      message: {
        role: 'assistant',
        content: 'Hai 2 avvisi urgenti: riordina il Cascade.',
        tool_calls: [
          {
            id: 'n1',
            function: { name: 'naviga_a_schermata', arguments: { sezione: 'magazzino-mp' } }
          }
        ]
      }
    },
    { message: { role: 'assistant', content: 'Vuoi che apra il Magazzino materie prime?' } }
  ])
  const eventi: EventoAgente[] = []
  await eseguiTurno({
    db,
    gestore: new GestoreModelli(client, { attendi: async () => {} }),
    oggi: '2026-10-22',
    cronologia: [{ ruolo: 'user', contenuto: 'avvisi?' }],
    emit: (e) => eventi.push(e)
  })
  const r = eventi.find((e) => e.tipo === 'risposta')
  assert.equal(
    r && r.tipo === 'risposta' ? r.testo : '',
    'Hai 2 avvisi urgenti: riordina il Cascade.\n\nVuoi che apra il Magazzino materie prime?'
  )
})

test('date AAAA-MM-GG rimaste nella risposta diventano gg/mm/aaaa (i codici di lotto no)', async () => {
  const { db } = preparato()
  const { client } = modelloFinto([
    {
      message: {
        role: 'assistant',
        content: 'Ultima vendita 2026-06-05, lotto 2026-020, scade il 2027-03-01.'
      }
    }
  ])
  const eventi: EventoAgente[] = []
  await eseguiTurno({
    db,
    gestore: new GestoreModelli(client, { attendi: async () => {} }),
    oggi: '2026-10-22',
    cronologia: [{ ruolo: 'user', contenuto: 'quando?' }],
    emit: (e) => eventi.push(e)
  })
  const r = eventi.find((e) => e.tipo === 'risposta')
  assert.equal(
    r && r.tipo === 'risposta' ? r.testo : '',
    'Ultima vendita 05/06/2026, lotto 2026-020, scade il 01/03/2027.'
  )
})

test('blocchi di codice JSON scritti dal modello non arrivano al birraio', async () => {
  const { db } = preparato()
  const { client } = modelloFinto([
    {
      message: {
        role: 'assistant',
        content:
          'Apri Maltazioni.\n\n```json\n{ "sezione": "agri-maltazioni" }\n```\n\nChiedi pure!'
      }
    }
  ])
  const eventi: EventoAgente[] = []
  await eseguiTurno({
    db,
    gestore: new GestoreModelli(client, { attendi: async () => {} }),
    oggi: '2026-10-22',
    cronologia: [{ ruolo: 'user', contenuto: 'come?' }],
    emit: (e) => eventi.push(e)
  })
  const r = eventi.find((e) => e.tipo === 'risposta')
  assert.equal(r && r.tipo === 'risposta' ? r.testo : '', 'Apri Maltazioni.\n\nChiedi pure!')
})

test('consigli: niente nomi ripetuti tra parentesi né intervalli di codici', async () => {
  const { db, ids } = preparato()
  const { client } = modelloFinto([
    {
      message: {
        role: 'assistant',
        content: JSON.stringify({
          raccomandazioni: [
            {
              priorita: 'alta',
              titolo: `Riordina MP#${ids.cascade} (Luppolo Cascade)`,
              descrizione: `Clienti inattivi: CLIENTE#${ids.pub}-${ids.bacco}.`,
              refs: [`MP#${ids.cascade}`],
              segnali_ids: [],
              azioni: [
                { tipo: 'riordina', testo: `Ordina 5 kg di MP#${ids.cascade} (Luppolo Cascade)` }
              ]
            }
          ]
        })
      }
    }
  ])
  const r = await generaAvvisiIntelligenti(
    db,
    new GestoreModelli(client, { attendi: async () => {} })
  )
  assert.ok(r.ok)
  if (!r.ok) return
  const rac = r.raccomandazioni[0]
  assert.equal(rac.titolo, 'Riordina Luppolo Cascade')
  assert.equal(rac.azioni[0].testo, 'Ordina 5 kg di Luppolo Cascade')
  assert.doesNotMatch(rac.descrizione, new RegExp(`${CLIENTE_PUB.nome}-\\d`))
})

test('consigli: parentesi che ripetono un nome già detto vengono tolte anche se non adiacenti', async () => {
  const { db, ids } = preparato()
  const { client } = modelloFinto([
    {
      message: {
        role: 'assistant',
        content: JSON.stringify({
          raccomandazioni: [
            {
              priorita: 'critica',
              titolo: `Gestire MP#${ids.cascade} scaduto (MP#${ids.cascade})`,
              descrizione: `Riordinare MP#${ids.cascade} (scorta per 2 cotte) e usarlo.`,
              refs: [],
              segnali_ids: [],
              azioni: []
            }
          ]
        })
      }
    }
  ])
  const r = await generaAvvisiIntelligenti(
    db,
    new GestoreModelli(client, { attendi: async () => {} })
  )
  assert.ok(r.ok)
  if (!r.ok) return
  assert.equal(r.raccomandazioni[0].titolo, 'Gestire Luppolo Cascade scaduto')
  assert.equal(
    r.raccomandazioni[0].descrizione,
    'Riordinare Luppolo Cascade (scorta per 2 cotte) e usarlo.'
  )
})
