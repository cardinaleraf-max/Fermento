import { app } from 'electron'
import path from 'path'
import type BetterSqlite3 from 'better-sqlite3'

const Database = require('better-sqlite3') as typeof import('better-sqlite3')

export let db: BetterSqlite3.Database

const createTableStatements = [
  `CREATE TABLE IF NOT EXISTS configurazioni (id INTEGER PRIMARY KEY, chiave TEXT UNIQUE, valore TEXT, tipo TEXT, etichetta TEXT, categoria TEXT, creato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP, aggiornato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`,
  `CREATE TABLE IF NOT EXISTS utente (id INTEGER PRIMARY KEY, nome TEXT, password_hash TEXT, password_modificata_il TIMESTAMP, ultimo_accesso TIMESTAMP);`,
  `CREATE TABLE IF NOT EXISTS backup_log (id INTEGER PRIMARY KEY, data TIMESTAMP, percorso_destinazione TEXT, dimensione_bytes INTEGER, tipo TEXT, esito TEXT, messaggio_errore TEXT);`,
  `CREATE TABLE IF NOT EXISTS birre (id INTEGER PRIMARY KEY, nome TEXT, stile TEXT, descrizione TEXT, attiva INTEGER DEFAULT 1, creato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP, aggiornato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`,
  `CREATE TABLE IF NOT EXISTS materie_prime (id INTEGER PRIMARY KEY, nome TEXT, categoria TEXT, unita_misura TEXT, soglia_riordino_fissa REAL, soglia_riordino_dinamica_cotte INTEGER, fornitore_preferito TEXT, note TEXT, creato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP, aggiornato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`,
  `CREATE TABLE IF NOT EXISTS materiali_confezionamento (id INTEGER PRIMARY KEY, nome TEXT, categoria TEXT, birra_id INTEGER, capacita_cl REAL, capacita_litri REAL, soglia_riordino INTEGER, attivo INTEGER DEFAULT 1, creato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP, aggiornato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (birra_id) REFERENCES birre(id));`,
  `CREATE TABLE IF NOT EXISTS clienti (id INTEGER PRIMARY KEY, nome TEXT, partita_iva TEXT, indirizzo TEXT, telefono TEXT, email TEXT, tipo_cliente TEXT, note TEXT, attivo INTEGER DEFAULT 1, creato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP, aggiornato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`,
  `CREATE TABLE IF NOT EXISTS fornitori (id INTEGER PRIMARY KEY, nome TEXT, contatto TEXT, note TEXT, attivo INTEGER DEFAULT 1, creato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP, aggiornato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`,
  `CREATE TABLE IF NOT EXISTS ricette (id INTEGER PRIMARY KEY, birra_id INTEGER, versione INTEGER, cotta_litri_riferimento REAL, note TEXT, attiva INTEGER DEFAULT 1, data_creazione TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (birra_id) REFERENCES birre(id));`,
  `CREATE TABLE IF NOT EXISTS ricetta_ingredienti (id INTEGER PRIMARY KEY, ricetta_id INTEGER, materia_prima_id INTEGER, quantita REAL, note TEXT, FOREIGN KEY (ricetta_id) REFERENCES ricette(id), FOREIGN KEY (materia_prima_id) REFERENCES materie_prime(id));`,
  `CREATE TABLE IF NOT EXISTS lotti_materie_prime (id INTEGER PRIMARY KEY, materia_prima_id INTEGER, fornitore_id INTEGER, lotto_fornitore TEXT, data_carico DATE, data_scadenza DATE, quantita_iniziale REAL, quantita_residua REAL, note TEXT, creato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP, aggiornato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (materia_prima_id) REFERENCES materie_prime(id), FOREIGN KEY (fornitore_id) REFERENCES fornitori(id));`,
  `CREATE TABLE IF NOT EXISTS giacenza_confezionamento (id INTEGER PRIMARY KEY, materiale_id INTEGER UNIQUE, quantita INTEGER, ultimo_aggiornamento TIMESTAMP, FOREIGN KEY (materiale_id) REFERENCES materiali_confezionamento(id));`,
  `CREATE TABLE IF NOT EXISTS movimenti_confezionamento (id INTEGER PRIMARY KEY, materiale_id INTEGER, tipo_movimento TEXT, quantita INTEGER, data TIMESTAMP DEFAULT CURRENT_TIMESTAMP, causale TEXT, riferimento TEXT, note TEXT, FOREIGN KEY (materiale_id) REFERENCES materiali_confezionamento(id));`,
  `CREATE TABLE IF NOT EXISTS cotte (id INTEGER PRIMARY KEY, numero_lotto TEXT, birra_id INTEGER, ricetta_id INTEGER, data_inizio DATE, data_confezionamento DATE, litri_teorici REAL, stato TEXT DEFAULT 'in_corso', note TEXT, creato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP, aggiornato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (birra_id) REFERENCES birre(id), FOREIGN KEY (ricetta_id) REFERENCES ricette(id));`,
  `CREATE TABLE IF NOT EXISTS cotta_materie_prime (id INTEGER PRIMARY KEY, cotta_id INTEGER, lotto_materia_prima_id INTEGER, materia_prima_id INTEGER, quantita_usata REAL, FOREIGN KEY (cotta_id) REFERENCES cotte(id), FOREIGN KEY (lotto_materia_prima_id) REFERENCES lotti_materie_prime(id), FOREIGN KEY (materia_prima_id) REFERENCES materie_prime(id));`,
  `CREATE TABLE IF NOT EXISTS confezionamento (id INTEGER PRIMARY KEY, cotta_id INTEGER UNIQUE, bottiglie_prodotte INTEGER, cartoni_prodotti INTEGER, scarto_litri REAL, data_scadenza DATE, data_inserimento TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (cotta_id) REFERENCES cotte(id));`,
  `CREATE TABLE IF NOT EXISTS confezionamento_fusti (id INTEGER PRIMARY KEY, confezionamento_id INTEGER, materiale_id INTEGER, quantita INTEGER, FOREIGN KEY (confezionamento_id) REFERENCES confezionamento(id), FOREIGN KEY (materiale_id) REFERENCES materiali_confezionamento(id));`,
  `CREATE TABLE IF NOT EXISTS giacenza_prodotto_finito_cartoni (id INTEGER PRIMARY KEY, cotta_id INTEGER UNIQUE, cartoni_disponibili INTEGER, FOREIGN KEY (cotta_id) REFERENCES cotte(id));`,
  `CREATE TABLE IF NOT EXISTS giacenza_prodotto_finito_fusti (id INTEGER PRIMARY KEY, cotta_id INTEGER, materiale_id INTEGER, quantita_disponibile INTEGER, FOREIGN KEY (cotta_id) REFERENCES cotte(id), FOREIGN KEY (materiale_id) REFERENCES materiali_confezionamento(id));`,
  `CREATE TABLE IF NOT EXISTS vendite (id INTEGER PRIMARY KEY, cliente_id INTEGER, data DATE, note TEXT, creato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (cliente_id) REFERENCES clienti(id));`,
  `CREATE TABLE IF NOT EXISTS vendita_dettaglio (id INTEGER PRIMARY KEY, vendita_id INTEGER, cotta_id INTEGER, tipo_prodotto TEXT, materiale_id INTEGER, quantita INTEGER, FOREIGN KEY (vendita_id) REFERENCES vendite(id), FOREIGN KEY (cotta_id) REFERENCES cotte(id));`,
  `CREATE TABLE IF NOT EXISTS avvisi (id INTEGER PRIMARY KEY, tipo TEXT, riferimento_tabella TEXT, riferimento_id INTEGER, messaggio TEXT, data_generazione TIMESTAMP DEFAULT CURRENT_TIMESTAMP, letto INTEGER DEFAULT 0, risolto INTEGER DEFAULT 0, priorita TEXT);`
]

const createIndexStatements = [
  `CREATE INDEX IF NOT EXISTS idx_lotti_mp_scadenza ON lotti_materie_prime(materia_prima_id, data_scadenza);`,
  `CREATE INDEX IF NOT EXISTS idx_vendite_data ON vendite(data);`,
  `CREATE INDEX IF NOT EXISTS idx_avvisi_risolto ON avvisi(risolto, priorita);`
]

function seedInitialData(database: BetterSqlite3.Database): void {
  const insertConfigurazione = database.prepare(
    `INSERT OR IGNORE INTO configurazioni (chiave, valore, tipo, etichetta, categoria) VALUES (?, ?, ?, ?, ?)`
  )
  const configurazioni: [string, string, string, string, string][] = [
    ['nome_birrificio', '', 'string', 'Nome birrificio', 'generale'],
    ['cotta_litri', '250', 'int', 'Dimensione cotta standard (L)', 'produzione'],
    ['bottiglie_per_cartone', '6', 'int', 'Bottiglie per cartone', 'produzione'],
    ['shelf_life_mesi', '13', 'int', 'Shelf life prodotto (mesi)', 'produzione'],
    ['anticipo_avviso_scadenza_giorni', '60', 'int', 'Anticipo avviso scadenze (giorni)', 'avvisi'],
    ['cliente_inattivo_giorni', '20', 'int', 'Soglia cliente inattivo (giorni)', 'avvisi'],
    ['finestra_analisi_vendite_giorni', '90', 'int', 'Finestra analisi vendite (giorni)', 'vendite'],
    ['soglia_bottiglie', '500', 'int', 'Soglia riordino bottiglie', 'magazzino'],
    ['soglia_etichette', '500', 'int', 'Soglia riordino etichette', 'magazzino'],
    ['soglia_fusti', '5', 'int', 'Soglia riordino fusti', 'magazzino'],
    ['backup_percorso', '', 'string', 'Cartella di destinazione backup', 'backup'],
    ['backup_numero_da_mantenere', '30', 'int', 'Numero backup da mantenere', 'backup']
  ]
  for (const configurazione of configurazioni) {
    insertConfigurazione.run(...configurazione)
  }
}

function ensureBackupConfigRow(database: BetterSqlite3.Database): void {
  const ins = database.prepare(
    `INSERT OR IGNORE INTO configurazioni (chiave, valore, tipo, etichetta, categoria) VALUES (?, ?, ?, ?, ?)`
  )
  ins.run('backup_percorso', '', 'string', 'Cartella di destinazione backup', 'backup')
  ins.run('backup_numero_da_mantenere', '30', 'int', 'Numero backup da mantenere', 'backup')
}

export function getDatabaseFilePath(): string {
  return path.join(app.getPath('userData'), 'fermento.db')
}

/** Chiude la connessione; usata prima del ripristino (sovrascrittura del file db). */
export function closeDatabaseConnection(): void {
  try {
    db?.close()
  } catch (e) {
    console.error('[db] chiusura connessione fallita', e)
  }
}

export function reopenDatabaseConnection(): void {
  const dbPath = getDatabaseFilePath()
  db = new Database(dbPath)
  db.pragma('foreign_keys = ON')
}

export function initDatabase(): BetterSqlite3.Database {
  const dbPath = getDatabaseFilePath()
  db = new Database(dbPath)
  db.pragma('foreign_keys = ON')

  const bootstrap = db.transaction(() => {
    for (const statement of createTableStatements) {
      db.prepare(statement).run()
    }

    for (const statement of createIndexStatements) {
      db.prepare(statement).run()
    }

    seedInitialData(db)
  })

  bootstrap()
  ensureBackupConfigRow(db)
  return db
}
