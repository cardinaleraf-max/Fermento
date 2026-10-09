import { test } from 'node:test'
import assert from 'node:assert/strict'
import { creaDbTest } from './helpers'
import {
  archiviaCampo,
  eliminaCampo,
  eliminaSemina,
  listaCampi,
  listaSemine,
  salvaCampo,
  salvaSemina
} from '../../src/main/agricolo/servizi/campi'
import { elencoStagioni, moduloAttivo, stagioneCorrente, statoModulo } from '../../src/main/agricolo/servizi/config'
import { ErroreUtente } from '../../src/main/agricolo/errori'
import type { SeminaPayload } from '../../src/shared/agricolo'

const campoBase = { nome: 'Campo 1A', superficie_ha: 10, localita: 'Irgoli', rif_catastale: 'Fg 12 part 34', note: null }

function seminaBase(campo_id: number, extra: Partial<SeminaPayload> = {}): SeminaPayload {
  return {
    campo_id,
    stagione: '2025/2026',
    coltura: 'orzo',
    varieta: 'Concerto',
    data: '2025-11-15',
    superficie_ha: 10,
    semente_testo: 'Lotto SEM-77 · Consorzio Agrario',
    semente: null,
    note: null,
    ...extra
  }
}

test('config: modulo spento di default e stagione corrente letta dalle impostazioni', () => {
  const db = creaDbTest()
  assert.equal(moduloAttivo(db), false)
  db.prepare(`UPDATE configurazioni SET valore = '1' WHERE chiave = 'modulo_agricolo_attivo'`).run()
  db.prepare(`UPDATE configurazioni SET valore = '2026/2027' WHERE chiave = 'agri_stagione_corrente'`).run()
  assert.equal(moduloAttivo(db), true)
  assert.equal(stagioneCorrente(db), '2026/2027')
  assert.equal(statoModulo(db).attivo, true)
})

test('campi: crea, modifica, elenco con conteggio semine della stagione', () => {
  const db = creaDbTest()
  const id = salvaCampo(db, null, campoBase)
  salvaCampo(db, null, { ...campoBase, nome: 'Campo 2B', superficie_ha: 4.5 })
  salvaSemina(db, null, seminaBase(id))
  salvaSemina(db, null, seminaBase(id, { stagione: '2026/2027', data: '2026-11-10' }))
  salvaCampo(db, id, { ...campoBase, localita: 'Orosei' })
  const lista = listaCampi(db, '2025/2026')
  assert.equal(lista.length, 2)
  const c1 = lista.find((c) => c.id === id)
  assert.ok(c1)
  assert.equal(c1.localita, 'Orosei')
  assert.equal(c1.semine_stagione, 1)
  assert.equal(c1.semine_totali, 2)
})

test('campi: nome obbligatorio e non ripetuto, superficie non negativa', () => {
  const db = creaDbTest()
  salvaCampo(db, null, campoBase)
  assert.throws(() => salvaCampo(db, null, { ...campoBase, nome: '  ' }), ErroreUtente)
  assert.throws(() => salvaCampo(db, null, { ...campoBase, nome: 'campo 1a' }), ErroreUtente)
  assert.throws(() => salvaCampo(db, null, { ...campoBase, nome: 'X', superficie_ha: -1 }), ErroreUtente)
})

test('campi: con semine si archivia ma non si elimina; senza semine si elimina', () => {
  const db = creaDbTest()
  const id = salvaCampo(db, null, campoBase)
  const vuoto = salvaCampo(db, null, { ...campoBase, nome: 'Vuoto' })
  salvaSemina(db, null, seminaBase(id))
  assert.throws(() => eliminaCampo(db, id), ErroreUtente)
  archiviaCampo(db, id, false)
  assert.equal(listaCampi(db, null).find((c) => c.id === id)?.attivo, 0)
  eliminaCampo(db, vuoto)
  assert.equal(listaCampi(db, null).some((c) => c.id === vuoto), false)
})

test('semine: validazioni su stagione, data, coltura e campo', () => {
  const db = creaDbTest()
  const id = salvaCampo(db, null, campoBase)
  assert.throws(() => salvaSemina(db, null, seminaBase(id, { stagione: '2025-2026' })), ErroreUtente)
  assert.throws(() => salvaSemina(db, null, seminaBase(id, { data: '2025-13-40' })), ErroreUtente)
  assert.throws(
    () => salvaSemina(db, null, { ...seminaBase(id), coltura: 'mais' as unknown as 'orzo' }),
    ErroreUtente
  )
  assert.throws(() => salvaSemina(db, null, seminaBase(9999)), ErroreUtente)
})

test('semine: elenco filtrato per campo e stagione con dati del campo', () => {
  const db = creaDbTest()
  const id = salvaCampo(db, null, campoBase)
  const id2 = salvaCampo(db, null, { ...campoBase, nome: 'Luppoleto' })
  salvaSemina(db, null, seminaBase(id))
  salvaSemina(db, null, seminaBase(id2, { coltura: 'luppolo', varieta: 'Cascade' }))
  salvaSemina(db, null, seminaBase(id, { stagione: '2026/2027', data: '2026-11-10' }))
  assert.equal(listaSemine(db, { stagione: '2025/2026' }).length, 2)
  const s = listaSemine(db, { campo_id: id2, stagione: null })
  assert.equal(s.length, 1)
  assert.equal(s[0].campo_nome, 'Luppoleto')
  assert.equal(s[0].coltura, 'luppolo')
  assert.equal(s[0].operazioni, 0)
  assert.equal(s[0].raccolte, 0)
})

test('semine: eliminazione', () => {
  const db = creaDbTest()
  const id = salvaCampo(db, null, campoBase)
  const s = salvaSemina(db, null, seminaBase(id))
  eliminaSemina(db, s)
  assert.equal(listaSemine(db, { stagione: null }).length, 0)
})

test('stagioni: elenco con quelle presenti nei dati e la corrente, dalla piu recente', () => {
  const db = creaDbTest()
  db.prepare(`UPDATE configurazioni SET valore = '2026/2027' WHERE chiave = 'agri_stagione_corrente'`).run()
  const id = salvaCampo(db, null, campoBase)
  salvaSemina(db, null, seminaBase(id, { stagione: '2024/2025', data: '2024-11-10' }))
  salvaSemina(db, null, seminaBase(id))
  assert.deepEqual(elencoStagioni(db), ['2026/2027', '2025/2026', '2024/2025'])
})

test('impostazioni del modulo: salva stagione, frazioni e mesi con controlli', async () => {
  const { salvaImpostazioniAgricole, frazioniDefault, shelfLifeMaltoMesi } = await import(
    '../../src/main/agricolo/servizi/config'
  )
  const db = creaDbTest()
  salvaImpostazioniAgricole(db, {
    stagione_corrente: '2027/2028',
    frazioni_default: [
      { nome: ' <2,5 mm ', scarto: true },
      { nome: '2,5-4 mm', scarto: false }
    ],
    shelf_life_malto_mesi: 18
  })
  assert.equal(stagioneCorrente(db), '2027/2028')
  assert.deepEqual(frazioniDefault(db), [
    { nome: '<2,5 mm', scarto: true },
    { nome: '2,5-4 mm', scarto: false }
  ])
  assert.equal(shelfLifeMaltoMesi(db), 18)
  assert.throws(() => salvaImpostazioniAgricole(db, { stagione_corrente: '2027' }), ErroreUtente)
  assert.throws(() => salvaImpostazioniAgricole(db, { frazioni_default: [] }), ErroreUtente)
  assert.throws(
    () => salvaImpostazioniAgricole(db, { frazioni_default: [{ nome: 'a', scarto: false }, { nome: 'A', scarto: true }] }),
    ErroreUtente
  )
  assert.throws(() => salvaImpostazioniAgricole(db, { shelf_life_malto_mesi: 0 }), ErroreUtente)
  // un errore non deve salvare nulla a meta
  assert.throws(() => salvaImpostazioniAgricole(db, { stagione_corrente: '2030/2031', shelf_life_malto_mesi: -2 }), ErroreUtente)
  assert.equal(stagioneCorrente(db), '2027/2028')
})
