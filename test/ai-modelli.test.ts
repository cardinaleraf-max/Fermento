import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ErroreProvider } from '../src/main/ai/groq'
import {
  CATENA_MODELLI,
  GestoreModelli,
  scegliModelloDiRiserva,
  verificaBira
} from '../src/main/ai/modelli'
import type { ChatClient, ChatRequest, ChatResponse } from '../src/main/ai/tipi'

type Comportamento = 'ok' | ErroreProvider

/**
 * Client finto: per ogni modello una coda di comportamenti (l'ultimo si ripete).
 * Registra le richieste ricevute.
 */
function clientFinto(
  piano: Record<string, Comportamento[]>,
  modelli: string[] = []
): ChatClient & { richieste: ChatRequest[] } {
  const richieste: ChatRequest[] = []
  return {
    richieste,
    async chat(body: ChatRequest): Promise<ChatResponse> {
      richieste.push(body)
      const coda = piano[body.model] ?? [new ErroreProvider('modello_non_disponibile', 'sparito')]
      const c = coda.length > 1 ? coda.shift()! : coda[0]
      if (c !== 'ok') throw c
      return {
        model: body.model,
        message: { role: 'assistant', content: `risposta da ${body.model}` }
      }
    },
    async listaModelli(): Promise<string[]> {
      return modelli
    }
  }
}

const [PRIMO, SECONDO, TERZO] = CATENA_MODELLI.map((v) => v.id)
const nessunaAttesa = async (): Promise<void> => {}
const sparito = (): ErroreProvider =>
  new ErroreProvider('modello_non_disponibile', 'sparito', null, 404)
const limite = (ms: number | null = 5000): ErroreProvider =>
  new ErroreProvider('limite', 'limite', ms, 429)

test('la catena parte da gpt-oss-120b', () => {
  assert.equal(PRIMO, 'openai/gpt-oss-120b')
  assert.equal(SECONDO, 'qwen/qwen3.8-27b')
  assert.equal(TERZO, 'openai/gpt-oss-20b')
})

test('modello sparito (404): risponde il successivo e il primo resta escluso', async () => {
  const client = clientFinto({ [PRIMO]: [sparito()], [SECONDO]: ['ok'] })
  const g = new GestoreModelli(client, { attendi: nessunaAttesa })
  const r = await g.chat({ messages: [] })
  assert.equal(r.modello, SECONDO)
  assert.deepEqual(g.esclusi(), [PRIMO])
  await g.chat({ messages: [] })
  assert.equal(
    client.richieste.filter((q) => q.model === PRIMO).length,
    1,
    'non riprova il modello sparito'
  )
})

test('limite (429): passa subito al modello successivo senza aspettare', async () => {
  let attese = 0
  const client = clientFinto({ [PRIMO]: [limite()], [SECONDO]: ['ok'] })
  const g = new GestoreModelli(client, {
    attendi: async () => {
      attese++
    }
  })
  const r = await g.chat({ messages: [] })
  assert.equal(r.modello, SECONDO)
  assert.equal(attese, 0)
})

test('tutti al limite: aspetta (max 30 s a giro), avvisa e poi risponde', async () => {
  const attese: number[] = []
  const avvisi: number[] = []
  let adesso = 1_000_000
  const client = clientFinto({
    [PRIMO]: [limite(8000), 'ok'],
    [SECONDO]: [limite(9000)],
    [TERZO]: [limite(60_000)]
  })
  const g = new GestoreModelli(client, {
    adesso: () => adesso,
    attendi: async (ms) => {
      attese.push(ms)
      adesso += ms
    }
  })
  const r = await g.chat({ messages: [] }, undefined, (s) => avvisi.push(s))
  assert.equal(r.modello, PRIMO)
  assert.equal(attese.length, 1)
  assert.ok(attese[0] <= 30_000 && attese[0] >= 7000, `attesa ${attese[0]}`)
  assert.deepEqual(avvisi, [8])
})

test('tutti al limite troppo a lungo: errore comprensibile', async () => {
  let adesso = 0
  const client = clientFinto({
    [PRIMO]: [limite(40_000)],
    [SECONDO]: [limite(40_000)],
    [TERZO]: [limite(40_000)]
  })
  const g = new GestoreModelli(client, {
    adesso: () => adesso,
    attendi: async (ms) => {
      adesso += ms
    },
    maxAttesaTotaleMs: 60_000
  })
  await assert.rejects(g.chat({ messages: [] }), (e: unknown) => {
    return (
      e instanceof ErroreProvider && e.tipo === 'limite' && /riprova tra un minuto/.test(e.message)
    )
  })
})

test('chiave non valida (401): si ferma subito senza provare altri modelli', async () => {
  const client = clientFinto({
    [PRIMO]: [new ErroreProvider('chiave_non_valida', 'no', null, 401)],
    [SECONDO]: ['ok']
  })
  const g = new GestoreModelli(client, { attendi: nessunaAttesa })
  await assert.rejects(
    g.chat({ messages: [] }),
    (e: unknown) => e instanceof ErroreProvider && e.tipo === 'chiave_non_valida'
  )
  assert.equal(client.richieste.length, 1)
})

test('catena tutta sparita: sceglie un modello di riserva dalla lista di Groq', async () => {
  const client = clientFinto(
    {
      [PRIMO]: [sparito()],
      [SECONDO]: [sparito()],
      [TERZO]: [sparito()],
      'qwen/qwen9-40b': ['ok']
    },
    ['whisper-large-v3', 'meta-llama/llama-prompt-guard-2-86m', 'qwen/qwen9-40b']
  )
  const g = new GestoreModelli(client, { attendi: nessunaAttesa })
  const r = await g.chat({ messages: [] })
  assert.equal(r.modello, 'qwen/qwen9-40b')
})

test('nessun modello di chat disponibile: errore nessun modello', async () => {
  const client = clientFinto(
    { [PRIMO]: [sparito()], [SECONDO]: [sparito()], [TERZO]: [sparito()] },
    ['whisper-large-v3']
  )
  const g = new GestoreModelli(client, { attendi: nessunaAttesa })
  await assert.rejects(
    g.chat({ messages: [] }),
    (e: unknown) => e instanceof ErroreProvider && e.tipo === 'modello_non_disponibile'
  )
})

test('parametro di ragionamento rifiutato (400): riprova lo stesso modello senza', async () => {
  const client = clientFinto({
    [PRIMO]: [
      new ErroreProvider(
        'altro',
        "Groq ha risposto 400: 'reasoning_effort' is not supported",
        null,
        400
      ),
      'ok'
    ]
  })
  const g = new GestoreModelli(client, { attendi: nessunaAttesa })
  const r = await g.chat({ messages: [] })
  assert.equal(r.modello, PRIMO)
  assert.equal(client.richieste[1].reasoning_effort, undefined)
})

test('errore temporaneo del server (5xx): prova il modello successivo', async () => {
  const client = clientFinto({
    [PRIMO]: [new ErroreProvider('altro', 'Groq ha risposto 503', null, 503)],
    [SECONDO]: ['ok']
  })
  const g = new GestoreModelli(client, { attendi: nessunaAttesa })
  assert.equal((await g.chat({ messages: [] })).modello, SECONDO)
})

test('rete assente: un solo nuovo tentativo, poi errore di rete', async () => {
  const client = clientFinto({ [PRIMO]: [new ErroreProvider('rete', 'giù')] })
  const g = new GestoreModelli(client, { attendi: nessunaAttesa })
  await assert.rejects(
    g.chat({ messages: [] }),
    (e: unknown) => e instanceof ErroreProvider && e.tipo === 'rete'
  )
  assert.equal(client.richieste.length, 2)
})

test('scegliModelloDiRiserva: scarta audio/guardie e preferisce i modelli di chat più forti', () => {
  assert.equal(
    scegliModelloDiRiserva([
      'whisper-large-v3',
      'meta-llama/llama-prompt-guard-2-86m',
      'qwen/qwen9-40b'
    ]),
    'qwen/qwen9-40b'
  )
  assert.equal(
    scegliModelloDiRiserva(['llama-9-70b', 'openai/gpt-oss-120b-2027', 'qwen/qwen9']),
    'openai/gpt-oss-120b-2027'
  )
  assert.equal(
    scegliModelloDiRiserva(['canopylabs/orpheus-v1-english', 'openai/gpt-oss-safeguard-20b']),
    null
  )
})

test('verificaBira: pronto col nome del modello', async () => {
  const g = new GestoreModelli(clientFinto({ [PRIMO]: ['ok'] }), { attendi: nessunaAttesa })
  const s = await verificaBira(g)
  assert.equal(s.stato, 'pronto')
  assert.equal(s.modello, PRIMO)
})

test('verificaBira: chiave non valida e rete assente', async () => {
  const g1 = new GestoreModelli(
    clientFinto({ [PRIMO]: [new ErroreProvider('chiave_non_valida', 'no', null, 401)] }),
    { attendi: nessunaAttesa }
  )
  assert.equal((await verificaBira(g1)).stato, 'chiave_non_valida')
  const g2 = new GestoreModelli(clientFinto({ [PRIMO]: [new ErroreProvider('rete', 'giù')] }), {
    attendi: nessunaAttesa
  })
  assert.equal((await verificaBira(g2)).stato, 'non_raggiungibile')
})

test('verificaBira: servizio al limite vuol dire chiave buona, quindi pronto', async () => {
  let adesso = 0
  const client = clientFinto({
    [PRIMO]: [limite(40_000)],
    [SECONDO]: [limite(40_000)],
    [TERZO]: [limite(40_000)]
  })
  const g = new GestoreModelli(client, {
    adesso: () => adesso,
    attendi: async (ms) => {
      adesso += ms
    }
  })
  const s = await verificaBira(g)
  assert.equal(s.stato, 'pronto')
})
