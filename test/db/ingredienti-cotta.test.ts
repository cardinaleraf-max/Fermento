import { test } from 'node:test'
import assert from 'node:assert/strict'
import type BetterSqlite3 from 'better-sqlite3'
import { creaDbTest } from './helpers'
import { lotto, materia, residuo } from './fixture'
import {
  avviaCotta,
  ingredientiCotta,
  modificaIngredientiCotta
} from '../../src/main/produzione/ingredientiCotta'

type Db = BetterSqlite3.Database

/** Birrificio minimo: Aurora 250 L con 55 kg di Pilsner e 250 g di Saaz. */
function birrificio(db: Db): {
  birra: number
  ricetta: number
  pilsner: number
  saaz: number
  cascade: number
  concime: number
  pilsA: number
  pilsB: number
  saaz1: number
  cascade1: number
} {
  const birra = Number(
    db.prepare(`INSERT INTO birre (nome, stile) VALUES ('Aurora', 'Blond Ale')`).run()
      .lastInsertRowid
  )
  const ricetta = Number(
    db
      .prepare(
        `INSERT INTO ricette (birra_id, versione, cotta_litri_riferimento, attiva) VALUES (?, 1, 250, 1)`
      )
      .run(birra).lastInsertRowid
  )
  const pilsner = materia(db, 'Malto Pilsner', 'malto', 'kg')
  const saaz = materia(db, 'Luppolo Saaz', 'luppolo', 'g')
  const cascade = materia(db, 'Luppolo Cascade', 'luppolo', 'g')
  const concime = materia(db, 'Nitrato ammonico', 'concime', 'kg')
  const ins = db.prepare(
    `INSERT INTO ricetta_ingredienti (ricetta_id, materia_prima_id, quantita) VALUES (?, ?, ?)`
  )
  ins.run(ricetta, pilsner, 55)
  ins.run(ricetta, saaz, 250)
  return {
    birra,
    ricetta,
    pilsner,
    saaz,
    cascade,
    concime,
    pilsA: lotto(db, pilsner, 'PIL-A', 60, '2027-01-01'),
    pilsB: lotto(db, pilsner, 'PIL-B', 100, '2027-06-01'),
    saaz1: lotto(db, saaz, 'SAAZ-1', 300, '2027-03-01'),
    cascade1: lotto(db, cascade, 'CASC-1', 500, '2027-05-01')
  }
}

function datiCotta(
  b: { birra: number; ricetta: number },
  extra: Partial<Parameters<typeof avviaCotta>[1]> = {}
): Parameters<typeof avviaCotta>[1] {
  return {
    numero_lotto: '2026-001',
    birra_id: b.birra,
    ricetta_id: b.ricetta,
    data_inizio: '2026-10-12',
    litri_teorici: 250,
    ...extra
  }
}

function avvia(db: Db, b: { birra: number; ricetta: number }): number {
  const r = avviaCotta(db, datiCotta(b))
  assert.equal(r.ok, true)
  return (r as { cotta_id: number }).cotta_id
}

/** Righe di scarico della cotta come "codice lotto: quantità", nell'ordine di inserimento. */
function scarichi(db: Db, cottaId: number): string[] {
  return (
    db
      .prepare(
        `SELECT l.lotto_fornitore AS l, cmp.quantita_usata AS q FROM cotta_materie_prime cmp
         JOIN lotti_materie_prime l ON l.id = cmp.lotto_materia_prima_id
         WHERE cmp.cotta_id = ? ORDER BY cmp.id`
      )
      .all(cottaId) as Array<{ l: string; q: number }>
  ).map((r) => `${r.l}: ${r.q}`)
}

function nota(db: Db, cottaId: number): string | null {
  return (db.prepare(`SELECT note FROM cotte WHERE id = ?`).get(cottaId) as { note: string | null })
    .note
}

function ricettaAttuale(db: Db, ricettaId: number): string[] {
  return (
    db
      .prepare(
        `SELECT materia_prima_id AS m, quantita AS q FROM ricetta_ingredienti WHERE ricetta_id = ? ORDER BY id`
      )
      .all(ricettaId) as Array<{ m: number; q: number }>
  ).map((r) => `${r.m}:${r.q}`)
}

test('avvio senza modifiche: scarica la ricetta in FIFO per scadenza, senza note', () => {
  const db = creaDbTest()
  const b = birrificio(db)
  const r = avviaCotta(db, datiCotta(b))
  assert.deepEqual(r, { ok: true, cotta_id: 1, avvisi: [] })
  assert.deepEqual(scarichi(db, 1), ['PIL-A: 55', 'SAAZ-1: 250'])
  assert.equal(residuo(db, b.pilsA), 5)
  assert.equal(residuo(db, b.pilsB), 100)
  assert.equal(residuo(db, b.saaz1), 50)
  assert.equal(nota(db, 1), null)
})

test('avvio senza modifiche con giacenza insufficiente: scarica il possibile e avvisa come prima', () => {
  const db = creaDbTest()
  const b = birrificio(db)
  db.prepare(`UPDATE ricetta_ingredienti SET quantita = 200 WHERE materia_prima_id = ?`).run(
    b.pilsner
  )
  const r = avviaCotta(db, datiCotta(b))
  assert.equal(r.ok, true)
  assert.deepEqual((r as { avvisi: string[] }).avvisi, [
    'Giacenza insufficiente per Malto Pilsner: mancano 40'
  ])
  assert.equal(residuo(db, b.pilsA), 0)
  assert.equal(residuo(db, b.pilsB), 0)
})

test('avvio con numero lotto già usato: errore e nessuno scarico', () => {
  const db = creaDbTest()
  const b = birrificio(db)
  avvia(db, b)
  const r = avviaCotta(db, datiCotta(b))
  assert.deepEqual(r, { ok: false, errore: 'Numero lotto "2026-001" gia esistente' })
  assert.equal(residuo(db, b.pilsA), 5)
})

test('avvio con ingredienti modificati: vale solo per la cotta, la ricetta resta uguale', () => {
  const db = creaDbTest()
  const b = birrificio(db)
  const prima = ricettaAttuale(db, b.ricetta)
  const r = avviaCotta(
    db,
    datiCotta(b, {
      ingredienti: [
        { materia_prima_id: b.pilsner, quantita: 60 },
        { materia_prima_id: b.cascade, quantita: 200 }
      ]
    })
  )
  assert.deepEqual(r, { ok: true, cotta_id: 1, avvisi: [] })
  assert.deepEqual(scarichi(db, 1), ['PIL-A: 60', 'CASC-1: 200'])
  assert.equal(residuo(db, b.saaz1), 300)
  assert.equal(residuo(db, b.cascade1), 300)
  assert.deepEqual(ricettaAttuale(db, b.ricetta), prima)
  assert.equal(
    nota(db, 1),
    'Variazioni rispetto alla ricetta: Malto Pilsner 55 → 60 kg; tolto Luppolo Saaz; aggiunto Luppolo Cascade 200 g'
  )
})

test('avvio con ingredienti uguali alla ricetta (anche in altro ordine): nessuna nota', () => {
  const db = creaDbTest()
  const b = birrificio(db)
  const r = avviaCotta(
    db,
    datiCotta(b, {
      ingredienti: [
        { materia_prima_id: b.saaz, quantita: 250 },
        { materia_prima_id: b.pilsner, quantita: 55 }
      ]
    })
  )
  assert.equal(r.ok, true)
  assert.equal(nota(db, 1), null)
  assert.equal(residuo(db, b.pilsA), 5)
})

test('avvio con ingredienti: duplicati sommati, quantità zero ignorate', () => {
  const db = creaDbTest()
  const b = birrificio(db)
  const r = avviaCotta(
    db,
    datiCotta(b, {
      ingredienti: [
        { materia_prima_id: b.pilsner, quantita: 30 },
        { materia_prima_id: b.pilsner, quantita: 25 },
        { materia_prima_id: b.saaz, quantita: 0 }
      ]
    })
  )
  assert.equal(r.ok, true)
  assert.deepEqual(scarichi(db, 1), ['PIL-A: 55'])
  assert.equal(residuo(db, b.saaz1), 300)
})

test('avvio con ingredienti non validi: errore e niente creato', () => {
  const db = creaDbTest()
  const b = birrificio(db)
  const casi: Array<[number, number, RegExp]> = [
    [b.pilsner, -1, /quantità/i],
    [b.pilsner, Number.NaN, /quantità/i],
    [9999, 10, /non trovata/i],
    [b.concime, 10, /non è un ingrediente/i]
  ]
  for (const [m, q, atteso] of casi) {
    const r = avviaCotta(db, datiCotta(b, { ingredienti: [{ materia_prima_id: m, quantita: q }] }))
    assert.equal(r.ok, false)
    assert.match((r as { errore: string }).errore, atteso)
  }
  assert.equal((db.prepare(`SELECT COUNT(*) AS c FROM cotte`).get() as { c: number }).c, 0)
  assert.equal(residuo(db, b.pilsA), 60)
})

test('modifica: un aumento scarica dai lotti più vicini alla scadenza e somma sulla riga dello stesso lotto', () => {
  const db = creaDbTest()
  const b = birrificio(db)
  const cotta = avvia(db, b)
  const r = modificaIngredientiCotta(
    db,
    cotta,
    [
      { materia_prima_id: b.pilsner, quantita: 70 },
      { materia_prima_id: b.saaz, quantita: 250 }
    ],
    '2026-10-13'
  )
  assert.deepEqual(r, { ok: true })
  assert.deepEqual(scarichi(db, cotta), ['PIL-A: 60', 'SAAZ-1: 250', 'PIL-B: 10'])
  assert.equal(residuo(db, b.pilsA), 0)
  assert.equal(residuo(db, b.pilsB), 90)
  assert.equal(nota(db, cotta), 'Modifica ingredienti del 13/10/2026: Malto Pilsner 55 → 70 kg')
})

test('modifica: una riduzione restituisce prima agli ultimi lotti scaricati, la rimozione restituisce tutto', () => {
  const db = creaDbTest()
  const b = birrificio(db)
  const cotta = avvia(db, b)
  modificaIngredientiCotta(db, cotta, [
    { materia_prima_id: b.pilsner, quantita: 70 },
    { materia_prima_id: b.saaz, quantita: 250 }
  ])
  const r = modificaIngredientiCotta(
    db,
    cotta,
    [{ materia_prima_id: b.pilsner, quantita: 50 }],
    '2026-10-14'
  )
  assert.deepEqual(r, { ok: true })
  assert.deepEqual(scarichi(db, cotta), ['PIL-A: 50'])
  assert.equal(residuo(db, b.pilsA), 10)
  assert.equal(residuo(db, b.pilsB), 100)
  assert.equal(residuo(db, b.saaz1), 300)
  assert.match(
    nota(db, cotta) ?? '',
    /\nModifica ingredienti del 14\/10\/2026: Malto Pilsner 70 → 50 kg; tolto Luppolo Saaz$/
  )
})

test('modifica: sostituire un ingrediente restituisce il vecchio e scarica il nuovo', () => {
  const db = creaDbTest()
  const b = birrificio(db)
  const cotta = avvia(db, b)
  const r = modificaIngredientiCotta(
    db,
    cotta,
    [
      { materia_prima_id: b.pilsner, quantita: 55 },
      { materia_prima_id: b.cascade, quantita: 250 }
    ],
    '2026-10-13'
  )
  assert.deepEqual(r, { ok: true })
  assert.equal(residuo(db, b.saaz1), 300)
  assert.equal(residuo(db, b.cascade1), 250)
  assert.equal(
    nota(db, cotta),
    'Modifica ingredienti del 13/10/2026: tolto Luppolo Saaz; aggiunto Luppolo Cascade 250 g'
  )
})

test('modifica con giacenza insufficiente: errore chiaro e nulla cambia', () => {
  const db = creaDbTest()
  const b = birrificio(db)
  const cotta = avvia(db, b)
  const r = modificaIngredientiCotta(db, cotta, [
    { materia_prima_id: b.pilsner, quantita: 200 },
    { materia_prima_id: b.cascade, quantita: 100 }
  ])
  assert.deepEqual(r, {
    ok: false,
    errore:
      'Giacenza insufficiente per Malto Pilsner: in magazzino ci sono 105 kg, ne servono altri 145 kg.'
  })
  assert.deepEqual(scarichi(db, cotta), ['PIL-A: 55', 'SAAZ-1: 250'])
  assert.equal(residuo(db, b.pilsA), 5)
  assert.equal(residuo(db, b.saaz1), 50)
  assert.equal(residuo(db, b.cascade1), 500)
  assert.equal(nota(db, cotta), null)
})

test('modifica con decimali: nessun residuo spurio nei lotti', () => {
  const db = creaDbTest()
  const b = birrificio(db)
  const lievito = materia(db, 'Lievito US-05', 'lievito', 'kg')
  const l = lotto(db, lievito, 'US05-1', 0.3, '2027-02-01')
  const r = avviaCotta(
    db,
    datiCotta(b, { ingredienti: [{ materia_prima_id: lievito, quantita: 0.1 }] })
  )
  const cotta = (r as { cotta_id: number }).cotta_id
  assert.deepEqual(
    modificaIngredientiCotta(db, cotta, [{ materia_prima_id: lievito, quantita: 0.3 }]),
    { ok: true }
  )
  assert.equal(residuo(db, l), 0)
  assert.deepEqual(scarichi(db, cotta), ['US05-1: 0.3'])
  assert.deepEqual(
    modificaIngredientiCotta(db, cotta, [{ materia_prima_id: lievito, quantita: 0.1 }]),
    { ok: true }
  )
  assert.equal(residuo(db, l), 0.2)
})

test('modifica: dati non validi o cotta inesistente danno errore', () => {
  const db = creaDbTest()
  const b = birrificio(db)
  const cotta = avvia(db, b)
  assert.deepEqual(modificaIngredientiCotta(db, 999, []), {
    ok: false,
    errore: 'Cotta non trovata'
  })
  const casi: Array<[number, number, RegExp]> = [
    [b.pilsner, -5, /quantità/i],
    [b.pilsner, Number.POSITIVE_INFINITY, /quantità/i],
    [9999, 1, /non trovata/i],
    [b.concime, 1, /non è un ingrediente/i]
  ]
  for (const [m, q, atteso] of casi) {
    const r = modificaIngredientiCotta(db, cotta, [{ materia_prima_id: m, quantita: q }])
    assert.equal(r.ok, false)
    assert.match((r as { errore: string }).errore, atteso)
  }
  assert.deepEqual(scarichi(db, cotta), ['PIL-A: 55', 'SAAZ-1: 250'])
})

test('modifica senza variazioni: nessuna scrittura e nessuna nota', () => {
  const db = creaDbTest()
  const b = birrificio(db)
  const cotta = avvia(db, b)
  const r = modificaIngredientiCotta(db, cotta, [
    { materia_prima_id: b.saaz, quantita: 250 },
    { materia_prima_id: b.pilsner, quantita: 55 }
  ])
  assert.deepEqual(r, { ok: true })
  assert.equal(nota(db, cotta), null)
  assert.deepEqual(scarichi(db, cotta), ['PIL-A: 55', 'SAAZ-1: 250'])
})

test('ingredientiCotta: totali per materia prima con la giacenza attuale', () => {
  const db = creaDbTest()
  const b = birrificio(db)
  const cotta = avvia(db, b)
  modificaIngredientiCotta(db, cotta, [
    { materia_prima_id: b.pilsner, quantita: 70 },
    { materia_prima_id: b.saaz, quantita: 250 }
  ])
  const righe = ingredientiCotta(db, cotta)
  assert.deepEqual(
    righe.map((r) => [r.mp_nome, r.quantita, r.giacenza, r.unita_misura, r.categoria]),
    [
      ['Luppolo Saaz', 250, 50, 'g', 'luppolo'],
      ['Malto Pilsner', 70, 90, 'kg', 'malto']
    ]
  )
})

test('avvio con ingredienti modificati e giacenza insufficiente: la nota dice quanto è stato scaricato davvero', () => {
  const db = creaDbTest()
  const b = birrificio(db)
  const r = avviaCotta(
    db,
    datiCotta(b, {
      ingredienti: [
        { materia_prima_id: b.pilsner, quantita: 55 },
        { materia_prima_id: b.cascade, quantita: 900 }
      ]
    })
  )
  assert.deepEqual(r, {
    ok: true,
    cotta_id: 1,
    avvisi: ['Giacenza insufficiente per Luppolo Cascade: mancano 400']
  })
  assert.equal(residuo(db, b.cascade1), 0)
  assert.equal(
    nota(db, 1),
    'Variazioni rispetto alla ricetta: tolto Luppolo Saaz; aggiunto Luppolo Cascade 900 g' +
      ' — giacenza insufficiente, scaricati solo: Luppolo Cascade 500 g su 900 g'
  )
})
