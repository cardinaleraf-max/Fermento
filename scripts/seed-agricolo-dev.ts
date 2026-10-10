/**
 * SOLO SVILUPPO — dati di esempio del modulo agricolo con il caso reale di
 * Marduk Brewery (lotto orzo 1A/2026, maltazione Pilsner 187/2026PTL).
 *
 * Non viene mai eseguito dall'app. Uso:
 *   npm run seed:agricolo-dev -- "/percorso/del/fermento.db"
 *
 * Sicurezze: il percorso del DB è obbligatorio (nessun default), prima di
 * scrivere viene fatta una copia di sicurezza accanto al file, tutto avviene
 * in una sola transazione (o tutto o niente) e se i dati esistono già non fa
 * nulla. Usa gli stessi servizi dell'app, quindi gli stessi controlli.
 */
import fs from 'node:fs'
import { applicaSchema } from '../src/main/database'
import { salvaCampo, salvaSemina } from '../src/main/agricolo/servizi/campi'
import { salvaImpostazioniAgricole } from '../src/main/agricolo/servizi/config'
import { creaLotto, salvaDatiFitofarmaco } from '../src/main/agricolo/servizi/magazzino'
import { salvaOperazione } from '../src/main/agricolo/servizi/operazioni'
import { configParametri, salvaValori } from '../src/main/agricolo/servizi/parametri'
import {
  avviaMaltazione,
  chiudiMaltazione,
  salvaCalibratura,
  salvaRaccolta
} from '../src/main/agricolo/servizi/lavorazioni'
import type { FaseLavorazione } from '../src/shared/agricolo'
import type BetterSqlite3 from 'better-sqlite3'

const Database = require('better-sqlite3') as typeof import('better-sqlite3')

type Db = BetterSqlite3.Database

function esci(messaggio: string, codice = 1): never {
  console.log(messaggio)
  process.exit(codice)
}

const percorso = process.argv[2]
if (!percorso) esci('Indica il percorso del database: npm run seed:agricolo-dev -- "/percorso/fermento.db"')
if (!fs.existsSync(percorso)) esci(`File non trovato: ${percorso}`)

// Controllo in sola lettura prima di toccare qualunque cosa
const lettura: Db = new Database(percorso, { readonly: true, fileMustExist: true })
const giaPresente = !!lettura.prepare(`SELECT 1 FROM lotti_materie_prime WHERE lotto_fornitore = '1A/2026'`).get()
lettura.close()
if (giaPresente) esci('I dati di esempio sono già presenti (lotto 1A/2026): nessuna modifica.', 0)

const copia = `${percorso}.bak-seed-agricolo-${new Date().toISOString().replace(/[:.]/g, '-')}`
fs.copyFileSync(percorso, copia)
console.log(`Copia di sicurezza: ${copia}`)

const db: Db = new Database(percorso)
db.pragma('foreign_keys = ON')
applicaSchema(db)

/** Materia prima per nome e categoria: la riusa se esiste già. */
function materia(nome: string, categoria: string, unita: string): number {
  const esistente = db
    .prepare(`SELECT id FROM materie_prime WHERE nome = ? AND categoria = ?`)
    .get(nome, categoria) as { id: number } | undefined
  if (esistente) return esistente.id
  return Number(
    db.prepare(`INSERT INTO materie_prime (nome, categoria, unita_misura) VALUES (?, ?, ?)`).run(nome, categoria, unita)
      .lastInsertRowid
  )
}

function acquisto(materiaPrimaId: number, codice: string, quantita: number, dataCarico: string, scadenza: string | null): void {
  creaLotto(db, {
    materia_prima_id: materiaPrimaId,
    codice,
    data_carico: dataCarico,
    data_scadenza: scadenza,
    quantita,
    origine_tipo: 'acquisto',
    origine_id: null,
    stagione: null,
    calibro: null,
    note: 'Dato di esempio (seed sviluppo)'
  })
}

function lottoDi(origine: string, origineId: number, calibro: string | null = null): number {
  const r = db
    .prepare(
      `SELECT id FROM lotti_materie_prime WHERE origine_tipo = ? AND origine_id = ? AND (? IS NULL OR calibro = ?) ORDER BY id LIMIT 1`
    )
    .get(origine, origineId, calibro, calibro) as { id: number } | undefined
  if (!r) throw new Error(`Lotto ${origine} ${origineId} ${calibro ?? ''} non trovato`)
  return r.id
}

/** Valori dei parametri per nome ("Gruppo · Parametro" → valore). */
function parametri(fase: FaseLavorazione, lavorazioneId: number, valori: Record<string, string>, dateGruppi: Record<string, string> = {}): void {
  const gruppi = configParametri(db, fase)
  const v: Record<number, string> = {}
  const d: Record<number, string> = {}
  for (const g of gruppi) {
    for (const p of g.parametri) {
      const chiave = `${g.nome} · ${p.nome}`
      if (valori[chiave] !== undefined) v[p.id] = valori[chiave]
    }
    if (dateGruppi[g.nome]) d[g.id] = dateGruppi[g.nome]
  }
  salvaValori(db, lavorazioneId, v, d)
}

const esegui = db.transaction(() => {
  db.prepare(`UPDATE configurazioni SET valore = '1' WHERE chiave = 'modulo_agricolo_attivo'`).run()
  salvaImpostazioniAgricole(db, { stagione_corrente: '2026/2027' })

  // Magazzino input agricoli
  const seme = materia('Orzo da seme Concerto', 'semente', 'kg')
  const concime = materia('Concime NPK 20-10-10', 'concime', 'q')
  const fungicida = materia('Fungicida (esempio)', 'fitofarmaco', 'L')
  salvaDatiFitofarmaco(db, fungicida, {
    numero_registrazione: 'ESEMPIO-0000',
    principio_attivo: 'Tebuconazolo',
    tempo_carenza_giorni: 30
  })
  acquisto(seme, 'SEM-2025-77', 2000, '2025-10-20', '2026-06-30')
  acquisto(concime, 'NPK-25-03', 20, '2025-10-20', null)
  acquisto(fungicida, 'FG-2026-01', 10, '2026-03-01', '2028-01-31')

  // Materie prime della filiera
  const orzoGrezzo = materia('Orzo grezzo', 'orzo_grezzo', 'q')
  const orzoCalibrato = materia('Orzo calibrato', 'orzo_calibrato', 'q')
  const pilsner = materia('Malto Pilsner aziendale', 'malto', 'kg')

  // Campo e semina
  const campo = salvaCampo(db, null, {
    nome: 'Campo 1A',
    superficie_ha: 10.5,
    localita: 'Irgoli',
    rif_catastale: 'Foglio 12, particella 34',
    note: 'Dato di esempio'
  })
  const semina = salvaSemina(db, null, {
    campo_id: campo,
    stagione: '2025/2026',
    coltura: 'orzo',
    varieta: 'Concerto',
    data: '2025-11-15',
    superficie_ha: 10.5,
    semente_testo: null,
    semente: { materia_prima_id: seme, quantita: 1800, lotto_id: null },
    note: null
  })

  // Operazioni di campo
  salvaOperazione(db, null, {
    semina_id: semina, tipo: 'lavorazione', data: '2025-11-10', prodotto: null,
    motivo: 'Erpicatura e preparazione del letto di semina', operatore: 'Mauro', note: null
  })
  salvaOperazione(db, null, {
    semina_id: semina, tipo: 'concimazione', data: '2026-02-20',
    prodotto: { materia_prima_id: concime, quantita: 15, lotto_id: null },
    motivo: 'Concimazione di copertura', operatore: 'Mauro', note: null
  })
  salvaOperazione(db, null, {
    semina_id: semina, tipo: 'trattamento', data: '2026-04-15',
    prodotto: { materia_prima_id: fungicida, quantita: 2, lotto_id: null },
    motivo: 'Ruggine', operatore: 'Mauro', note: null
  })

  // Raccolta: lotto 1A/2026, 300 q
  const raccolta = salvaRaccolta(db, null, {
    semina_id: semina,
    data: '2026-06-20',
    stagione: '2025/2026',
    materia_prima_id: orzoGrezzo,
    quantita: 300,
    codice: '1A/2026',
    data_scadenza: '2027-06-30',
    note: null
  })

  // Analisi e calibratura (foglio Marduk): umidità 10%, proteine 9%, frazioni 19/69/10/1
  const calibratura = salvaCalibratura(db, null, {
    lotto_id: lottoDi('raccolta', raccolta),
    data: '2026-07-10',
    stagione: '2026/2027',
    quantita: 300,
    materia_prima_id: orzoCalibrato,
    frazioni: [
      { nome: '<3 mm', percentuale: 19, scarto: true, peso_specifico_gl: null },
      { nome: '3-4 mm', percentuale: 69, scarto: false, peso_specifico_gl: 62 },
      { nome: '4-5 mm', percentuale: 10, scarto: false, peso_specifico_gl: 66 },
      { nome: '>5 mm', percentuale: 1, scarto: false, peso_specifico_gl: null }
    ],
    note: null
  })
  parametri('calibratura', calibratura, { 'Analisi orzo · Umidità': '10', 'Analisi orzo · Proteine': '9' })

  // Maltazione Pilsner 187/2026PTL: 1100 kg → 920 kg (foglio Marduk)
  const maltazione = avviaMaltazione(db, null, {
    data_inizio: '2026-07-20',
    stagione: '2026/2027',
    materia_prima_id: pilsner,
    codice: '187/2026PTL',
    input: [{ lotto_id: lottoDi('calibratura', calibratura, '3-4 mm'), kg: 1100 }],
    note: 'Buono, equilibrato, abbondante radichetta – no ricircolo montato'
  })
  parametri(
    'maltazione',
    maltazione,
    {
      'Preparazione · Peso acqua': '776.55',
      'Preparazione · Lavaggio': '8',
      'Macerazione · Bagnatura 1 – durata': '6',
      'Macerazione · Bagnatura 1 – temperatura': '22',
      'Macerazione · Asciugatura 1 – durata': '12',
      'Macerazione · Asciugatura 1 – temperatura': '22',
      'Macerazione · Bagnatura 2 – durata': '6',
      'Macerazione · Bagnatura 2 – temperatura': '22',
      'Macerazione · Asciugatura 2 – durata': '10',
      'Macerazione · Asciugatura 2 – temperatura': '22',
      'Macerazione · Umidità teorica': '44.37',
      'Macerazione · Umidità reale': '44',
      'Macerazione · Punta radichetta': 'si',
      'Germinazione · Peso umido': '1750',
      'Germinazione · Temperatura giorno 1': '23',
      'Germinazione · Temperatura giorno 2': '22',
      'Germinazione · Temperatura giorno 3': '22',
      'Germinazione · Temperatura giorno 4': '22',
      'Germinazione · Temperatura giorno 5': '22',
      'Germinazione · Temperatura giorno 6': '23',
      'Germinazione · Aspetto visivo': 'bene',
      'Germinazione · Dolcezza': '8',
      'Essiccazione · Calo peso – temperatura': '36',
      'Essiccazione · Calo peso – durata': '30',
      'Essiccazione · Colpo di fuoco – temperatura': '70',
      'Essiccazione · Colpo di fuoco – durata': '180',
      'Essiccazione · Friabilità': '8',
      'Test di laboratorio · Test iodio 30 min a 60 °C': 'positivo',
      'Test di laboratorio · Test iodio +10 min a 70 °C (step 40)': 'debolmente positivo',
      'Test di laboratorio · Test iodio +10 min a 70 °C (step 50)': 'negativo',
      'Test di laboratorio · Test iodio +10 min a 70 °C (step 60)': 'negativo',
      'Test di laboratorio · Tempo di conversione': '25',
      'Test di laboratorio · Colore mosto': 'paglierino chiaro',
      'Test di laboratorio · EBC': '3.5',
      'Test di laboratorio · Grado Plato': '12.1',
      'Test di laboratorio · Efficienza': '79',
      'Test di laboratorio · Note': 'Malto ben modificato e friabile'
    },
    { 'Test di laboratorio': '2026-09-02' }
  )
  chiudiMaltazione(db, maltazione, { data_uscita: '2026-08-29', peso_finale_kg: 920, data_scadenza: null })
})

try {
  esegui()
} catch (e) {
  db.close()
  esci(`Errore: nessun dato scritto. ${e instanceof Error ? e.message : String(e)}`)
}

const conteggi = db
  .prepare(
    `SELECT (SELECT COUNT(*) FROM agri_campi) AS campi, (SELECT COUNT(*) FROM agri_semine) AS semine,
            (SELECT COUNT(*) FROM agri_operazioni) AS operazioni, (SELECT COUNT(*) FROM agri_lavorazioni) AS lavorazioni,
            (SELECT COUNT(*) FROM agri_valori_parametri) AS valori`
  )
  .get()
db.close()
console.log('Dati di esempio Marduk creati:', conteggi)
console.log('Modulo agricolo attivato, stagione corrente 2026/2027.')
