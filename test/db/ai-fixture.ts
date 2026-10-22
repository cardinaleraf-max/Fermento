/**
 * Dati di prova per Bira: un piccolo birrificio completo con clienti dotati di
 * contatti (che non devono MAI uscire), fornitore, titolare, operatore
 * agricolo e un cliente il cui nome compare anche dentro una materia prima.
 */
import type BetterSqlite3 from 'better-sqlite3'

type Db = BetterSqlite3.Database

export const CLIENTE_PUB = {
  nome: 'Pub La Botte',
  email: 'ordini@labotte.it',
  telefono: '+39 328 168 8823',
  partita_iva: '01421890912',
  indirizzo: 'Via Roma 12, Nuoro',
  note: 'Paga a 30 giorni, chiedere di Marco'
}
export const CLIENTE_BACCO = {
  nome: 'Bacco',
  email: 'bacco@enoteca.it',
  telefono: '0784 123456',
  partita_iva: 'IT09876543210',
  indirizzo: 'Corso Garibaldi 5, Orosei',
  note: ''
}
export const FORNITORE = {
  nome: 'Malteria Rossi',
  contatto: 'Mario Rossi 333 444 5566 mario@malteriarossi.it',
  note: 'Sconto del cinque per cento sopra i 500 kg'
}
export const FORNITORE_LIBERO = 'Vetreria Sarda Snc'
export const TITOLARE = 'Giuseppe Murru'
export const OPERATORE = 'Antonio Pinna'
export const RIF_CATASTALE = 'Foglio 12 mappale 345'
export const CHIAVE_GROQ = 'gsk_SEGRETISSIMA_1234567890'
export const PERCORSO_BACKUP = '/Users/giuseppemurru/Documenti/Backup Fermento'
export const NOTA_VENDITA = 'Consegnare sul retro, citofonare Marco Pisanu'
export const NOTA_FUSTI = 'Lasciati in cantina da Marco Pisanu'

const giorni = (n: number): string => {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

export type IdsBira = {
  pub: number
  bacco: number
  fornitore: number
  pilsner: number
  cascade: number
  maltoBacco: number
  birra: number
  cottaConfezionata: number
  cottaInCorso: number
}

export function seminaDatiBira(db: Db): IdsBira {
  const ins = (sql: string, ...p: unknown[]): number =>
    Number(db.prepare(sql).run(...p).lastInsertRowid)

  ins(`INSERT INTO utente (id, nome, password_hash) VALUES (1, ?, 'hash')`, TITOLARE)
  const setConf = db.prepare(`UPDATE configurazioni SET valore = ? WHERE chiave = ?`)
  setConf.run(TITOLARE, 'nome_titolare')
  setConf.run('Birrificio Prova', 'nome_birrificio')
  setConf.run(PERCORSO_BACKUP, 'backup_percorso')
  db.prepare(
    `INSERT OR REPLACE INTO configurazioni (chiave, valore, tipo, etichetta, categoria) VALUES ('ai_groq_api_key', ?, 'password', 'Chiave', 'assistente_ai')`
  ).run(CHIAVE_GROQ)

  const cliente = (c: typeof CLIENTE_PUB, tipo: string): number =>
    ins(
      `INSERT INTO clienti (nome, partita_iva, indirizzo, telefono, email, tipo_cliente, note) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      c.nome,
      c.partita_iva,
      c.indirizzo,
      c.telefono,
      c.email,
      tipo,
      c.note
    )
  const pub = cliente(CLIENTE_PUB, 'pub')
  const bacco = cliente(CLIENTE_BACCO, 'enoteca')
  const fornitore = ins(
    `INSERT INTO fornitori (nome, contatto, note) VALUES (?, ?, ?)`,
    FORNITORE.nome,
    FORNITORE.contatto,
    FORNITORE.note
  )

  const materia = (nome: string, cat: string, um: string, soglia: number | null): number =>
    ins(
      `INSERT INTO materie_prime (nome, categoria, unita_misura, soglia_riordino_fissa) VALUES (?, ?, ?, ?)`,
      nome,
      cat,
      um,
      soglia
    )
  const pilsner = materia('Malto Pilsner', 'malto', 'kg', 50)
  const cascade = materia('Luppolo Cascade', 'luppolo', 'kg', 5)
  const maltoBacco = materia('Malto Bacco', 'malto', 'kg', null)
  const lotto = (mp: number, codice: string, scad: string, qta: number): number =>
    ins(
      `INSERT INTO lotti_materie_prime (materia_prima_id, fornitore_id, lotto_fornitore, data_carico, data_scadenza, quantita_iniziale, quantita_residua) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      mp,
      fornitore,
      codice,
      giorni(-30),
      scad,
      qta,
      qta
    )
  const lPils = lotto(pilsner, 'MP-2026-02', giorni(200), 275)
  const lCasc = lotto(cascade, 'CA-2026-01', giorni(30), 4.8)
  lotto(maltoBacco, 'MB-1', giorni(120), 10)

  const birra = ins(
    `INSERT INTO birre (nome, stile, descrizione, attiva) VALUES ('Bionda', 'Golden Ale', 'Bionda di casa', 1)`
  )
  const ricetta = ins(
    `INSERT INTO ricette (birra_id, versione, cotta_litri_riferimento, attiva) VALUES (?, 1, 250, 1)`,
    birra
  )
  ins(
    `INSERT INTO ricetta_ingredienti (ricetta_id, materia_prima_id, quantita) VALUES (?, ?, 45)`,
    ricetta,
    pilsner
  )
  ins(
    `INSERT INTO ricetta_ingredienti (ricetta_id, materia_prima_id, quantita) VALUES (?, ?, 1.2)`,
    ricetta,
    cascade
  )

  const cottaConfezionata = ins(
    `INSERT INTO cotte (numero_lotto, birra_id, ricetta_id, data_inizio, data_confezionamento, litri_teorici, stato, note) VALUES ('L-2026-01', ?, ?, ?, ?, 250, 'confezionata', 'Variazioni rispetto alla ricetta: Malto Pilsner 45 → 50 kg')`,
    birra,
    ricetta,
    giorni(-60),
    giorni(-40)
  )
  ins(
    `INSERT INTO cotta_materie_prime (cotta_id, lotto_materia_prima_id, materia_prima_id, quantita_usata) VALUES (?, ?, ?, 50)`,
    cottaConfezionata,
    lPils,
    pilsner
  )
  ins(
    `INSERT INTO cotta_materie_prime (cotta_id, lotto_materia_prima_id, materia_prima_id, quantita_usata) VALUES (?, ?, ?, 1.2)`,
    cottaConfezionata,
    lCasc,
    cascade
  )
  ins(
    `INSERT INTO confezionamento (cotta_id, bottiglie_prodotte, cartoni_prodotti, scarto_litri, data_scadenza) VALUES (?, 600, 100, 2, ?)`,
    cottaConfezionata,
    giorni(300)
  )
  ins(
    `INSERT INTO giacenza_prodotto_finito_cartoni (cotta_id, cartoni_disponibili, bottiglie_sfuse) VALUES (?, 0, 468)`,
    cottaConfezionata
  )
  const cottaInCorso = ins(
    `INSERT INTO cotte (numero_lotto, birra_id, ricetta_id, data_inizio, litri_teorici, stato) VALUES ('L-2026-02', ?, ?, ?, 250, 'in_corso')`,
    birra,
    ricetta,
    giorni(-3)
  )

  const fusto = ins(
    `INSERT INTO materiali_confezionamento (nome, categoria, capacita_litri, soglia_riordino, attivo) VALUES ('Fusto 20 L', 'fusto', 20, 5, 1)`
  )
  db.prepare(`INSERT INTO giacenza_confezionamento (materiale_id, quantita) VALUES (?, 2)`).run(
    fusto
  )
  ins(
    `INSERT INTO movimenti_confezionamento (materiale_id, tipo_movimento, quantita, causale, fornitore, lotto_fornitore) VALUES (?, 'carico', 10, 'acquisto', ?, 'VS-88')`,
    fusto,
    FORNITORE_LIBERO
  )

  const vendita = ins(
    `INSERT INTO vendite (cliente_id, data, note, omaggio) VALUES (?, ?, ?, 0)`,
    pub,
    giorni(-10),
    NOTA_VENDITA
  )
  ins(
    `INSERT INTO vendita_dettaglio (vendita_id, cotta_id, tipo_prodotto, quantita) VALUES (?, ?, 'bottiglia', 120)`,
    vendita,
    cottaConfezionata
  )
  ins(
    `INSERT INTO vendita_dettaglio (vendita_id, cotta_id, tipo_prodotto, materiale_id, quantita) VALUES (?, ?, 'fusto', ?, 3)`,
    vendita,
    cottaConfezionata,
    fusto
  )
  const omaggio = ins(
    `INSERT INTO vendite (cliente_id, data, omaggio, occasione) VALUES (?, ?, 1, 'Festa da Bacco')`,
    bacco,
    giorni(-5)
  )
  ins(
    `INSERT INTO vendita_dettaglio (vendita_id, cotta_id, tipo_prodotto, quantita, omaggio) VALUES (?, ?, 'bottiglia', 12, 1)`,
    omaggio,
    cottaConfezionata
  )
  ins(
    `INSERT INTO movimenti_fusti_rendere (cliente_id, materiale_id, vendita_id, tipo, quantita, data, note) VALUES (?, ?, ?, 'uscita', 3, ?, ?)`,
    pub,
    fusto,
    vendita,
    giorni(-10),
    NOTA_FUSTI
  )

  ins(
    `INSERT INTO avvisi (tipo, riferimento_tabella, riferimento_id, messaggio, priorita, letto, risolto) VALUES ('cliente_inattivo', 'clienti', ?, 'Il cliente Bacco non acquista da 30 giorni', 'bassa', 0, 0)`,
    bacco
  )
  ins(
    `INSERT INTO avvisi (tipo, riferimento_tabella, riferimento_id, messaggio, priorita, letto, risolto) VALUES ('scorta_bassa', 'materie_prime', ?, 'Luppolo Cascade: 4,8 kg sotto la soglia di 5 kg', 'alta', 0, 0)`,
    cascade
  )

  const campo = ins(
    `INSERT INTO agri_campi (nome, superficie_ha, localita, rif_catastale) VALUES ('Campo 1A', 10.5, 'Irgoli', ?)`,
    RIF_CATASTALE
  )
  const semina = ins(
    `INSERT INTO agri_semine (campo_id, stagione, coltura, varieta, data, superficie_ha) VALUES (?, '2026/2027', 'orzo', 'Concerto', ?, 10.5)`,
    campo,
    giorni(-200)
  )
  ins(
    `INSERT INTO agri_operazioni (semina_id, tipo, data, operatore, note) VALUES (?, 'trattamento', ?, ?, 'diserbo')`,
    semina,
    giorni(-150),
    OPERATORE
  )

  return {
    pub,
    bacco,
    fornitore,
    pilsner,
    cascade,
    maltoBacco,
    birra,
    cottaConfezionata,
    cottaInCorso
  }
}

/** Tutti i valori che non devono mai comparire in ciò che esce dal PC. */
export const VALORI_VIETATI: string[] = [
  CLIENTE_PUB.nome,
  CLIENTE_PUB.email,
  CLIENTE_PUB.telefono,
  CLIENTE_PUB.partita_iva,
  CLIENTE_PUB.indirizzo,
  CLIENTE_PUB.note,
  CLIENTE_BACCO.email,
  CLIENTE_BACCO.telefono,
  CLIENTE_BACCO.partita_iva,
  CLIENTE_BACCO.indirizzo,
  FORNITORE.nome,
  FORNITORE.contatto,
  FORNITORE.note,
  FORNITORE_LIBERO,
  TITOLARE,
  OPERATORE,
  RIF_CATASTALE,
  CHIAVE_GROQ,
  PERCORSO_BACKUP,
  NOTA_VENDITA,
  NOTA_FUSTI,
  'Festa da Bacco'
]
