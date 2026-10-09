import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  aggiungiGiorni,
  aggiungiMesi,
  calcolaFrazioni,
  calcolaRese,
  doseEttaro,
  erroriFrazioni,
  stagioneDaData,
  stagioneValida,
  violazioniCarenza,
  type FrazioneInput
} from '../src/main/agricolo/calcoli'

test('stagioneDaData: da luglio parte la stagione nuova', () => {
  assert.equal(stagioneDaData('2026-10-09'), '2026/2027')
  assert.equal(stagioneDaData('2026-07-01'), '2026/2027')
  assert.equal(stagioneDaData('2026-06-30'), '2025/2026')
  assert.equal(stagioneDaData('2027-01-15'), '2026/2027')
})

test('stagioneValida accetta solo AAAA/AAAA+1', () => {
  assert.equal(stagioneValida('2026/2027'), true)
  assert.equal(stagioneValida('2026/2028'), false)
  assert.equal(stagioneValida('2026-2027'), false)
  assert.equal(stagioneValida(' 2026/2027'), false)
  assert.equal(stagioneValida(''), false)
})

const FRAZIONI_MAURO: FrazioneInput[] = [
  { nome: '<3 mm', percentuale: 19, scarto: true, peso_specifico_gl: null },
  { nome: '3-4 mm', percentuale: 69, scarto: false, peso_specifico_gl: 62 },
  { nome: '4-5 mm', percentuale: 10, scarto: false, peso_specifico_gl: 66 },
  { nome: '>5 mm', percentuale: 1, scarto: false, peso_specifico_gl: null }
]

test('calcolaFrazioni sul lotto 1A/2026 di Mauro (300 q)', () => {
  const r = calcolaFrazioni(300, FRAZIONI_MAURO)
  assert.deepEqual(
    r.righe.map((f) => f.quantita),
    [57, 207, 30, 3]
  )
  assert.equal(r.somma_percentuali, 99)
  assert.equal(r.calo_percentuale, 1)
  assert.equal(r.calo_quantita, 3)
  assert.equal(r.quantita_utile, 240)
  assert.equal(r.quantita_scarto, 57)
})

test('erroriFrazioni: frazioni valide non danno errori', () => {
  assert.deepEqual(erroriFrazioni(FRAZIONI_MAURO), [])
})

test('erroriFrazioni: somma oltre 100% bloccata', () => {
  const f = FRAZIONI_MAURO.map((x) => (x.nome === '<3 mm' ? { ...x, percentuale: 21 } : x))
  assert.ok(erroriFrazioni(f).some((e) => e.includes('100')))
})

test('erroriFrazioni: nomi vuoti o ripetuti, percentuali negative, nessuna frazione utile', () => {
  assert.ok(erroriFrazioni([{ nome: ' ', percentuale: 50, scarto: false, peso_specifico_gl: null }]).length > 0)
  assert.ok(
    erroriFrazioni([
      { nome: '3-4 mm', percentuale: 50, scarto: false, peso_specifico_gl: null },
      { nome: '3-4 mm', percentuale: 40, scarto: false, peso_specifico_gl: null }
    ]).some((e) => e.includes('3-4 mm'))
  )
  assert.ok(erroriFrazioni([{ nome: 'a', percentuale: -1, scarto: false, peso_specifico_gl: null }]).length > 0)
  assert.ok(
    erroriFrazioni([{ nome: '<3 mm', percentuale: 100, scarto: true, peso_specifico_gl: null }]).some((e) =>
      e.toLowerCase().includes('almeno una frazione')
    )
  )
  assert.ok(erroriFrazioni([]).length > 0)
})

test('doseEttaro: quantita divisa per la superficie', () => {
  assert.equal(doseEttaro(15, 10), 1.5)
  assert.equal(doseEttaro(null, 10), null)
  assert.equal(doseEttaro(15, null), null)
  assert.equal(doseEttaro(15, 0), null)
})

test('aggiungiGiorni e aggiungiMesi gestiscono fine mese e anni', () => {
  assert.equal(aggiungiGiorni('2026-05-20', 30), '2026-06-19')
  assert.equal(aggiungiGiorni('2026-12-31', 1), '2027-01-01')
  assert.equal(aggiungiMesi('2026-08-29', 12), '2027-08-29')
  assert.equal(aggiungiMesi('2026-01-31', 1), '2026-02-28')
  assert.equal(aggiungiMesi('2028-01-31', 1), '2028-02-29')
})

test('violazioniCarenza: raccolta dentro il tempo di carenza', () => {
  const v = violazioniCarenza('2026-06-10', [{ data: '2026-05-20', giorni: 30, prodotto: 'Fungicida X' }])
  assert.equal(v.length, 1)
  assert.equal(v[0].fine_carenza, '2026-06-19')
  assert.equal(v[0].prodotto, 'Fungicida X')
})

test('violazioniCarenza: raccolta il giorno di fine carenza o dopo e ok, carenza 0 ignorata', () => {
  assert.deepEqual(violazioniCarenza('2026-06-19', [{ data: '2026-05-20', giorni: 30, prodotto: 'X' }]), [])
  assert.deepEqual(violazioniCarenza('2026-05-20', [{ data: '2026-05-20', giorni: 0, prodotto: 'X' }]), [])
})

test('calcolaRese: maltazione 187/2026PTL di Mauro', () => {
  const r = calcolaRese(1100, 920, [{ kg: 1100, quota_utile: 0.8, quota_scarto: 0.19 }])
  assert.equal(Math.round((r.resa_maltazione ?? 0) * 1000) / 10, 83.6)
  assert.equal(r.kg_grezzo_equivalenti, 1375)
  assert.equal(Math.round((r.resa_complessiva ?? 0) * 1000) / 10, 66.9)
  assert.equal(r.perc_scarto_calibratura, 0.19)
  assert.equal(r.parziale, false)
})

test('calcolaRese: piu lotti con quote diverse sono pesati in proporzione', () => {
  const r = calcolaRese(1000, 800, [
    { kg: 600, quota_utile: 0.8, quota_scarto: 0.2 },
    { kg: 400, quota_utile: 0.5, quota_scarto: 0.5 }
  ])
  // grezzo equivalente: 600/0.8 + 400/0.5 = 750 + 800 = 1550
  assert.equal(r.kg_grezzo_equivalenti, 1550)
  // scarto pesato: (750*0.2 + 800*0.5) / 1550
  assert.equal(r.perc_scarto_calibratura, Math.round(((750 * 0.2 + 800 * 0.5) / 1550) * 1e6) / 1e6)
})

test('calcolaRese: maltazione in corso senza peso finale, lotti senza calibratura = parziale', () => {
  const inCorso = calcolaRese(1100, null, [{ kg: 1100, quota_utile: 0.8, quota_scarto: 0.19 }])
  assert.equal(inCorso.resa_maltazione, null)
  assert.equal(inCorso.resa_complessiva, null)
  const comprato = calcolaRese(1000, 800, [{ kg: 1000, quota_utile: null, quota_scarto: null }])
  assert.equal(comprato.parziale, true)
  assert.equal(comprato.kg_grezzo_equivalenti, 1000)
  assert.equal(comprato.perc_scarto_calibratura, null)
})

test('violazioniCarenza: un trattamento fatto dopo la raccolta non conta', () => {
  assert.deepEqual(violazioniCarenza('2026-06-10', [{ data: '2026-06-15', giorni: 30, prodotto: 'X' }]), [])
})
