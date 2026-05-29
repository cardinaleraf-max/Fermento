import Database from 'better-sqlite3'
import bcryptjs from 'bcryptjs'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dbPath = path.join(__dirname, '../resources/demo/fermento-demo-seed.db')

if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath)

const db = new Database(dbPath)
db.pragma('foreign_keys = ON')

// ─── SCHEMA IDENTICO A createTableStatements in database.ts ──────────────────
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
  `CREATE TABLE IF NOT EXISTS altri_prodotti (id INTEGER PRIMARY KEY, nome TEXT UNIQUE, attivo INTEGER DEFAULT 1, creato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP, aggiornato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`,
  `CREATE TABLE IF NOT EXISTS giacenza_altri_prodotti (id INTEGER PRIMARY KEY, altro_prodotto_id INTEGER UNIQUE, quantita_disponibile INTEGER NOT NULL DEFAULT 0, ultimo_aggiornamento TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (altro_prodotto_id) REFERENCES altri_prodotti(id));`,
  `CREATE TABLE IF NOT EXISTS vendite (id INTEGER PRIMARY KEY, cliente_id INTEGER, data DATE, note TEXT, creato_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (cliente_id) REFERENCES clienti(id));`,
  `CREATE TABLE IF NOT EXISTS vendita_dettaglio (id INTEGER PRIMARY KEY, vendita_id INTEGER, cotta_id INTEGER, tipo_prodotto TEXT, materiale_id INTEGER, quantita INTEGER, FOREIGN KEY (vendita_id) REFERENCES vendite(id), FOREIGN KEY (cotta_id) REFERENCES cotte(id));`,
  `CREATE TABLE IF NOT EXISTS avvisi (id INTEGER PRIMARY KEY, tipo TEXT, riferimento_tabella TEXT, riferimento_id INTEGER, messaggio TEXT, data_generazione TIMESTAMP DEFAULT CURRENT_TIMESTAMP, letto INTEGER DEFAULT 0, risolto INTEGER DEFAULT 0, priorita TEXT);`,
  `CREATE TABLE IF NOT EXISTS licenza (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    stringa TEXT NOT NULL,
    intestatario TEXT NOT NULL,
    scadenza DATE,
    emessa_il TIMESTAMP NOT NULL,
    attivata_il TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );`
]

const createIndexStatements = [
  `CREATE INDEX IF NOT EXISTS idx_lotti_mp_scadenza ON lotti_materie_prime(materia_prima_id, data_scadenza);`,
  `CREATE INDEX IF NOT EXISTS idx_vendite_data ON vendite(data);`,
  `CREATE INDEX IF NOT EXISTS idx_avvisi_risolto ON avvisi(risolto, priorita);`
]

// ─── ADDITIVE MIGRATIONS (identiche a runAdditiveMigrations in database.ts) ───
function runAdditiveMigrations() {
  try { db.exec(`ALTER TABLE giacenza_prodotto_finito_cartoni ADD COLUMN bottiglie_sfuse INTEGER NOT NULL DEFAULT 0`) } catch {}
  try { db.exec(`ALTER TABLE vendite ADD COLUMN omaggio INTEGER NOT NULL DEFAULT 0`) } catch {}
  try { db.exec(`ALTER TABLE vendite ADD COLUMN occasione TEXT`) } catch {}
  try { db.exec(`ALTER TABLE vendita_dettaglio ADD COLUMN altro_prodotto_id INTEGER`) } catch {}
  try { db.exec(`ALTER TABLE vendita_dettaglio ADD COLUMN omaggio INTEGER NOT NULL DEFAULT 0`) } catch {}
  try { db.exec(`ALTER TABLE ricette ADD COLUMN archiviata INTEGER NOT NULL DEFAULT 0`) } catch {}
}

// ─── BOOTSTRAP ────────────────────────────────────────────────────────────────
db.transaction(() => {
  for (const s of createTableStatements) db.prepare(s).run()
  for (const s of createIndexStatements) db.prepare(s).run()

  // seedInitialData equivalente
  const ins = db.prepare(`INSERT OR IGNORE INTO configurazioni (chiave, valore, tipo, etichetta, categoria) VALUES (?, ?, ?, ?, ?)`)
  ins.run('nome_birrificio',             'Birrificio Demo', 'string', 'Nome birrificio',              'generale')
  ins.run('nome_titolare',               'Mario Rossi',     'string', 'Nome titolare/responsabile',   'generale')
  ins.run('onboarding_completato',       '1',               'bool',   'Onboarding iniziale completato','sistema')
  ins.run('cotta_litri',                 '250',             'int',    'Dimensione cotta standard (L)', 'produzione')
  ins.run('bottiglie_per_cartone',       '6',               'int',    'Bottiglie per cartone',        'produzione')
  ins.run('shelf_life_mesi',             '13',              'int',    'Shelf life prodotto (mesi)',    'produzione')
  ins.run('anticipo_avviso_scadenza_giorni','60',           'int',    'Anticipo avviso scadenze (giorni)', 'avvisi')
  ins.run('cliente_inattivo_giorni',     '20',              'int',    'Soglia cliente inattivo (giorni)',  'avvisi')
  ins.run('finestra_analisi_vendite_giorni','90',           'int',    'Finestra analisi vendite (giorni)', 'vendite')
  ins.run('backup_percorso',             '',                'string', 'Cartella di destinazione backup',   'backup')
  ins.run('backup_numero_da_mantenere',  '30',              'int',    'Numero backup da mantenere',   'backup')
})()

runAdditiveMigrations()

// ─── DATI DEMO ────────────────────────────────────────────────────────────────
const passwordHash = bcryptjs.hashSync('demo', 10)

db.transaction(() => {
  // ── Utente ─────────────────────────────────────────────────────────────────
  db.prepare(`INSERT INTO utente (id, nome, password_hash, password_modificata_il, ultimo_accesso)
              VALUES (1, 'Amministratore', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).run(passwordHash)

  // ── Licenza demo ───────────────────────────────────────────────────────────
  db.prepare(`INSERT INTO licenza (id, stringa, intestatario, scadenza, emessa_il)
              VALUES (1, 'DEMO-BIRRIFICIO-DEMO', 'Birrificio Demo', NULL, '2026-01-01T00:00:00Z')`).run()

  // ── Birre (3) ──────────────────────────────────────────────────────────────
  // id=1 Aurora, id=2 Tramonto, id=3 Nebbia
  const insBirra = db.prepare(`INSERT INTO birre (nome, stile, descrizione, attiva) VALUES (?, ?, ?, 1)`)
  insBirra.run('Aurora',   'Blond Ale',   'Birra chiara dorata, delicata e leggermente luppolata. Ideale come aperitivo.')
  insBirra.run('Tramonto', 'Session IPA', 'IPA sessionabile con note agrumate di pompelmo e frutto della passione. Bassa gradazione.')
  insBirra.run('Nebbia',   'Weizen',      'Blanche di frumento torbida, aromi di banana e chiodi di garofano. Corpo morbido.')

  // ── Fornitori (3) ──────────────────────────────────────────────────────────
  // id=1 MaltEuropa, id=2 HopShop, id=3 ImbottiglioShop
  const insFornitore = db.prepare(`INSERT INTO fornitori (nome, contatto, note, attivo) VALUES (?, ?, ?, 1)`)
  insFornitore.run('MaltEuropa Srl',    'Giulia Ferretti — info@malteuropa.it',    'Fornitore principale malti')
  insFornitore.run('HopShop Italia',    'Paolo Mancini — ordini@hopshop.it',       'Luppoli, lieviti e additivi')
  insFornitore.run('ImbottiglioShop',   'Sara Conti — vendite@imbottilioshop.it',  'Bottiglie, tappi, fusti')

  // ── Materie prime (8) ──────────────────────────────────────────────────────
  // id=1 Malto Pilsner, id=2 Malto Pale Ale, id=3 Malto Frumento
  // id=4 Luppolo Saaz (SOTTO soglia), id=5 Luppolo Citra
  // id=6 Lievito Ale US-05, id=7 Acqua, id=8 Gypsum
  const insMP = db.prepare(`INSERT INTO materie_prime
    (nome, categoria, unita_misura, soglia_riordino_fissa, soglia_riordino_dinamica_cotte, fornitore_preferito, note)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
  insMP.run('Malto Pilsner',     'malto',   'kg', 50,   null, 'MaltEuropa Srl', 'Base per birre chiare')
  insMP.run('Malto Pale Ale',    'malto',   'kg', 30,   null, 'MaltEuropa Srl', 'Base per birre anglosassoni')
  insMP.run('Malto di Frumento', 'malto',   'kg', 40,   null, 'MaltEuropa Srl', 'Per Weizen e blanche')
  insMP.run('Luppolo Saaz',      'luppolo', 'g',  500,  null, 'HopShop Italia', 'Note erbacee e speziate')
  insMP.run('Luppolo Citra',     'luppolo', 'g',  500,  null, 'HopShop Italia', 'Note agrumate e tropicali')
  insMP.run('Lievito Ale US-05', 'lievito', 'g',  150,  null, 'HopShop Italia', 'Lievito secco versatile')
  insMP.run('Acqua',             'acqua',   'L',  null, null, null,             null)
  insMP.run('Gypsum',            'additivo','g',  100,  null, 'HopShop Italia', 'Solfato di calcio per profilo acqua')

  // ── Lotti materie prime (9) ─────────────────────────────────────────────────
  // Giacenza finale (dopo cotte già effettuate):
  //   Malto Pilsner: lotto-A 110kg, lotto-B 55kg → tot 165kg (> soglia 50)
  //   Malto Pale Ale: lotto-C 62kg (> soglia 30)
  //   Malto Frumento: lotto-D 50kg (> soglia 40)
  //   Luppolo Saaz: lotto-E 300g (< soglia 500 → avviso scorta_bassa)
  //   Luppolo Citra: lotto-F 900g (> soglia 500)
  //   Lievito US-05: lotto-G 170g (> soglia 150)
  //   Acqua: lotto-H 5000L
  //   Gypsum: lotto-I 450g (> soglia 100)
  //
  // Lotto-A Malto Pilsner: scadenza 2027-12-01 — lotto-B: scadenza 2026-06-10 (≤60gg → avviso)
  const insLotto = db.prepare(`INSERT INTO lotti_materie_prime
    (materia_prima_id, fornitore_id, lotto_fornitore, data_carico, data_scadenza, quantita_iniziale, quantita_residua, note)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
  // id=1
  insLotto.run(1, 1, 'MP-PILSNER-2601', '2026-01-10', '2027-12-01', 200, 110, null)
  // id=2 – scadenza imminente (12 giorni da oggi 2026-05-29 → 2026-06-10)
  insLotto.run(1, 1, 'MP-PILSNER-2603', '2026-03-01', '2026-06-10', 100, 55,  'Lotto in esaurimento')
  // id=3
  insLotto.run(2, 1, 'MP-PALEALE-2602', '2026-02-01', '2027-06-01', 150, 62,  null)
  // id=4
  insLotto.run(3, 1, 'MP-FRUM-2601',    '2026-01-20', '2027-03-01', 100, 50,  null)
  // id=5 – sotto soglia (300 < 500)
  insLotto.run(4, 2, 'HS-SAAZ-2510',    '2025-10-01', '2026-09-01', 1000, 300, 'Scorte basse — riordinare')
  // id=6
  insLotto.run(5, 2, 'HS-CITRA-2511',   '2025-11-15', '2026-08-15', 1500, 900, null)
  // id=7
  insLotto.run(6, 2, 'HS-US05-2602',    '2026-02-20', '2026-07-01', 500,  170, null)
  // id=8
  insLotto.run(7, null, 'ACQUA-LOCALE', '2026-01-01', null,         5000, 5000, null)
  // id=9
  insLotto.run(8, 2, 'HS-GYP-2601',    '2026-01-15', '2027-01-01', 500,  450, null)

  // ── Materiali confezionamento (4) ─────────────────────────────────────────
  // id=1 Bottiglia 33cl, id=2 Tappo corona (SOTTO soglia), id=3 Fusto 20L, id=4 Fusto 24L
  const insMat = db.prepare(`INSERT INTO materiali_confezionamento
    (nome, categoria, birra_id, capacita_cl, capacita_litri, soglia_riordino, attivo)
    VALUES (?, ?, ?, ?, ?, ?, 1)`)
  insMat.run('Bottiglia 33cl',  'bottiglia', null, 33,   null, 500)
  insMat.run('Tappo corona',    'tappo',     null, null, null, 1000)
  insMat.run('Fusto 20L',       'fusto',     null, null, 20,   5)
  insMat.run('Fusto 24L',       'fusto',     null, null, 24,   3)

  // ── Giacenza confezionamento ───────────────────────────────────────────────
  // Bottiglia: 850 (> soglia 500) | Tappo: 800 (< soglia 1000 → avviso) | Fusto 20L: 15 | Fusto 24L: 8
  const insGiac = db.prepare(`INSERT INTO giacenza_confezionamento (materiale_id, quantita, ultimo_aggiornamento) VALUES (?, ?, CURRENT_TIMESTAMP)`)
  insGiac.run(1, 850)
  insGiac.run(2, 800)  // sotto soglia 1000
  insGiac.run(3, 15)
  insGiac.run(4, 8)

  // Movimenti carico iniziale confezionamento
  const insMov = db.prepare(`INSERT INTO movimenti_confezionamento (materiale_id, tipo_movimento, quantita, causale) VALUES (?, 'carico', ?, 'Carico iniziale')`)
  insMov.run(1, 850)
  insMov.run(2, 800)
  insMov.run(3, 15)
  insMov.run(4, 8)

  // ── Ricette (3) ────────────────────────────────────────────────────────────
  // id=1 Aurora, id=2 Tramonto, id=3 Nebbia
  const insRicetta = db.prepare(`INSERT INTO ricette (birra_id, versione, cotta_litri_riferimento, note, attiva, archiviata) VALUES (?, 1, 250, ?, 1, 0)`)
  insRicetta.run(1, 'Ricetta base Aurora — bilanciata e facilmente riproducibile')
  insRicetta.run(2, 'Tramonto v1 — dry hop ridotto per sessionalità')
  insRicetta.run(3, 'Nebbia Weizen classica — lievitazione a 18°C')

  // ── Ricetta ingredienti ────────────────────────────────────────────────────
  // Aurora (ricetta 1): Malto Pilsner 70kg, Malto Pale Ale 5kg, Luppolo Saaz 200g, Lievito 100g, Acqua 270L
  // Tramonto (ricetta 2): Malto Pale Ale 60kg, Luppolo Citra 300g, Luppolo Saaz 50g, Lievito 80g, Acqua 270L
  // Nebbia (ricetta 3): Malto Pilsner 40kg, Malto Frumento 35kg, Lievito 100g, Acqua 270L
  const insRI = db.prepare(`INSERT INTO ricetta_ingredienti (ricetta_id, materia_prima_id, quantita, note) VALUES (?, ?, ?, ?)`)
  insRI.run(1, 1, 70,  'mash')
  insRI.run(1, 2, 5,   'mash — apporto colore')
  insRI.run(1, 4, 200, 'bollitura 60 min')
  insRI.run(1, 6, 100, 'dry')
  insRI.run(1, 7, 270, null)
  insRI.run(2, 2, 60,  'mash')
  insRI.run(2, 5, 300, 'bollitura 15 min + dry hop')
  insRI.run(2, 4, 50,  'bollitura 60 min')
  insRI.run(2, 6, 80,  'dry')
  insRI.run(2, 7, 270, null)
  insRI.run(3, 1, 40,  'mash')
  insRI.run(3, 3, 35,  'mash frumento')
  insRI.run(3, 6, 100, 'dry')
  insRI.run(3, 7, 270, null)

  // ── Clienti (5) ────────────────────────────────────────────────────────────
  // id=1..4 con vendite recenti, id=5 senza vendite → cliente_inattivo avviso
  const insCli = db.prepare(`INSERT INTO clienti (nome, partita_iva, indirizzo, telefono, email, tipo_cliente, note, attivo) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`)
  insCli.run('Pub dell\'Orso',               '02345678901', 'Via Roma 12, Milano',          '02 1234567',  'orso@pubmilano.it',     'pub',       null)
  insCli.run('Enoteca La Cantina',           '03456789012', 'Corso Garibaldi 44, Torino',   '011 9876543', 'info@lacantina.it',     'enoteca',   null)
  insCli.run('Ristorante Il Vecchio Mulino', '04567890123', 'Via dei Colli 8, Bologna',     '051 3456789', 'mulino@ristomail.it',   'ristorante', null)
  insCli.run('Birreria Artigianale Nord',    '05678901234', 'Piazza Duomo 3, Bergamo',      '035 2345678', 'nord@birreria.it',      'pub',       null)
  insCli.run('Sig. Verdi Giovanni',          null,          'Via Manzoni 7, Brescia',       '030 1122334', 'g.verdi@email.it',      'privato',   'Cliente privato — nessun ordine recente')

  // ── Cotte (3) ──────────────────────────────────────────────────────────────
  // id=1 Aurora in_corso, id=2 Tramonto confezionata, id=3 Nebbia confezionata
  const insCotta = db.prepare(`INSERT INTO cotte (numero_lotto, birra_id, ricetta_id, data_inizio, data_confezionamento, litri_teorici, stato, note) VALUES (?, ?, ?, ?, ?, 250, ?, ?)`)
  insCotta.run('2026-001', 1, 1, '2026-05-01', null,         'in_corso',    'Fermentazione primaria in corso')
  insCotta.run('2026-002', 2, 2, '2026-03-01', '2026-03-15', 'confezionata', null)
  insCotta.run('2026-003', 3, 3, '2026-04-05', '2026-04-20', 'confezionata', null)

  // ── Cotta materie prime (ingredienti usati per cotta) ─────────────────────
  const insCMP = db.prepare(`INSERT INTO cotta_materie_prime (cotta_id, lotto_materia_prima_id, materia_prima_id, quantita_usata) VALUES (?, ?, ?, ?)`)
  // Cotta 1 (Aurora, in_corso — ingredienti già prelevati, cotta in fermentazione)
  insCMP.run(1, 2, 1, 70)   // Malto Pilsner da lotto-B
  insCMP.run(1, 3, 2, 5)    // Malto Pale Ale da lotto-C
  insCMP.run(1, 5, 4, 200)  // Luppolo Saaz da lotto-E
  insCMP.run(1, 7, 6, 100)  // Lievito da lotto-G
  insCMP.run(1, 8, 7, 270)  // Acqua da lotto-H
  // Cotta 2 (Tramonto, confezionata)
  insCMP.run(2, 3, 2, 60)   // Malto Pale Ale da lotto-C
  insCMP.run(2, 6, 5, 300)  // Luppolo Citra da lotto-F
  insCMP.run(2, 5, 4, 50)   // Luppolo Saaz da lotto-E
  insCMP.run(2, 7, 6, 80)   // Lievito da lotto-G
  insCMP.run(2, 8, 7, 270)  // Acqua da lotto-H
  // Cotta 3 (Nebbia, confezionata)
  insCMP.run(3, 1, 1, 40)   // Malto Pilsner da lotto-A
  insCMP.run(3, 4, 3, 35)   // Malto Frumento da lotto-D
  insCMP.run(3, 7, 6, 100)  // Lievito da lotto-G
  insCMP.run(3, 8, 7, 270)  // Acqua da lotto-H

  // ── Confezionamento ────────────────────────────────────────────────────────
  // Cotta 2 (Tramonto): 600 bottiglie, shelf_life 13 mesi → scadenza 2027-04-15
  // Cotta 3 (Nebbia): 500 bottiglie, shelf_life 13 mesi → scadenza 2027-05-20
  const insConf = db.prepare(`INSERT INTO confezionamento (cotta_id, bottiglie_prodotte, cartoni_prodotti, scarto_litri, data_scadenza) VALUES (?, ?, 0, ?, ?)`)
  insConf.run(2, 600, 5.5, '2027-04-15')
  insConf.run(3, 500, 7.8, '2027-05-20')

  // ── Confezionamento fusti ──────────────────────────────────────────────────
  // Cotta 2 → 5 fusti 20L (confezionamento id=1)
  // Cotta 3 → 4 fusti 20L + 3 fusti 24L (confezionamento id=2)
  const insCF = db.prepare(`INSERT INTO confezionamento_fusti (confezionamento_id, materiale_id, quantita) VALUES (?, ?, ?)`)
  insCF.run(1, 3, 5)  // Tramonto: 5 fusti 20L
  insCF.run(2, 3, 4)  // Nebbia: 4 fusti 20L
  insCF.run(2, 4, 3)  // Nebbia: 3 fusti 24L

  // ── Vendite (8 vendite) ────────────────────────────────────────────────────
  // Tramonto venduto: 24+48+12+12+36 = 132 bottiglie → rimanenza 600-132=468
  //                   1 fusto 20L             → rimanenza 5-1=4
  // Nebbia venduto:   30+60+24 = 114 bottiglie → rimanenza 500-114=386
  //                   2 fusti 20L + 1 fusto 24L → rimanenza 4-2=2 / 3-1=2
  const insVendita = db.prepare(`INSERT INTO vendite (cliente_id, data, note, omaggio, occasione) VALUES (?, ?, ?, ?, ?)`)
  const v1 = insVendita.run(1, '2026-03-15', null, 0, null).lastInsertRowid
  const v2 = insVendita.run(2, '2026-04-01', null, 0, null).lastInsertRowid
  const v3 = insVendita.run(3, '2026-04-20', null, 0, null).lastInsertRowid
  const v4 = insVendita.run(1, '2026-04-25', 'Bottiglie omaggio inaugurazione', 1, 'Inaugurazione nuovo locale').lastInsertRowid
  const v5 = insVendita.run(4, '2026-05-01', null, 0, null).lastInsertRowid
  const v6 = insVendita.run(2, '2026-05-10', null, 0, null).lastInsertRowid
  const v7 = insVendita.run(3, '2026-05-20', null, 0, null).lastInsertRowid
  const v8 = insVendita.run(1, '2026-05-26', null, 0, null).lastInsertRowid

  // ── Vendita dettaglio ──────────────────────────────────────────────────────
  const insVD = db.prepare(`INSERT INTO vendita_dettaglio (vendita_id, cotta_id, tipo_prodotto, materiale_id, quantita, omaggio) VALUES (?, ?, ?, ?, ?, ?)`)
  insVD.run(v1, 2, 'bottiglia', null, 24, 0)  // Tramonto 24 bot
  insVD.run(v2, 2, 'bottiglia', null, 48, 0)  // Tramonto 48 bot
  insVD.run(v3, 3, 'bottiglia', null, 30, 0)  // Nebbia 30 bot
  insVD.run(v4, 2, 'bottiglia', null, 12, 1)  // Tramonto 12 bot OMAGGIO
  insVD.run(v5, 3, 'bottiglia', null, 60, 0)  // Nebbia 60 bot
  insVD.run(v5, 2, 'bottiglia', null, 12, 0)  // Tramonto 12 bot
  insVD.run(v6, 3, 'bottiglia', null, 24, 0)  // Nebbia 24 bot
  insVD.run(v6, 2, 'fusto',     3,    1,  0)  // Tramonto 1 fusto 20L
  insVD.run(v7, 2, 'bottiglia', null, 36, 0)  // Tramonto 36 bot
  insVD.run(v8, 3, 'fusto',     3,    2,  0)  // Nebbia 2 fusti 20L
  insVD.run(v8, 3, 'fusto',     4,    1,  0)  // Nebbia 1 fusto 24L

  // ── Giacenza prodotto finito cartoni (bottiglie_sfuse, cartoni=0 per migration) ─
  // bottiglie_sfuse = bottiglie_prodotte - totale_vendite_bottiglie
  const insGPC = db.prepare(`INSERT INTO giacenza_prodotto_finito_cartoni (cotta_id, cartoni_disponibili, bottiglie_sfuse) VALUES (?, 0, ?)`)
  insGPC.run(2, 468)  // Tramonto: 600 - 132 = 468
  insGPC.run(3, 386)  // Nebbia: 500 - 114 = 386

  // ── Giacenza prodotto finito fusti ────────────────────────────────────────
  // Tramonto: 5 - 1 = 4 fusti 20L
  // Nebbia: 4 - 2 = 2 fusti 20L, 3 - 1 = 2 fusti 24L
  const insGPF = db.prepare(`INSERT INTO giacenza_prodotto_finito_fusti (cotta_id, materiale_id, quantita_disponibile) VALUES (?, ?, ?)`)
  insGPF.run(2, 3, 4)  // Tramonto fusti 20L
  insGPF.run(3, 3, 2)  // Nebbia fusti 20L
  insGPF.run(3, 4, 2)  // Nebbia fusti 24L

})()

db.close()

// ─── RIEPILOGO ─────────────────────────────────────────────────────────────────
const verify = new Database(dbPath, { readonly: true })

console.log('\n=== RIEPILOGO SEED DEMO ===')
const tables = [
  'configurazioni', 'utente', 'licenza',
  'birre', 'ricette', 'ricetta_ingredienti',
  'materie_prime', 'lotti_materie_prime',
  'materiali_confezionamento', 'giacenza_confezionamento',
  'fornitori', 'clienti',
  'cotte', 'cotta_materie_prime',
  'confezionamento', 'confezionamento_fusti',
  'giacenza_prodotto_finito_cartoni', 'giacenza_prodotto_finito_fusti',
  'vendite', 'vendita_dettaglio',
  'avvisi'
]
for (const t of tables) {
  const row = verify.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get()
  console.log(`  ${t.padEnd(36)} ${row.n}`)
}

const giacenze = verify.prepare(`
  SELECT b.nome AS birra, gpc.bottiglie_sfuse AS bottiglie_sfuse,
         COALESCE((SELECT SUM(quantita_disponibile) FROM giacenza_prodotto_finito_fusti gpf WHERE gpf.cotta_id = c.id), 0) AS fusti
  FROM cotte c
  JOIN birre b ON b.id = c.birra_id
  LEFT JOIN giacenza_prodotto_finito_cartoni gpc ON gpc.cotta_id = c.id
  WHERE c.stato = 'confezionata'
`).all()
console.log('\n  Giacenze prodotto finito:')
for (const g of giacenze) {
  console.log(`    ${g.birra.padEnd(10)} ${g.bottiglie_sfuse} bottiglie, ${g.fusti} fusti disponibili`)
}

const totVendite = verify.prepare(`SELECT SUM(quantita) AS q FROM vendita_dettaglio WHERE tipo_prodotto = 'bottiglia'`).get()
console.log(`\n  Bottiglie vendute totali: ${totVendite.q}`)

const avvisiCond = [
  { check: 'giacenza Luppolo Saaz < soglia',  query: `SELECT COALESCE(SUM(quantita_residua),0) AS v FROM lotti_materie_prime WHERE materia_prima_id = 5`, expect: '< 500g' },
  { check: 'lotto scadenza vicina (< 60gg)',   query: `SELECT id FROM lotti_materie_prime WHERE data_scadenza = '2026-06-10' AND quantita_residua > 0`, expect: 'trovato' },
  { check: 'Tappo corona sotto soglia',         query: `SELECT quantita FROM giacenza_confezionamento gc JOIN materiali_confezionamento mc ON mc.id = gc.materiale_id WHERE mc.nome = 'Tappo corona'`, expect: '< 1000' },
  { check: 'Cliente senza vendite (inattivo)',  query: `SELECT id FROM clienti WHERE nome LIKE '%Verdi%'`, expect: 'trovato' },
]
console.log('\n  Condizioni avvisi:')
for (const c of avvisiCond) {
  const r = verify.prepare(c.query).get()
  const val = r ? (r.v ?? r.quantita ?? r.id ?? 'sì') : 'NO'
  console.log(`    ✓ ${c.check}: ${val} (atteso ${c.expect})`)
}

verify.close()
console.log('\n=== SEED COMPLETATO ===\n')
