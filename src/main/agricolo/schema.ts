import type BetterSqlite3 from 'better-sqlite3'
import { oggiIso, stagioneDaData } from './calcoli'

/**
 * Migrazione del modulo agricolo (e dei lotti imballi HACCP).
 *
 * Regole: solo operazioni additive e idempotenti. CREATE TABLE/INDEX IF NOT
 * EXISTS, colonne aggiunte solo se assenti, configurazioni con INSERT OR
 * IGNORE. Nessun UPDATE/DELETE su dati esistenti. Le tabelle esistono anche a
 * modulo spento (vuote e mai lette), così attivarlo non richiede migrazioni.
 */

const tabelle = [
  `CREATE TABLE IF NOT EXISTS agri_campi (
    id INTEGER PRIMARY KEY,
    nome TEXT NOT NULL,
    superficie_ha REAL,
    localita TEXT,
    rif_catastale TEXT,
    note TEXT,
    attivo INTEGER NOT NULL DEFAULT 1,
    creato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    aggiornato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );`,
  `CREATE TABLE IF NOT EXISTS agri_semine (
    id INTEGER PRIMARY KEY,
    campo_id INTEGER NOT NULL,
    stagione TEXT NOT NULL,
    coltura TEXT NOT NULL CHECK (coltura IN ('orzo','luppolo')),
    varieta TEXT,
    data DATE NOT NULL,
    superficie_ha REAL,
    semente_testo TEXT,
    note TEXT,
    creato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    aggiornato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (campo_id) REFERENCES agri_campi(id)
  );`,
  `CREATE TABLE IF NOT EXISTS agri_operazioni (
    id INTEGER PRIMARY KEY,
    semina_id INTEGER NOT NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('concimazione','trattamento','lavorazione','irrigazione','altro')),
    data DATE NOT NULL,
    materia_prima_id INTEGER,
    quantita REAL,
    motivo TEXT,
    operatore TEXT,
    note TEXT,
    creato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    aggiornato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (semina_id) REFERENCES agri_semine(id),
    FOREIGN KEY (materia_prima_id) REFERENCES materie_prime(id)
  );`,
  `CREATE TABLE IF NOT EXISTS agri_consumi (
    id INTEGER PRIMARY KEY,
    rif_tipo TEXT NOT NULL CHECK (rif_tipo IN ('semina','operazione')),
    rif_id INTEGER NOT NULL,
    lotto_id INTEGER NOT NULL,
    materia_prima_id INTEGER NOT NULL,
    quantita REAL NOT NULL CHECK (quantita > 0),
    FOREIGN KEY (lotto_id) REFERENCES lotti_materie_prime(id),
    FOREIGN KEY (materia_prima_id) REFERENCES materie_prime(id)
  );`,
  `CREATE TABLE IF NOT EXISTS agri_lavorazioni (
    id INTEGER PRIMARY KEY,
    tipo TEXT NOT NULL CHECK (tipo IN ('raccolta','calibratura','maltazione')),
    stagione TEXT NOT NULL,
    codice TEXT,
    data_inizio DATE NOT NULL,
    data_fine DATE,
    stato TEXT NOT NULL DEFAULT 'chiusa' CHECK (stato IN ('in_corso','chiusa')),
    semina_id INTEGER,
    materia_prima_id INTEGER,
    note TEXT,
    creato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    aggiornato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (semina_id) REFERENCES agri_semine(id),
    FOREIGN KEY (materia_prima_id) REFERENCES materie_prime(id)
  );`,
  `CREATE TABLE IF NOT EXISTS agri_lavorazione_input (
    id INTEGER PRIMARY KEY,
    lavorazione_id INTEGER NOT NULL,
    lotto_id INTEGER NOT NULL,
    quantita REAL NOT NULL CHECK (quantita > 0),
    quantita_kg REAL,
    FOREIGN KEY (lavorazione_id) REFERENCES agri_lavorazioni(id),
    FOREIGN KEY (lotto_id) REFERENCES lotti_materie_prime(id)
  );`,
  `CREATE TABLE IF NOT EXISTS agri_lavorazione_output (
    id INTEGER PRIMARY KEY,
    lavorazione_id INTEGER NOT NULL,
    ordine INTEGER NOT NULL DEFAULT 0,
    nome TEXT,
    percentuale REAL,
    quantita REAL NOT NULL,
    quantita_kg REAL,
    scarto INTEGER NOT NULL DEFAULT 0,
    peso_specifico_gl REAL,
    lotto_id INTEGER,
    FOREIGN KEY (lavorazione_id) REFERENCES agri_lavorazioni(id),
    FOREIGN KEY (lotto_id) REFERENCES lotti_materie_prime(id)
  );`,
  `CREATE TABLE IF NOT EXISTS agri_gruppi_parametri (
    id INTEGER PRIMARY KEY,
    fase TEXT NOT NULL CHECK (fase IN ('raccolta','calibratura','maltazione')),
    nome TEXT NOT NULL,
    ordine INTEGER NOT NULL DEFAULT 0,
    con_data INTEGER NOT NULL DEFAULT 0,
    attivo INTEGER NOT NULL DEFAULT 1
  );`,
  `CREATE TABLE IF NOT EXISTS agri_parametri (
    id INTEGER PRIMARY KEY,
    gruppo_id INTEGER NOT NULL,
    nome TEXT NOT NULL,
    unita TEXT,
    tipo TEXT NOT NULL CHECK (tipo IN ('numero','testo','scala','si_no')),
    ordine INTEGER NOT NULL DEFAULT 0,
    attivo INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (gruppo_id) REFERENCES agri_gruppi_parametri(id)
  );`,
  `CREATE TABLE IF NOT EXISTS agri_valori_parametri (
    lavorazione_id INTEGER NOT NULL,
    parametro_id INTEGER NOT NULL,
    valore TEXT NOT NULL,
    PRIMARY KEY (lavorazione_id, parametro_id),
    FOREIGN KEY (lavorazione_id) REFERENCES agri_lavorazioni(id),
    FOREIGN KEY (parametro_id) REFERENCES agri_parametri(id)
  );`,
  `CREATE TABLE IF NOT EXISTS agri_date_gruppi (
    lavorazione_id INTEGER NOT NULL,
    gruppo_id INTEGER NOT NULL,
    data DATE NOT NULL,
    PRIMARY KEY (lavorazione_id, gruppo_id),
    FOREIGN KEY (lavorazione_id) REFERENCES agri_lavorazioni(id),
    FOREIGN KEY (gruppo_id) REFERENCES agri_gruppi_parametri(id)
  );`,
  `CREATE TABLE IF NOT EXISTS confezionamento_lotti_imballi (
    id INTEGER PRIMARY KEY,
    cotta_id INTEGER NOT NULL,
    materiale_id INTEGER NOT NULL,
    movimento_id INTEGER NOT NULL,
    UNIQUE (cotta_id, movimento_id),
    FOREIGN KEY (cotta_id) REFERENCES cotte(id),
    FOREIGN KEY (materiale_id) REFERENCES materiali_confezionamento(id),
    FOREIGN KEY (movimento_id) REFERENCES movimenti_confezionamento(id)
  );`
]

const colonne: Array<[tabella: string, colonna: string, definizione: string]> = [
  ['lotti_materie_prime', 'origine_tipo', `TEXT NOT NULL DEFAULT 'acquisto'`],
  ['lotti_materie_prime', 'origine_id', 'INTEGER'],
  ['lotti_materie_prime', 'stagione', 'TEXT'],
  ['lotti_materie_prime', 'calibro', 'TEXT'],
  ['materie_prime', 'numero_registrazione', 'TEXT'],
  ['materie_prime', 'principio_attivo', 'TEXT'],
  ['materie_prime', 'tempo_carenza_giorni', 'INTEGER'],
  ['movimenti_confezionamento', 'lotto_fornitore', 'TEXT'],
  ['movimenti_confezionamento', 'fornitore', 'TEXT']
]

const indici = [
  `CREATE INDEX IF NOT EXISTS idx_agri_semine_campo ON agri_semine(campo_id, stagione);`,
  `CREATE INDEX IF NOT EXISTS idx_agri_operazioni_semina ON agri_operazioni(semina_id);`,
  `CREATE INDEX IF NOT EXISTS idx_agri_consumi_rif ON agri_consumi(rif_tipo, rif_id);`,
  `CREATE INDEX IF NOT EXISTS idx_agri_consumi_lotto ON agri_consumi(lotto_id);`,
  `CREATE INDEX IF NOT EXISTS idx_agri_lavorazioni_tipo ON agri_lavorazioni(tipo, stagione);`,
  `CREATE INDEX IF NOT EXISTS idx_agri_input_lav ON agri_lavorazione_input(lavorazione_id);`,
  `CREATE INDEX IF NOT EXISTS idx_agri_input_lotto ON agri_lavorazione_input(lotto_id);`,
  `CREATE INDEX IF NOT EXISTS idx_agri_output_lav ON agri_lavorazione_output(lavorazione_id);`,
  `CREATE INDEX IF NOT EXISTS idx_agri_output_lotto ON agri_lavorazione_output(lotto_id);`,
  `CREATE INDEX IF NOT EXISTS idx_agri_parametri_gruppo ON agri_parametri(gruppo_id);`,
  `CREATE INDEX IF NOT EXISTS idx_lotti_mp_origine ON lotti_materie_prime(origine_tipo, origine_id);`,
  `CREATE INDEX IF NOT EXISTS idx_conf_lotti_imballi_cotta ON confezionamento_lotti_imballi(cotta_id);`,
  `CREATE INDEX IF NOT EXISTS idx_conf_lotti_imballi_mov ON confezionamento_lotti_imballi(movimento_id);`
]

/** Setacci standard di malteria: sotto i 2,2 mm è scarto. Modificabili in Impostazioni. */
export const FRAZIONI_DEFAULT_SEED = [
  { nome: '<2,2 mm', scarto: true },
  { nome: '2,2-2,5 mm', scarto: false },
  { nome: '2,5-2,8 mm', scarto: false },
  { nome: '>2,8 mm', scarto: false }
]

type ParametroSeed = [
  nome: string,
  unita: string | null,
  tipo: 'numero' | 'testo' | 'scala' | 'si_no'
]
type GruppoSeed = {
  fase: 'raccolta' | 'calibratura' | 'maltazione'
  nome: string
  con_data: boolean
  parametri: ParametroSeed[]
}

const FASI_ESSICCAZIONE = [
  'Curva umida',
  'Calo peso',
  'Curva 2',
  'Curva 3',
  'Curva 4',
  'Colpo di fuoco'
]
const MISURE_ESSICCAZIONE: Array<[string, string]> = [
  ['Umidità', '%'],
  ['Temp. entrata', '°C'],
  ['Temp. uscita', '°C'],
  ['Durata', 'ore']
]

/** Replica il foglio di lavoro della malteria Marduk (integrazioni, punto 6). */
const GRUPPI_SEED: GruppoSeed[] = [
  {
    fase: 'calibratura',
    nome: 'Analisi orzo',
    con_data: false,
    parametri: [
      ['Umidità', '%', 'numero'],
      ['Proteine', '%', 'numero']
    ]
  },
  {
    fase: 'maltazione',
    nome: 'Preparazione',
    con_data: false,
    parametri: [
      ['Peso acqua', 'kg', 'numero'],
      ['Lavaggio', 'min', 'numero']
    ]
  },
  {
    fase: 'maltazione',
    nome: 'Macerazione',
    con_data: false,
    parametri: [
      ['Bagnatura 1 – durata', 'ore', 'numero'],
      ['Bagnatura 1 – temperatura', '°C', 'numero'],
      ['Asciugatura 1 – durata', 'ore', 'numero'],
      ['Asciugatura 1 – temperatura', '°C', 'numero'],
      ['Bagnatura 2 – durata', 'ore', 'numero'],
      ['Bagnatura 2 – temperatura', '°C', 'numero'],
      ['Asciugatura 2 – durata', 'ore', 'numero'],
      ['Asciugatura 2 – temperatura', '°C', 'numero'],
      ['Umidità teorica', '%', 'numero'],
      ['Umidità reale', '%', 'numero'],
      ['Punta radichetta', null, 'si_no']
    ]
  },
  {
    fase: 'maltazione',
    nome: 'Germinazione',
    con_data: false,
    parametri: [
      ['Peso umido', 'kg', 'numero'],
      ['Temperatura giorno 1', '°C', 'numero'],
      ['Temperatura giorno 2', '°C', 'numero'],
      ['Temperatura giorno 3', '°C', 'numero'],
      ['Temperatura giorno 4', '°C', 'numero'],
      ['Temperatura giorno 5', '°C', 'numero'],
      ['Temperatura giorno 6', '°C', 'numero'],
      ['Temperatura giorno 7', '°C', 'numero'],
      ['Aspetto visivo', null, 'testo'],
      ['Dolcezza', null, 'scala']
    ]
  },
  {
    // Una riga per fase di curva, una colonna per misura: nomi «Fase – Misura»
    // così la scheda li mostra come tabella (feedback Marduk, 12/10/2026).
    fase: 'maltazione',
    nome: 'Essiccazione',
    con_data: false,
    parametri: FASI_ESSICCAZIONE.flatMap((f) =>
      MISURE_ESSICCAZIONE.map(([m, unita]): ParametroSeed => [`${f} – ${m}`, unita, 'numero'])
    )
  },
  {
    fase: 'maltazione',
    nome: 'Post-essiccazione',
    con_data: true,
    parametri: [
      ['Radichetta rimossa', null, 'si_no'],
      ['Ricalibratura', null, 'si_no'],
      ['Peso dopo la pulizia', 'kg', 'numero'],
      ['Umidità finale', '%', 'numero'],
      ['Friabilità', null, 'scala'],
      ['Aspetto visivo', null, 'testo'],
      ['Aspetto gustativo', null, 'testo'],
      ['Note di degustazione', null, 'testo']
    ]
  },
  {
    fase: 'maltazione',
    nome: 'Test di laboratorio',
    con_data: true,
    parametri: [
      ['Test iodio 30 min a 60 °C', null, 'testo'],
      ['Test iodio +10 min a 70 °C (step 40)', null, 'testo'],
      ['Test iodio +10 min a 70 °C (step 50)', null, 'testo'],
      ['Test iodio +10 min a 70 °C (step 60)', null, 'testo'],
      ['Tempo di conversione', 'min', 'numero'],
      ['Colore mosto', null, 'testo'],
      ['EBC', null, 'numero'],
      ['Grado Plato', '°P', 'numero'],
      ['Efficienza', '%', 'numero'],
      ['Note', null, 'testo']
    ]
  }
]

/** Aggiunge una colonna solo se non c'è già. Ritorna true se l'ha aggiunta. */
export function aggiungiColonnaSeAssente(
  database: BetterSqlite3.Database,
  tabella: string,
  colonna: string,
  definizione: string
): boolean {
  const presenti = database.prepare(`PRAGMA table_info(${tabella})`).all() as Array<{
    name: string
  }>
  if (presenti.length === 0) return false // tabella inesistente: niente da fare
  if (presenti.some((c) => c.name === colonna)) return false
  database.exec(`ALTER TABLE ${tabella} ADD COLUMN ${colonna} ${definizione}`)
  return true
}

function seedConfigurazioni(database: BetterSqlite3.Database): void {
  const ins = database.prepare(
    `INSERT OR IGNORE INTO configurazioni (chiave, valore, tipo, etichetta, categoria) VALUES (?, ?, ?, ?, ?)`
  )
  ins.run('modulo_agricolo_attivo', '0', 'bool', 'Filiera agricola (campo → malto)', 'moduli')
  ins.run(
    'agri_stagione_corrente',
    stagioneDaData(oggiIso()),
    'string',
    'Stagione corrente',
    'agricolo'
  )
  ins.run(
    'agri_frazioni_default',
    JSON.stringify(FRAZIONI_DEFAULT_SEED),
    'json',
    'Frazioni di calibratura predefinite',
    'agricolo'
  )
  ins.run(
    'agri_shelf_life_malto_mesi',
    '12',
    'int',
    'Scadenza proposta per il malto (mesi)',
    'agricolo'
  )
  ins.run(
    'agri_parametri_inizializzati',
    '0',
    'bool',
    'Parametri di fase predefiniti creati',
    'agricolo'
  )
}

/** Crea i parametri predefiniti una sola volta (se l'utente poi li cancella, non tornano). */
function seedParametri(database: BetterSqlite3.Database): void {
  const flag = database
    .prepare(`SELECT valore FROM configurazioni WHERE chiave = 'agri_parametri_inizializzati'`)
    .get() as { valore: string } | undefined
  if (flag?.valore === '1') return

  const insGruppo = database.prepare(
    `INSERT INTO agri_gruppi_parametri (fase, nome, ordine, con_data, attivo) VALUES (?, ?, ?, ?, 1)`
  )
  const insParam = database.prepare(
    `INSERT INTO agri_parametri (gruppo_id, nome, unita, tipo, ordine, attivo) VALUES (?, ?, ?, ?, ?, 1)`
  )
  const ordinePerFase = new Map<string, number>()
  for (const g of GRUPPI_SEED) {
    const ordine = (ordinePerFase.get(g.fase) ?? 0) + 1
    ordinePerFase.set(g.fase, ordine)
    const gruppoId = Number(
      insGruppo.run(g.fase, g.nome, ordine, g.con_data ? 1 : 0).lastInsertRowid
    )
    g.parametri.forEach(([nome, unita, tipo], i) => {
      insParam.run(gruppoId, nome, unita, tipo, i + 1)
    })
  }
  database
    .prepare(
      `UPDATE configurazioni SET valore = '1', aggiornato_il = CURRENT_TIMESTAMP WHERE chiave = 'agri_parametri_inizializzati'`
    )
    .run()
}

export function migraModuloAgricolo(database: BetterSqlite3.Database): void {
  const tx = database.transaction(() => {
    for (const sql of tabelle) database.prepare(sql).run()
    for (const [tabella, colonna, definizione] of colonne) {
      aggiungiColonnaSeAssente(database, tabella, colonna, definizione)
    }
    for (const sql of indici) database.prepare(sql).run()
    seedConfigurazioni(database)
    seedParametri(database)
  })
  tx()
}
