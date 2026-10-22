import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chatGroq, classificaErrore, ErroreProvider } from '../src/main/ai/groq'

test('classificaErrore: chiave non valida (401/403)', () => {
  assert.equal(classificaErrore(401, '', null).tipo, 'chiave_non_valida')
  assert.equal(classificaErrore(403, '', null).tipo, 'chiave_non_valida')
})

test('classificaErrore: modello sparito (404, model_not_found, model_decommissioned)', () => {
  const corpo404 =
    '{"error":{"message":"The model `llama-3.3-70b-versatile` does not exist or you do not have access to it.","code":"model_not_found"}}'
  assert.equal(classificaErrore(404, corpo404, null).tipo, 'modello_non_disponibile')
  assert.equal(
    classificaErrore(400, '{"error":{"code":"model_decommissioned","message":"x"}}', null).tipo,
    'modello_non_disponibile'
  )
  assert.equal(
    classificaErrore(400, '{"error":{"message":"The model `x` does not exist"}}', null).tipo,
    'modello_non_disponibile'
  )
})

test('classificaErrore: limite (429) con attesa da header o dal testo', () => {
  const a = classificaErrore(429, '', '7')
  assert.equal(a.tipo, 'limite')
  assert.equal(a.attesaMs, 7000)
  const b = classificaErrore(429, 'Rate limit reached. Please try again in 2.5s.', null)
  assert.equal(b.attesaMs, 2500)
  assert.equal(classificaErrore(429, '', null).attesaMs, null)
})

test('classificaErrore: richiesta più grande del limite al minuto (413)', () => {
  const e = classificaErrore(413, 'Request too large for model on tokens per minute (TPM)', null)
  assert.equal(e.tipo, 'troppo_grande')
})

test('classificaErrore: altri errori del server', () => {
  const e = classificaErrore(500, 'boom', null)
  assert.equal(e.tipo, 'altro')
  assert.equal(e.status, 500)
})

function conFetchFinto(
  risposta: (url: string, init: RequestInit) => Response | Promise<Response>
): { chiamate: Array<{ url: string; corpo: Record<string, unknown> }>; ripristina: () => void } {
  const originale = globalThis.fetch
  const chiamate: Array<{ url: string; corpo: Record<string, unknown> }> = []
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    chiamate.push({ url, corpo: JSON.parse(String(init.body ?? '{}')) })
    return risposta(url, init)
  }) as typeof fetch
  return { chiamate, ripristina: () => (globalThis.fetch = originale) }
}

test('chatGroq: traduce richiesta e risposta (json, max_tokens, reasoning, strumenti, uso token)', async () => {
  const f = conFetchFinto(
    () =>
      new Response(
        JSON.stringify({
          model: 'openai/gpt-oss-120b',
          choices: [
            {
              message: {
                role: 'assistant',
                content: '',
                tool_calls: [
                  {
                    id: 'c1',
                    type: 'function',
                    function: { name: 'cotte_attive', arguments: '{"limite":3}' }
                  }
                ]
              },
              finish_reason: 'tool_calls'
            }
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        }),
        { status: 200 }
      )
  )
  try {
    const r = await chatGroq('https://api.groq.com/openai/v1', 'gsk_x', {
      model: 'openai/gpt-oss-120b',
      messages: [{ role: 'user', content: 'ciao' }],
      json: true,
      max_tokens: 50,
      reasoning_effort: 'low',
      temperature: 0.2
    })
    const corpo = f.chiamate[0].corpo
    assert.deepEqual(corpo.response_format, { type: 'json_object' })
    assert.equal(corpo.max_tokens, 50)
    assert.equal(corpo.reasoning_effort, 'low')
    assert.equal(corpo.temperature, 0.2)
    assert.equal(r.message.tool_calls?.[0].function.name, 'cotte_attive')
    assert.deepEqual(r.message.tool_calls?.[0].function.arguments, { limite: 3 })
    assert.equal(r.usage?.total_tokens, 15)
  } finally {
    f.ripristina()
  }
})

test('chatGroq: un errore HTTP diventa ErroreProvider classificato, senza nuovi tentativi', async () => {
  const f = conFetchFinto(
    () => new Response('{"error":{"code":"model_not_found"}}', { status: 404 })
  )
  try {
    await assert.rejects(
      chatGroq('https://api.groq.com/openai/v1', 'gsk_x', { model: 'm', messages: [] }),
      (e: unknown) => e instanceof ErroreProvider && e.tipo === 'modello_non_disponibile'
    )
    assert.equal(f.chiamate.length, 1)
  } finally {
    f.ripristina()
  }
})

test('chatGroq: rete assente diventa ErroreProvider di tipo rete', async () => {
  const f = conFetchFinto(() => {
    throw new TypeError('fetch failed')
  })
  try {
    await assert.rejects(
      chatGroq('https://api.groq.com/openai/v1', 'gsk_x', { model: 'm', messages: [] }),
      (e: unknown) => e instanceof ErroreProvider && e.tipo === 'rete'
    )
  } finally {
    f.ripristina()
  }
})
