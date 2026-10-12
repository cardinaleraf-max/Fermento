/**
 * Database di esempio della versione demo: resources/demo/fermento-demo-seed.db
 * (incluso nel pacchetto demo e ripristinato a ogni avvio).
 *
 * "Birrificio Demo" inventato, con tutta la filiera: campo → raccolta →
 * calibratura → maltazione → cotta → confezionamento (lotti imballi HACCP) →
 * vendite e fusti a rendere. Nessun dato di clienti reali.
 *
 * Le date sono calcolate rispetto al giorno in cui si genera il database, così
 * la demo è sempre "fresca" (avvisi, scadenze, clienti inattivi sensati).
 *
 * Uso: npm run seed:demo  (lo lanciano già build:win:demo e build:mac:demo)
 */
import fs from 'node:fs'
import path from 'node:path'
import bcrypt from 'bcryptjs'
import { applicaSchema } from '../src/main/database'
import { salvaCampo, salvaSemina } from '../src/main/agricolo/servizi/campi'
import { creaLotto, salvaDatiFitofarmaco } from '../src/main/agricolo/servizi/magazzino'
import { salvaOperazione } from '../src/main/agricolo/servizi/operazioni'
import { configParametri, salvaValori } from '../src/main/agricolo/servizi/parametri'
import { inserisciLottiImballi } from '../src/main/agricolo/servizi/imballi'
import { traccia } from '../src/main/agricolo/servizi/tracciabilita'
import {
  avviaMaltazione,
  chiudiMaltazione,
  salvaCalibratura,
  salvaRaccolta
} from '../src/main/agricolo/servizi/lavorazioni'
import { stagioneDaData, type FaseLavorazione, type NodoTraccia } from '../src/shared/agricolo'
import type BetterSqlite3 from 'better-sqlite3'

const Database = require('better-sqlite3') as typeof import('better-sqlite3')

type Db = BetterSqlite3.Database

const destinazione = path.resolve(
  process.argv[2] ?? path.join(__dirname, '..', 'resources', 'demo', 'fermento-demo-seed.db')
)

// ── Date ─────────────────────────────────────────────────────────────────────

const oggi = new Date()
oggi.setHours(12, 0, 0, 0)

function iso(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const g = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${g}`
}

/** Data a n giorni da oggi (negativo = nel passato). */
function giorni(n: number): string {
  const d = new Date(oggi)
  d.setDate(d.getDate() + n)
  return iso(d)
}

function piuMesi(data: string, mesi: number): string {
  const d = new Date(`${data}T12:00:00`)
  d.setMonth(d.getMonth() + mesi)
  return iso(d)
}

// Ultima raccolta già maltata: da ottobre quella dell'anno in corso, prima quella dell'anno scorso.
const annoRaccolta = oggi.getMonth() >= 9 ? oggi.getFullYear() : oggi.getFullYear() - 1
const A = annoRaccolta
const stagionePassata = `${A - 1}/${A}`
const stagioneMalteria = `${A}/${A + 1}`

// ── Scrittura ────────────────────────────────────────────────────────────────

fs.mkdirSync(path.dirname(destinazione), { recursive: true })
for (const f of [
  destinazione,
  `${destinazione}-wal`,
  `${destinazione}-shm`,
  `${destinazione}-journal`
]) {
  if (fs.existsSync(f)) fs.unlinkSync(f)
}

const db: Db = new Database(destinazione)
db.pragma('foreign_keys = ON')
applicaSchema(db)

function config(chiave: string, valore: string): void {
  const n = db
    .prepare(
      `UPDATE configurazioni SET valore = ?, aggiornato_il = CURRENT_TIMESTAMP WHERE chiave = ?`
    )
    .run(valore, chiave).changes
  if (n !== 1) throw new Error(`Configurazione mancante: ${chiave}`)
}

function inserisci(sql: string, ...valori: unknown[]): number {
  return Number(db.prepare(sql).run(...valori).lastInsertRowid)
}

// ── Magazzino materie prime (acquisti) ───────────────────────────────────────

function materia(
  nome: string,
  categoria: string,
  unita: string,
  soglia: number | null,
  fornitore: string | null,
  note: string | null = null
): number {
  return inserisci(
    `INSERT INTO materie_prime (nome, categoria, unita_misura, soglia_riordino_fissa, fornitore_preferito, note)
     VALUES (?, ?, ?, ?, ?, ?)`,
    nome,
    categoria,
    unita,
    soglia,
    fornitore,
    note
  )
}

function acquisto(
  materiaPrimaId: number,
  fornitoreId: number | null,
  codice: string,
  quantita: number,
  dataCarico: string,
  scadenza: string | null,
  note: string | null = null
): number {
  return inserisci(
    `INSERT INTO lotti_materie_prime
       (materia_prima_id, fornitore_id, lotto_fornitore, data_carico, data_scadenza, quantita_iniziale, quantita_residua, note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    materiaPrimaId,
    fornitoreId,
    codice,
    dataCarico,
    scadenza,
    quantita,
    quantita,
    note
  )
}

// ── Confezionamento (come conf:carico) ───────────────────────────────────────

function caricoImballo(
  materialeId: number,
  quantita: number,
  data: string,
  lotto: string,
  fornitore: string
): number {
  db.prepare(
    `INSERT INTO giacenza_confezionamento (materiale_id, quantita, ultimo_aggiornamento)
     VALUES (?, ?, ?)
     ON CONFLICT(materiale_id) DO UPDATE SET quantita = quantita + excluded.quantita,
       ultimo_aggiornamento = excluded.ultimo_aggiornamento`
  ).run(materialeId, quantita, data)
  return inserisci(
    `INSERT INTO movimenti_confezionamento (materiale_id, tipo_movimento, quantita, data, causale, lotto_fornitore, fornitore)
     VALUES (?, 'carico', ?, ?, 'Acquisto', ?, ?)`,
    materialeId,
    quantita,
    data,
    lotto,
    fornitore
  )
}

// ── Produzione (stessa logica di prod:avvia-cotta e prod:confeziona) ─────────

/** Avvia la cotta scaricando gli ingredienti della ricetta dai lotti, primo che scade per primo. */
function avviaCotta(numeroLotto: string, birraId: number, ricettaId: number, data: string): number {
  const cottaId = inserisci(
    `INSERT INTO cotte (numero_lotto, birra_id, ricetta_id, data_inizio, litri_teorici, stato, creato_il)
     VALUES (?, ?, ?, ?, 250, 'in_corso', ?)`,
    numeroLotto,
    birraId,
    ricettaId,
    data,
    `${data} 08:00:00`
  )
  const ingredienti = db
    .prepare(`SELECT materia_prima_id, quantita FROM ricetta_ingredienti WHERE ricetta_id = ?`)
    .all(ricettaId) as Array<{ materia_prima_id: number; quantita: number }>
  for (const ing of ingredienti) {
    let rimanente = ing.quantita
    const lotti = db
      .prepare(
        `SELECT id, quantita_residua FROM lotti_materie_prime
         WHERE materia_prima_id = ? AND quantita_residua > 0 AND data_carico <= ?
         ORDER BY data_scadenza ASC, id ASC`
      )
      .all(ing.materia_prima_id, data) as Array<{ id: number; quantita_residua: number }>
    for (const l of lotti) {
      if (rimanente <= 0) break
      const usato = Math.min(l.quantita_residua, rimanente)
      db.prepare(`UPDATE lotti_materie_prime SET quantita_residua = ? WHERE id = ?`).run(
        l.quantita_residua - usato,
        l.id
      )
      inserisci(
        `INSERT INTO cotta_materie_prime (cotta_id, lotto_materia_prima_id, materia_prima_id, quantita_usata)
         VALUES (?, ?, ?, ?)`,
        cottaId,
        l.id,
        ing.materia_prima_id,
        usato
      )
      rimanente -= usato
    }
    if (rimanente > 0.0001)
      throw new Error(
        `Cotta ${numeroLotto}: giacenza insufficiente (materia ${ing.materia_prima_id})`
      )
  }
  return cottaId
}

function confeziona(
  cottaId: number,
  data: string,
  bottiglie: number,
  fusti: Array<{ materiale: number; quantita: number }>,
  scartoLitri: number,
  lottiImballi: number[]
): void {
  const birra = db.prepare(`SELECT birra_id FROM cotte WHERE id = ?`).get(cottaId) as {
    birra_id: number
  }
  const confId = inserisci(
    `INSERT INTO confezionamento (cotta_id, bottiglie_prodotte, cartoni_prodotti, scarto_litri, data_scadenza, data_inserimento)
     VALUES (?, ?, 0, ?, ?, ?)`,
    cottaId,
    bottiglie,
    scartoLitri,
    piuMesi(data, 13),
    `${data} 17:00:00`
  )
  for (const f of fusti) {
    inserisci(
      `INSERT INTO confezionamento_fusti (confezionamento_id, materiale_id, quantita) VALUES (?, ?, ?)`,
      confId,
      f.materiale,
      f.quantita
    )
    inserisci(
      `INSERT INTO giacenza_prodotto_finito_fusti (cotta_id, materiale_id, quantita_disponibile) VALUES (?, ?, ?)`,
      cottaId,
      f.materiale,
      f.quantita
    )
  }
  inserisci(
    `INSERT INTO giacenza_prodotto_finito_cartoni (cotta_id, cartoni_disponibili, bottiglie_sfuse) VALUES (?, 0, ?)`,
    cottaId,
    bottiglie
  )
  db.prepare(
    `UPDATE cotte SET stato = 'confezionata', data_confezionamento = ?, aggiornato_il = ? WHERE id = ?`
  ).run(data, `${data} 17:00:00`, cottaId)

  const scarica = (materialeId: number, quantita: number): void => {
    const n = db
      .prepare(
        `UPDATE giacenza_confezionamento SET quantita = quantita - ?, ultimo_aggiornamento = ?
         WHERE materiale_id = ? AND quantita >= ?`
      )
      .run(quantita, data, materialeId, quantita).changes
    if (n !== 1)
      throw new Error(`Confezionamento cotta ${cottaId}: imballi insufficienti (${materialeId})`)
    inserisci(
      `INSERT INTO movimenti_confezionamento (materiale_id, tipo_movimento, quantita, data, causale, riferimento)
       VALUES (?, 'scarico', ?, ?, 'produzione', ?)`,
      materialeId,
      quantita,
      `${data} 17:00:00`,
      String(cottaId)
    )
  }
  if (bottiglie > 0) {
    for (const categoria of ['bottiglia', 'tappo']) {
      const m = db
        .prepare(
          `SELECT id FROM materiali_confezionamento WHERE categoria = ? AND attivo = 1 LIMIT 1`
        )
        .get(categoria) as { id: number } | undefined
      if (m) scarica(m.id, bottiglie)
    }
    const etichetta = db
      .prepare(
        `SELECT id FROM materiali_confezionamento WHERE categoria = 'etichetta' AND birra_id = ? AND attivo = 1 LIMIT 1`
      )
      .get(birra.birra_id) as { id: number } | undefined
    if (etichetta) scarica(etichetta.id, bottiglie)
  }
  for (const f of fusti) scarica(f.materiale, f.quantita)

  inserisciLottiImballi(db, cottaId, lottiImballi)
}

// ── Vendite (stessa logica di vendite:registra) ──────────────────────────────

type Riga =
  | { bottiglie: number; cotta: number; omaggio?: boolean }
  | { fusti: number; cotta: number; materiale: number; aRendere?: number }

function vendita(
  clienteId: number | null,
  data: string,
  righe: Riga[],
  extra: { note?: string; omaggio?: boolean; occasione?: string } = {}
): number {
  const venditaId = inserisci(
    `INSERT INTO vendite (cliente_id, data, note, omaggio, occasione, creato_il) VALUES (?, ?, ?, ?, ?, ?)`,
    clienteId,
    data,
    extra.note ?? null,
    extra.omaggio ? 1 : 0,
    extra.omaggio ? (extra.occasione ?? null) : null,
    `${data} 11:00:00`
  )
  for (const r of righe) {
    if ('bottiglie' in r) {
      inserisci(
        `INSERT INTO vendita_dettaglio (vendita_id, cotta_id, tipo_prodotto, materiale_id, altro_prodotto_id, quantita, omaggio)
         VALUES (?, ?, 'bottiglia', NULL, NULL, ?, ?)`,
        venditaId,
        r.cotta,
        r.bottiglie,
        r.omaggio || extra.omaggio ? 1 : 0
      )
      const n = db
        .prepare(
          `UPDATE giacenza_prodotto_finito_cartoni SET bottiglie_sfuse = bottiglie_sfuse - ?
           WHERE cotta_id = ? AND bottiglie_sfuse >= ?`
        )
        .run(r.bottiglie, r.cotta, r.bottiglie).changes
      if (n !== 1) throw new Error(`Vendita del ${data}: bottiglie insufficienti`)
    } else {
      inserisci(
        `INSERT INTO vendita_dettaglio (vendita_id, cotta_id, tipo_prodotto, materiale_id, altro_prodotto_id, quantita, omaggio)
         VALUES (?, ?, 'fusto', ?, NULL, ?, 0)`,
        venditaId,
        r.cotta,
        r.materiale,
        r.fusti
      )
      const n = db
        .prepare(
          `UPDATE giacenza_prodotto_finito_fusti SET quantita_disponibile = quantita_disponibile - ?
           WHERE cotta_id = ? AND materiale_id = ? AND quantita_disponibile >= ?`
        )
        .run(r.fusti, r.cotta, r.materiale, r.fusti).changes
      if (n !== 1) throw new Error(`Vendita del ${data}: fusti insufficienti`)
      if (r.aRendere && clienteId !== null) {
        inserisci(
          `INSERT INTO movimenti_fusti_rendere (cliente_id, materiale_id, vendita_id, tipo, quantita, data)
           VALUES (?, ?, ?, 'uscita', ?, ?)`,
          clienteId,
          r.materiale,
          venditaId,
          r.aRendere,
          data
        )
      }
    }
  }
  return venditaId
}

function rientroFusti(
  clienteId: number,
  materialeId: number,
  quantita: number,
  data: string
): void {
  inserisci(
    `INSERT INTO movimenti_fusti_rendere (cliente_id, materiale_id, tipo, quantita, data, note)
     VALUES (?, ?, 'rientro', ?, ?, ?)`,
    clienteId,
    materialeId,
    quantita,
    data,
    'Ritiro vuoti'
  )
}

// ── Modulo agricolo: valori dei parametri per nome ("Gruppo · Parametro") ─────

function parametri(
  fase: FaseLavorazione,
  lavorazioneId: number,
  valori: Record<string, string>,
  dateGruppi: Record<string, string> = {}
): void {
  const v: Record<number, string> = {}
  const d: Record<number, string> = {}
  const trovati = new Set<string>()
  for (const g of configParametri(db, fase)) {
    for (const p of g.parametri) {
      const chiave = `${g.nome} · ${p.nome}`
      if (valori[chiave] !== undefined) {
        v[p.id] = valori[chiave]
        trovati.add(chiave)
      }
    }
    if (dateGruppi[g.nome]) d[g.id] = dateGruppi[g.nome]
  }
  const mancanti = Object.keys(valori).filter((k) => !trovati.has(k))
  if (mancanti.length > 0) throw new Error(`Parametri inesistenti: ${mancanti.join(', ')}`)
  salvaValori(db, lavorazioneId, v, d)
}

function lottoDi(origine: string, origineId: number, calibro: string | null = null): number {
  const r = db
    .prepare(
      `SELECT id FROM lotti_materie_prime WHERE origine_tipo = ? AND origine_id = ? AND (? IS NULL OR calibro = ?)
       ORDER BY id LIMIT 1`
    )
    .get(origine, origineId, calibro, calibro) as { id: number } | undefined
  if (!r) throw new Error(`Lotto ${origine} ${origineId} ${calibro ?? ''} non trovato`)
  return r.id
}

// ═════════════════════════════════════════════════════════════════════════════

const genera = db.transaction(() => {
  // ── Identità e accesso ─────────────────────────────────────────────────────
  config('nome_birrificio', 'Birrificio Demo')
  config('nome_titolare', 'Mario Rossi')
  config('onboarding_completato', '1')
  config('modulo_agricolo_attivo', '1')
  inserisci(
    `INSERT INTO utente (id, nome, password_hash, password_modificata_il, ultimo_accesso)
     VALUES (1, 'Amministratore', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    bcrypt.hashSync('demo', 10)
  )

  // ── Fornitori ──────────────────────────────────────────────────────────────
  const fMalti = inserisci(
    `INSERT INTO fornitori (nome, contatto, note) VALUES (?, ?, ?)`,
    'MaltEuropa Srl',
    'Ufficio ordini',
    'Malti speciali'
  )
  const fLuppoli = inserisci(
    `INSERT INTO fornitori (nome, contatto, note) VALUES (?, ?, ?)`,
    'HopShop Italia',
    'Ufficio ordini',
    'Luppoli e lieviti'
  )
  inserisci(
    `INSERT INTO fornitori (nome, contatto, note) VALUES (?, ?, ?)`,
    'ImbottiglioShop',
    'Ufficio vendite',
    'Bottiglie, tappi, fusti'
  )

  // ── Materie prime della birra ──────────────────────────────────────────────
  const pilsner = materia(
    'Malto Pilsner',
    'malto',
    'kg',
    50,
    'MaltEuropa Srl',
    'Anche dalla malteria aziendale'
  )
  const paleAle = materia('Malto Pale Ale', 'malto', 'kg', 30, 'MaltEuropa Srl')
  const frumento = materia('Malto di Frumento', 'malto', 'kg', 40, 'MaltEuropa Srl')
  const saaz = materia('Luppolo Saaz', 'luppolo', 'g', 500, 'HopShop Italia')
  const citra = materia('Luppolo Citra', 'luppolo', 'g', 500, 'HopShop Italia')
  const us05 = materia('Lievito US-05', 'lievito', 'g', 150, 'HopShop Italia')
  const wb06 = materia('Lievito WB-06', 'lievito', 'g', 100, 'HopShop Italia')

  acquisto(pilsner, fMalti, 'ME-PIL-2611', 250, giorni(-150), giorni(420))
  acquisto(paleAle, fMalti, 'ME-PAL-2604', 200, giorni(-150), giorni(380))
  acquisto(frumento, fMalti, 'ME-FRU-2602', 120, giorni(-150), giorni(300))
  acquisto(saaz, fLuppoli, 'HS-SAAZ-25', 1000, giorni(-150), giorni(250), 'Scorta da riordinare')
  acquisto(citra, fLuppoli, 'HS-CIT-26', 2000, giorni(-120), giorni(280))
  acquisto(
    us05,
    fLuppoli,
    'HS-US05-118',
    500,
    giorni(-150),
    giorni(25),
    'In scadenza: usare per primo'
  )
  acquisto(us05, fLuppoli, 'HS-US05-131', 500, giorni(-30), giorni(330))
  acquisto(wb06, fLuppoli, 'HS-WB06-77', 400, giorni(-120), giorni(240))

  // ── Imballi ────────────────────────────────────────────────────────────────
  const matConf = (
    nome: string,
    categoria: string,
    cl: number | null,
    litri: number | null,
    soglia: number
  ): number =>
    inserisci(
      `INSERT INTO materiali_confezionamento (nome, categoria, capacita_cl, capacita_litri, soglia_riordino)
       VALUES (?, ?, ?, ?, ?)`,
      nome,
      categoria,
      cl,
      litri,
      soglia
    )
  const bottiglia = matConf('Bottiglia 33 cl', 'bottiglia', 33, null, 500)
  const tappo = matConf('Tappo corona 26 mm', 'tappo', null, null, 1000)
  const fusto20 = matConf('Fusto 20 L', 'fusto', null, 20, 5)
  const fusto24 = matConf('Fusto 24 L', 'fusto', null, 24, 3)

  const bott1 = caricoImballo(bottiglia, 1200, giorni(-140), 'VB33-2604', 'ImbottiglioShop')
  const bott2 = caricoImballo(bottiglia, 1000, giorni(-35), 'VB33-2609', 'ImbottiglioShop')
  const tap1 = caricoImballo(tappo, 1500, giorni(-140), 'TC26-0412', 'ImbottiglioShop')
  const tap2 = caricoImballo(tappo, 1000, giorni(-35), 'TC26-0907', 'ImbottiglioShop')
  const fus20 = caricoImballo(fusto20, 20, giorni(-140), 'KEG20-A', 'ImbottiglioShop')
  const fus24 = caricoImballo(fusto24, 8, giorni(-140), 'KEG24-A', 'ImbottiglioShop')

  // ── Birre e ricette (250 L) ────────────────────────────────────────────────
  const birra = (nome: string, stile: string, descrizione: string): number =>
    inserisci(
      `INSERT INTO birre (nome, stile, descrizione) VALUES (?, ?, ?)`,
      nome,
      stile,
      descrizione
    )
  const aurora = birra(
    'Aurora',
    'Blond Ale',
    'Chiara e dorata, fatta con il malto della malteria aziendale.'
  )
  const tramonto = birra('Tramonto', 'Session IPA', 'Agrumata e beverina, luppolatura Citra.')
  const nebbia = birra('Nebbia', 'Weizen', 'Frumento, banana e chiodi di garofano.')

  const ricetta = (
    birraId: number,
    note: string,
    ingredienti: Array<[number, number, string]>
  ): number => {
    const id = inserisci(
      `INSERT INTO ricette (birra_id, versione, cotta_litri_riferimento, note, attiva) VALUES (?, 1, 250, ?, 1)`,
      birraId,
      note
    )
    for (const [mp, q, n] of ingredienti)
      inserisci(
        `INSERT INTO ricetta_ingredienti (ricetta_id, materia_prima_id, quantita, note) VALUES (?, ?, ?, ?)`,
        id,
        mp,
        q,
        n
      )
    return id
  }
  const rAurora = ricetta(aurora, 'Ricetta base', [
    [pilsner, 55, 'Ammostamento'],
    [paleAle, 5, 'Ammostamento'],
    [saaz, 250, 'Bollitura 60 min'],
    [us05, 120, 'Inoculo']
  ])
  const rTramonto = ricetta(tramonto, 'Dry hop ridotto', [
    [paleAle, 58, 'Ammostamento'],
    [citra, 450, 'Bollitura 15 min + dry hop'],
    [saaz, 60, 'Bollitura 60 min'],
    [us05, 120, 'Inoculo']
  ])
  const rNebbia = ricetta(nebbia, 'Fermentazione a 18 °C', [
    [pilsner, 30, 'Ammostamento'],
    [frumento, 30, 'Ammostamento'],
    [wb06, 120, 'Inoculo']
  ])

  // ── Clienti (inventati) ────────────────────────────────────────────────────
  const cliente = (nome: string, citta: string, tipo: string, note: string | null = null): number =>
    inserisci(
      `INSERT INTO clienti (nome, indirizzo, tipo_cliente, note) VALUES (?, ?, ?, ?)`,
      nome,
      citta,
      tipo,
      note
    )
  const pubOrso = cliente("Pub dell'Orso", 'Via Roma 12', 'pub')
  const enoteca = cliente('Enoteca La Cantina', 'Corso Garibaldi 44', 'enoteca')
  const mulino = cliente('Ristorante Il Vecchio Mulino', 'Via dei Colli 8', 'ristorante')
  const nord = cliente('Birreria Nord', 'Piazza Duomo 3', 'pub')
  cliente('Giovanni Verdi', 'Via Manzoni 7', 'privato', 'Nessun ordine recente')

  // ═══ Filiera agricola ═══════════════════════════════════════════════════════

  // Magazzino input agricoli
  const seme = materia('Orzo da seme Concerto', 'semente', 'kg', null, null)
  const concime = materia('Concime NPK 20-10-10', 'concime', 'q', null, null)
  const fungicida = materia('Fungicida (esempio)', 'fitofarmaco', 'L', null, null)
  salvaDatiFitofarmaco(db, fungicida, {
    numero_registrazione: 'REG-00000',
    principio_attivo: 'Tebuconazolo',
    tempo_carenza_giorni: 30
  })
  const nuovoInput = (
    mp: number,
    codice: string,
    q: number,
    data: string,
    scad: string | null
  ): void => {
    creaLotto(db, {
      materia_prima_id: mp,
      codice,
      data_carico: data,
      data_scadenza: scad,
      quantita: q,
      origine_tipo: 'acquisto',
      origine_id: null,
      stagione: null,
      calibro: null,
      note: null
    })
  }
  nuovoInput(seme, `SEM-${A - 1}-14`, 1600, `${A - 1}-10-20`, `${A}-06-30`)
  nuovoInput(concime, `NPK-${A - 1}-03`, 18, `${A - 1}-10-20`, null)
  nuovoInput(fungicida, `FG-${A}-01`, 10, `${A}-03-01`, `${A + 2}-01-31`)

  // Materie prime della filiera
  const orzoGrezzo = materia('Orzo grezzo', 'orzo_grezzo', 'q', null, null)
  const orzoCalibrato = materia('Orzo calibrato', 'orzo_calibrato', 'q', null, null)
  const luppoloAziendale = materia('Luppolo Cascade aziendale', 'luppolo_grezzo', 'kg', null, null)

  // Campi
  const campoNord = salvaCampo(db, null, {
    nome: 'Campo Nord',
    superficie_ha: 8,
    localita: 'Località Piana',
    rif_catastale: null,
    note: null
  })
  const luppoleto = salvaCampo(db, null, {
    nome: 'Luppoleto',
    superficie_ha: 0.5,
    localita: 'Località Piana',
    rif_catastale: null,
    note: null
  })
  salvaCampo(db, null, {
    nome: 'Campo del Pozzo',
    superficie_ha: 5,
    localita: 'Località Fontana',
    rif_catastale: null,
    note: 'A riposo in questa stagione'
  })

  // Semina dell'orzo e operazioni
  const seminaOrzo = salvaSemina(db, null, {
    campo_id: campoNord,
    stagione: stagionePassata,
    coltura: 'orzo',
    varieta: 'Concerto',
    data: `${A - 1}-11-15`,
    superficie_ha: 8,
    semente_testo: null,
    semente: { materia_prima_id: seme, quantita: 1400, lotto_id: null },
    note: null
  })
  salvaOperazione(db, null, {
    semina_id: seminaOrzo,
    tipo: 'lavorazione',
    data: `${A - 1}-11-10`,
    prodotto: null,
    motivo: 'Erpicatura e preparazione del letto di semina',
    operatore: 'Mario',
    note: null
  })
  salvaOperazione(db, null, {
    semina_id: seminaOrzo,
    tipo: 'concimazione',
    data: `${A}-02-18`,
    prodotto: { materia_prima_id: concime, quantita: 12, lotto_id: null },
    motivo: 'Concimazione di copertura',
    operatore: 'Mario',
    note: null
  })
  salvaOperazione(db, null, {
    semina_id: seminaOrzo,
    tipo: 'trattamento',
    data: `${A}-04-12`,
    prodotto: { materia_prima_id: fungicida, quantita: 2, lotto_id: null },
    motivo: 'Prevenzione ruggine',
    operatore: 'Mario',
    note: null
  })

  // Raccolta dell'orzo
  const raccoltaOrzo = salvaRaccolta(db, null, {
    semina_id: seminaOrzo,
    data: `${A}-06-24`,
    stagione: stagionePassata,
    materia_prima_id: orzoGrezzo,
    quantita: 240,
    codice: `ORZ-01/${A}`,
    data_scadenza: `${A + 1}-06-30`,
    note: null
  })

  // Analisi e calibratura
  const calibratura = salvaCalibratura(db, null, {
    lotto_id: lottoDi('raccolta', raccoltaOrzo),
    data: `${A}-07-14`,
    stagione: stagioneMalteria,
    quantita: 240,
    materia_prima_id: orzoCalibrato,
    frazioni: [
      { nome: '<2,2 mm', percentuale: 5, scarto: true, peso_specifico_gl: null },
      { nome: '2,2-2,5 mm', percentuale: 13, scarto: false, peso_specifico_gl: null },
      { nome: '2,5-2,8 mm', percentuale: 37, scarto: false, peso_specifico_gl: 64 },
      { nome: '>2,8 mm', percentuale: 45, scarto: false, peso_specifico_gl: 67 }
    ],
    note: null
  })
  parametri('calibratura', calibratura, {
    'Analisi orzo · Umidità': '11',
    'Analisi orzo · Proteine': '10.5'
  })

  // Maltazione: 1000 kg di orzo 2,5-2,8 mm → 830 kg di malto Pilsner (nel magazzino della birra)
  const maltazione = avviaMaltazione(db, null, {
    data_inizio: `${A}-08-18`,
    stagione: stagioneMalteria,
    materia_prima_id: pilsner,
    codice: `MP-01/${A}`,
    input: [{ lotto_id: lottoDi('calibratura', calibratura, '2,5-2,8 mm'), kg: 1000 }],
    note: 'Germinazione regolare, radichetta uniforme'
  })
  parametri(
    'maltazione',
    maltazione,
    {
      'Preparazione · Peso acqua': '705',
      'Preparazione · Lavaggio': '10',
      'Macerazione · Bagnatura 1 – durata': '7',
      'Macerazione · Bagnatura 1 – temperatura': '16',
      'Macerazione · Asciugatura 1 – durata': '14',
      'Macerazione · Asciugatura 1 – temperatura': '18',
      'Macerazione · Bagnatura 2 – durata': '5',
      'Macerazione · Bagnatura 2 – temperatura': '16',
      'Macerazione · Asciugatura 2 – durata': '10',
      'Macerazione · Asciugatura 2 – temperatura': '18',
      'Macerazione · Umidità teorica': '43.5',
      'Macerazione · Umidità reale': '43',
      'Macerazione · Punta radichetta': 'si',
      'Germinazione · Peso umido': '1640',
      'Germinazione · Temperatura giorno 1': '17',
      'Germinazione · Temperatura giorno 2': '16',
      'Germinazione · Temperatura giorno 3': '16',
      'Germinazione · Temperatura giorno 4': '15',
      'Germinazione · Temperatura giorno 5': '15',
      'Germinazione · Aspetto visivo': 'regolare',
      'Germinazione · Dolcezza': '7',
      'Essiccazione · Curva umida – Umidità': '42',
      'Essiccazione · Curva umida – Temp. entrata': '50',
      'Essiccazione · Curva umida – Temp. uscita': '27',
      'Essiccazione · Curva umida – Durata': '10',
      'Essiccazione · Calo peso – Umidità': '30',
      'Essiccazione · Calo peso – Temp. entrata': '55',
      'Essiccazione · Calo peso – Temp. uscita': '34',
      'Essiccazione · Calo peso – Durata': '8',
      'Essiccazione · Curva 2 – Umidità': '20',
      'Essiccazione · Curva 2 – Temp. entrata': '60',
      'Essiccazione · Curva 2 – Temp. uscita': '45',
      'Essiccazione · Curva 2 – Durata': '6',
      'Essiccazione · Curva 3 – Umidità': '12',
      'Essiccazione · Curva 3 – Temp. entrata': '65',
      'Essiccazione · Curva 3 – Temp. uscita': '56',
      'Essiccazione · Curva 3 – Durata': '5',
      'Essiccazione · Curva 4 – Umidità': '7',
      'Essiccazione · Curva 4 – Temp. entrata': '72',
      'Essiccazione · Curva 4 – Temp. uscita': '66',
      'Essiccazione · Curva 4 – Durata': '4',
      'Essiccazione · Colpo di fuoco – Umidità': '4',
      'Essiccazione · Colpo di fuoco – Temp. entrata': '82',
      'Essiccazione · Colpo di fuoco – Temp. uscita': '80',
      'Essiccazione · Colpo di fuoco – Durata': '4',
      'Post-essiccazione · Radichetta rimossa': 'si',
      'Post-essiccazione · Ricalibratura': 'no',
      'Post-essiccazione · Peso dopo la pulizia': '830',
      'Post-essiccazione · Umidità finale': '4.2',
      'Post-essiccazione · Friabilità': '8',
      'Post-essiccazione · Aspetto visivo': 'chicco uniforme, colore paglierino',
      'Post-essiccazione · Aspetto gustativo': 'dolce, crosta di pane',
      'Post-essiccazione · Note di degustazione': 'Malto pulito e friabile, adatto a birre chiare',
      'Test di laboratorio · Test iodio 30 min a 60 °C': 'positivo',
      'Test di laboratorio · Test iodio +10 min a 70 °C (step 40)': 'debole',
      'Test di laboratorio · Test iodio +10 min a 70 °C (step 50)': 'negativo',
      'Test di laboratorio · Test iodio +10 min a 70 °C (step 60)': 'negativo',
      'Test di laboratorio · Tempo di conversione': '20',
      'Test di laboratorio · Colore mosto': 'paglierino',
      'Test di laboratorio · EBC': '3.8',
      'Test di laboratorio · Grado Plato': '11.8',
      'Test di laboratorio · Efficienza': '80',
      'Test di laboratorio · Note': 'Malto ben disgregato'
    },
    { 'Post-essiccazione': `${A}-09-01`, 'Test di laboratorio': `${A}-09-03` }
  )
  chiudiMaltazione(db, maltazione, {
    data_uscita: `${A}-09-01`,
    peso_finale_kg: 830,
    data_scadenza: null
  })

  // Maltazione in corso (compare in Dashboard): orzo >2,8 mm, parametri compilati fino a oggi
  const maltazioneInCorso = avviaMaltazione(db, null, {
    data_inizio: giorni(-3),
    stagione: stagioneDaData(giorni(-3)),
    materia_prima_id: pilsner,
    codice: `MP-02/${A}`,
    input: [{ lotto_id: lottoDi('calibratura', calibratura, '>2,8 mm'), kg: 900 }],
    note: null
  })
  parametri('maltazione', maltazioneInCorso, {
    'Preparazione · Peso acqua': '640',
    'Preparazione · Lavaggio': '10',
    'Macerazione · Bagnatura 1 – durata': '7',
    'Macerazione · Bagnatura 1 – temperatura': '16',
    'Macerazione · Asciugatura 1 – durata': '14',
    'Macerazione · Asciugatura 1 – temperatura': '18',
    'Macerazione · Bagnatura 2 – durata': '5',
    'Macerazione · Bagnatura 2 – temperatura': '16',
    'Germinazione · Temperatura giorno 1': '17'
  })

  // Luppolo dal luppoleto aziendale
  const impiantoLuppolo = salvaSemina(db, null, {
    campo_id: luppoleto,
    stagione: stagionePassata,
    coltura: 'luppolo',
    varieta: 'Cascade',
    data: `${A}-03-20`,
    superficie_ha: 0.5,
    semente_testo: 'Rizomi Cascade',
    semente: null,
    note: null
  })
  salvaRaccolta(db, null, {
    semina_id: impiantoLuppolo,
    data: `${A}-09-04`,
    stagione: stagioneMalteria,
    materia_prima_id: luppoloAziendale,
    quantita: 38,
    codice: `LUP-01/${A}`,
    data_scadenza: `${A + 1}-09-30`,
    note: 'Coni essiccati'
  })

  // ═══ Produzione e vendite ═══════════════════════════════════════════════════

  const n = (k: number): string => `${oggi.getFullYear()}-${String(k).padStart(3, '0')}`

  // Tramonto
  const c1 = avviaCotta(n(31), tramonto, rTramonto, giorni(-78))
  confeziona(c1, giorni(-62), 600, [{ materiale: fusto20, quantita: 5 }], 6, [bott1, tap1, fus20])
  // Nebbia
  const c2 = avviaCotta(n(32), nebbia, rNebbia, giorni(-60))
  confeziona(
    c2,
    giorni(-44),
    500,
    [
      { materiale: fusto20, quantita: 4 },
      { materiale: fusto24, quantita: 3 }
    ],
    8,
    [bott1, tap1, fus20, fus24]
  )
  // Aurora con il malto aziendale (dopo l'uscita dalla malteria)
  const c3 = avviaCotta(n(33), aurora, rAurora, giorni(-28))
  confeziona(c3, giorni(-12), 540, [{ materiale: fusto20, quantita: 4 }], 5, [bott2, tap2, fus20])
  // Aurora in fermentazione
  avviaCotta(n(34), aurora, rAurora, giorni(-4))

  // Vendite
  vendita(pubOrso, giorni(-58), [{ bottiglie: 48, cotta: c1 }])
  vendita(enoteca, giorni(-50), [{ bottiglie: 72, cotta: c1 }])
  vendita(nord, giorni(-45), [{ fusti: 2, cotta: c1, materiale: fusto20, aRendere: 2 }])
  vendita(pubOrso, giorni(-38), [
    { bottiglie: 60, cotta: c2 },
    { fusti: 1, cotta: c2, materiale: fusto24, aRendere: 1 }
  ])
  vendita(mulino, giorni(-35), [{ bottiglie: 36, cotta: c1 }])
  vendita(null, giorni(-30), [{ bottiglie: 12, cotta: c1 }], {
    omaggio: true,
    occasione: 'Festa del paese'
  })
  vendita(enoteca, giorni(-25), [{ bottiglie: 48, cotta: c2 }])
  vendita(pubOrso, giorni(-20), [
    { bottiglie: 24, cotta: c1 },
    { fusti: 1, cotta: c1, materiale: fusto20, aRendere: 1 }
  ])
  vendita(nord, giorni(-15), [{ fusti: 1, cotta: c2, materiale: fusto20, aRendere: 1 }])
  vendita(mulino, giorni(-10), [{ bottiglie: 36, cotta: c3 }])
  vendita(pubOrso, giorni(-8), [
    { bottiglie: 24, cotta: c3 },
    { fusti: 2, cotta: c3, materiale: fusto20, aRendere: 2 }
  ])
  vendita(enoteca, giorni(-3), [{ bottiglie: 60, cotta: c3 }])
  vendita(nord, giorni(-1), [{ bottiglie: 24, cotta: c3 }])

  rientroFusti(nord, fusto20, 2, giorni(-30))
  rientroFusti(pubOrso, fusto24, 1, giorni(-20))

  return { c3 }
})

const { c3 } = genera()

// ── Controlli ────────────────────────────────────────────────────────────────

const negativi = db
  .prepare(
    `SELECT (SELECT COUNT(*) FROM lotti_materie_prime WHERE quantita_residua < 0)
          + (SELECT COUNT(*) FROM giacenza_confezionamento WHERE quantita < 0)
          + (SELECT COUNT(*) FROM giacenza_prodotto_finito_cartoni WHERE bottiglie_sfuse < 0)
          + (SELECT COUNT(*) FROM giacenza_prodotto_finito_fusti WHERE quantita_disponibile < 0) AS n`
  )
  .get() as { n: number }
if (negativi.n > 0) throw new Error('Giacenze negative nei dati di esempio')

function tipi(nodi: NodoTraccia[]): Set<string> {
  const t = new Set<string>()
  for (const x of nodi) {
    t.add(x.tipo)
    for (const f of tipi(x.figli)) t.add(f)
  }
  return t
}
const catena = tipi(traccia(db, { tipo: 'cotta', id: c3 }, 'indietro'))
for (const atteso of [
  'lotto',
  'maltazione',
  'calibratura',
  'raccolta',
  'semina',
  'campo',
  'operazione'
])
  if (!catena.has(atteso)) throw new Error(`Tracciabilità incompleta: manca ${atteso}`)

const conteggi = db
  .prepare(
    `SELECT (SELECT COUNT(*) FROM cotte) AS cotte, (SELECT COUNT(*) FROM vendite) AS vendite,
            (SELECT COUNT(*) FROM clienti) AS clienti, (SELECT COUNT(*) FROM lotti_materie_prime) AS lotti,
            (SELECT COUNT(*) FROM agri_campi) AS campi, (SELECT COUNT(*) FROM agri_lavorazioni) AS lavorazioni`
  )
  .get()
db.pragma('journal_mode = DELETE')
db.exec('VACUUM')
db.close()

console.log('Database demo creato:', destinazione)
console.log('Contenuto:', conteggi)
console.log('Tracciabilità della cotta Aurora:', [...catena].join(', '))
