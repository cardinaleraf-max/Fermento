/**
 * Modulo "Avvisi intelligenti" (agente one-shot).
 *
 * Funziona cosi':
 *  1. Raccoglie dal DB i segnali grezzi (avvisi attivi + contesto
 *     arricchito su MP, prodotto finito, confezionamento, vendite).
 *  2. Se il provider e' remoto (Groq), ANONIMIZZA i nomi sensibili
 *     (materie prime, birre, confezionamento, clienti) sostituendoli con
 *     pseudonimi tipo "MP#12", "BIRRA#3". Il modello non vede mai i nomi
 *     reali ne' le ricette.
 *  3. Chiama il modello una sola volta in modalita' JSON mode chiedendo
 *     raccomandazioni raggruppate, prioritizzate e con azioni concrete.
 *  4. Post-processa l'output: valida lo schema, sostituisce gli
 *     pseudonimi con i nomi reali (solo lato main, prima di passarli al
 *     renderer), associa ogni raccomandazione agli id avvisi originali.
 *
 * Tutto questo modulo gira nel main process: il renderer riceve solo
 * l'output gia' denormalizzato.
 */

import type BetterSqlite3 from 'better-sqlite3'
import type { OllamaMessage } from './ollama'
import type { ChatClient } from './provider'

// ---------------------------------------------------------------------------
// Tipi pubblici (verso renderer, via IPC)
// ---------------------------------------------------------------------------

export type PrioritaRacc = 'critica' | 'alta' | 'media' | 'bassa'
export type TipoAzione =
  | 'riordina'
  | 'produci'
  | 'promo'
  | 'sconta'
  | 'vendi'
  | 'revisiona'
  | 'altro'
export type TipoEntita = 'mp' | 'birra' | 'conf' | 'cliente'

export type AzioneSuggerita = {
  tipo: TipoAzione
  testo: string
}

export type RiferimentoEntita = {
  tipo: TipoEntita
  id: number
  nome: string
}

export type Raccomandazione = {
  priorita: PrioritaRacc
  titolo: string
  descrizione: string
  azioni: AzioneSuggerita[]
  riferimenti: RiferimentoEntita[]
  segnali_ids: number[]
}

export type AvvisiIntelligentiResult =
  | {
      ok: true
      generato_il: string
      modello: string
      remoto: boolean
      raccomandazioni: Raccomandazione[]
      segnali_analizzati: number
    }
  | { ok: false; errore: string }

// ---------------------------------------------------------------------------
// Anonimizzazione: mappa id -> alias/nomeReale
// ---------------------------------------------------------------------------

type MappaEntita = Map<
  number,
  { alias: string; nomeReale: string; tipo: TipoEntita }
>

type Registro = {
  mp: MappaEntita
  birra: MappaEntita
  conf: MappaEntita
  cliente: MappaEntita
  remoto: boolean
}

function creaRegistro(remoto: boolean): Registro {
  return {
    mp: new Map(),
    birra: new Map(),
    conf: new Map(),
    cliente: new Map(),
    remoto
  }
}

function registra(
  reg: Registro,
  tipo: TipoEntita,
  id: number,
  nomeReale: string
): string {
  const m = reg[tipo]
  const cached = m.get(id)
  if (cached) return cached.alias
  const prefix = { mp: 'MP', birra: 'BIRRA', conf: 'CONF', cliente: 'CLIENTE' }[tipo]
  const alias = `${prefix}#${id}`
  m.set(id, { alias, nomeReale, tipo })
  return alias
}

/** Etichetta da mostrare al modello: alias se remoto, nome reale se locale. */
function etichetta(reg: Registro, tipo: TipoEntita, id: number, nomeReale: string): string {
  const alias = registra(reg, tipo, id, nomeReale)
  return reg.remoto ? alias : nomeReale
}

// ---------------------------------------------------------------------------
// Raccolta dati dal DB
// ---------------------------------------------------------------------------

type AvvisoRiga = {
  id: number
  tipo: string
  riferimento_tabella: string | null
  riferimento_id: number | null
  messaggio: string
  priorita: string
}

type SegnaliContesto = {
  dataOggi: string
  finestraGiorniScadenza: number
  materie_prime: MpContesto[]
  prodotti_finiti: BirraContesto[]
  materiali_conf: ConfContesto[]
  clienti_inattivi_count: number
  clienti_inattivi_nomi: string[] // solo in locale
  avvisi: SegnaleAvviso[]
}

type SegnaleAvviso = {
  id: number
  tipo: string
  priorita: string
  ref: string | null
  riepilogo: string
}

type MpContesto = {
  ref: string
  categoria: string
  unita_misura: string
  giacenza: number
  soglia: number | null
  consumo_stimato_gg: number | null
  lotti_scadenza: Array<{ giorni_a_scadenza: number; qta_residua: number }>
}

type BirraContesto = {
  ref: string
  bottiglie_disponibili: number
  fusti_disponibili: number
  vendite_bottiglie_90g: number
  vendite_fusti_90g: number
  cotte_in_corso: number
  cotte_producibili: number
  lotti_scadenza: Array<{ giorni_a_scadenza: number; bottiglie: number; fusti: number }>
}

type ConfContesto = {
  ref: string
  categoria: string
  giacenza: number
  soglia: number | null
}

function getConfigGiorni(
  db: BetterSqlite3.Database,
  chiave: string,
  def: number
): number {
  try {
    const row = db
      .prepare(`SELECT valore FROM configurazioni WHERE chiave = ?`)
      .get(chiave) as { valore: string } | undefined
    const n = row ? parseInt(row.valore, 10) : NaN
    return Number.isFinite(n) && n > 0 ? n : def
  } catch {
    return def
  }
}

function raccogliSegnali(db: BetterSqlite3.Database, reg: Registro): SegnaliContesto {
  const dataOggi = new Date().toISOString().slice(0, 10)
  const finestraGiorni = getConfigGiorni(db, 'anticipo_avviso_scadenza_giorni', 60)
  const finestraCliente = getConfigGiorni(db, 'cliente_inattivo_giorni', 20)

  const avvisiGrezzi = db
    .prepare(
      `SELECT id, tipo, riferimento_tabella, riferimento_id, messaggio, priorita
       FROM avvisi
       WHERE risolto = 0
       ORDER BY CASE priorita WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END, id DESC`
    )
    .all() as AvvisoRiga[]

  // --- Raccolta set di entita' coinvolte --------------------------------
  const mpIds = new Set<number>()
  const birraIds = new Set<number>()
  const confIds = new Set<number>()

  for (const a of avvisiGrezzi) {
    if (!a.riferimento_id) continue
    switch (a.riferimento_tabella) {
      case 'materie_prime':
        mpIds.add(a.riferimento_id)
        break
      case 'lotti_materie_prime': {
        const row = db
          .prepare(`SELECT materia_prima_id FROM lotti_materie_prime WHERE id = ?`)
          .get(a.riferimento_id) as { materia_prima_id: number } | undefined
        if (row) mpIds.add(row.materia_prima_id)
        break
      }
      case 'materiali_confezionamento':
        confIds.add(a.riferimento_id)
        break
      case 'cotte': {
        const row = db
          .prepare(`SELECT birra_id FROM cotte WHERE id = ?`)
          .get(a.riferimento_id) as { birra_id: number } | undefined
        if (row) birraIds.add(row.birra_id)
        break
      }
      case 'birre':
        birraIds.add(a.riferimento_id)
        break
    }
  }

  // --- Materie prime ---------------------------------------------------
  const materie_prime: MpContesto[] = []
  for (const id of mpIds) {
    const mp = db
      .prepare(
        `SELECT mp.id, mp.nome, mp.categoria, mp.unita_misura, mp.soglia_riordino_fissa,
                COALESCE((SELECT SUM(quantita_residua) FROM lotti_materie_prime
                          WHERE materia_prima_id = mp.id AND quantita_residua > 0), 0) AS giacenza
         FROM materie_prime mp WHERE mp.id = ?`
      )
      .get(id) as
      | {
          id: number
          nome: string
          categoria: string
          unita_misura: string
          soglia_riordino_fissa: number | null
          giacenza: number
        }
      | undefined
    if (!mp) continue

    const consumo = db
      .prepare(
        `SELECT COALESCE(SUM(cmp.quantita_usata), 0) AS totale
         FROM cotta_materie_prime cmp
         JOIN cotte c ON c.id = cmp.cotta_id
         WHERE cmp.materia_prima_id = ?
           AND c.data_inizio >= date('now', '-90 days')`
      )
      .get(id) as { totale: number } | undefined
    const consumoStimato = consumo && consumo.totale > 0 ? consumo.totale / 90 : null

    const lotti = db
      .prepare(
        `SELECT CAST(julianday(data_scadenza) - julianday('now') AS INTEGER) AS giorni,
                quantita_residua
         FROM lotti_materie_prime
         WHERE materia_prima_id = ?
           AND quantita_residua > 0
           AND data_scadenza IS NOT NULL
           AND data_scadenza <= date('now', ?)
         ORDER BY data_scadenza ASC`
      )
      .all(id, `+${finestraGiorni} days`) as Array<{ giorni: number; quantita_residua: number }>

    materie_prime.push({
      ref: etichetta(reg, 'mp', mp.id, mp.nome),
      categoria: mp.categoria,
      unita_misura: mp.unita_misura,
      giacenza: Number(mp.giacenza.toFixed(2)),
      soglia: mp.soglia_riordino_fissa,
      consumo_stimato_gg:
        consumoStimato === null ? null : Number(consumoStimato.toFixed(3)),
      lotti_scadenza: lotti.map((l) => ({
        giorni_a_scadenza: l.giorni,
        qta_residua: Number(l.quantita_residua.toFixed(2))
      }))
    })
  }

  // --- Birre / Prodotto finito ----------------------------------------
  const prodotti_finiti: BirraContesto[] = []
  for (const id of birraIds) {
    const br = db.prepare(`SELECT id, nome FROM birre WHERE id = ?`).get(id) as
      | { id: number; nome: string }
      | undefined
    if (!br) continue

    const giac = db
      .prepare(
        `SELECT
            COALESCE((SELECT SUM(bottiglie_sfuse) FROM giacenza_prodotto_finito_cartoni gpc
                      JOIN cotte c ON c.id = gpc.cotta_id WHERE c.birra_id = ?), 0) AS bott,
            COALESCE((SELECT SUM(quantita_disponibile) FROM giacenza_prodotto_finito_fusti gpf
                      JOIN cotte c ON c.id = gpf.cotta_id WHERE c.birra_id = ?), 0) AS fusti`
      )
      .get(id, id) as { bott: number; fusti: number }

    const vend = db
      .prepare(
        `SELECT
            COALESCE(SUM(CASE WHEN vd.tipo_prodotto='bottiglia' THEN vd.quantita ELSE 0 END), 0) AS bott,
            COALESCE(SUM(CASE WHEN vd.tipo_prodotto='fusto' THEN vd.quantita ELSE 0 END), 0) AS fusti
         FROM vendita_dettaglio vd
         JOIN vendite v ON v.id = vd.vendita_id
         JOIN cotte c ON c.id = vd.cotta_id
         WHERE c.birra_id = ? AND v.data >= date('now', '-90 days')`
      )
      .get(id) as { bott: number; fusti: number }

    const cotteInCorso = db
      .prepare(
        `SELECT COUNT(*) AS n FROM cotte WHERE birra_id = ? AND stato = 'in_corso'`
      )
      .get(id) as { n: number }

    // cotte_producibili: min(quantita_mp_disponibile / quantita_mp_per_ricetta) su tutti gli ingredienti
    const ing = db
      .prepare(
        `SELECT ri.quantita AS q, ri.materia_prima_id AS mp,
                COALESCE((SELECT SUM(quantita_residua) FROM lotti_materie_prime
                          WHERE materia_prima_id = ri.materia_prima_id AND quantita_residua > 0), 0) AS g
         FROM ricette r
         JOIN ricetta_ingredienti ri ON ri.ricetta_id = r.id
         WHERE r.birra_id = ? AND r.attiva = 1`
      )
      .all(id) as Array<{ q: number; mp: number; g: number }>
    let cotteProd = ing.length === 0 ? 0 : Number.POSITIVE_INFINITY
    for (const row of ing) cotteProd = Math.min(cotteProd, row.q > 0 ? row.g / row.q : 0)
    if (!Number.isFinite(cotteProd)) cotteProd = 0
    cotteProd = Math.floor(cotteProd)

    const lottiScad = db
      .prepare(
        `SELECT CAST(julianday(conf.data_scadenza) - julianday('now') AS INTEGER) AS giorni,
                COALESCE(gpc.bottiglie_sfuse, 0) AS bott,
                COALESCE((SELECT SUM(quantita_disponibile) FROM giacenza_prodotto_finito_fusti
                          WHERE cotta_id = c.id), 0) AS fusti
         FROM cotte c
         JOIN confezionamento conf ON conf.cotta_id = c.id
         LEFT JOIN giacenza_prodotto_finito_cartoni gpc ON gpc.cotta_id = c.id
         WHERE c.birra_id = ?
           AND c.stato = 'confezionata'
           AND conf.data_scadenza IS NOT NULL
           AND conf.data_scadenza <= date('now', ?)
           AND (COALESCE(gpc.bottiglie_sfuse, 0) > 0
                OR EXISTS (SELECT 1 FROM giacenza_prodotto_finito_fusti g2 WHERE g2.cotta_id = c.id AND g2.quantita_disponibile > 0))
         ORDER BY conf.data_scadenza ASC`
      )
      .all(id, `+${finestraGiorni} days`) as Array<{
      giorni: number
      bott: number
      fusti: number
    }>

    prodotti_finiti.push({
      ref: etichetta(reg, 'birra', br.id, br.nome),
      bottiglie_disponibili: Number(giac.bott),
      fusti_disponibili: Number(giac.fusti),
      vendite_bottiglie_90g: Number(vend.bott),
      vendite_fusti_90g: Number(vend.fusti),
      cotte_in_corso: cotteInCorso.n,
      cotte_producibili: cotteProd,
      lotti_scadenza: lottiScad.map((l) => ({
        giorni_a_scadenza: l.giorni,
        bottiglie: l.bott,
        fusti: l.fusti
      }))
    })
  }

  // --- Materiali confezionamento --------------------------------------
  const materiali_conf: ConfContesto[] = []
  for (const id of confIds) {
    const r = db
      .prepare(
        `SELECT mc.id, mc.nome, mc.categoria, mc.soglia_riordino,
                COALESCE(gc.quantita, 0) AS giacenza
         FROM materiali_confezionamento mc
         LEFT JOIN giacenza_confezionamento gc ON gc.materiale_id = mc.id
         WHERE mc.id = ?`
      )
      .get(id) as
      | {
          id: number
          nome: string
          categoria: string
          soglia_riordino: number | null
          giacenza: number
        }
      | undefined
    if (!r) continue
    materiali_conf.push({
      ref: etichetta(reg, 'conf', r.id, r.nome),
      categoria: r.categoria,
      giacenza: Number(r.giacenza),
      soglia: r.soglia_riordino
    })
  }

  // --- Clienti inattivi ------------------------------------------------
  let clienti_inattivi_count = 0
  const clienti_inattivi_nomi: string[] = []
  try {
    const inattivi = db
      .prepare(
        `SELECT cl.id, cl.nome
         FROM clienti cl
         WHERE cl.attivo = 1
           AND (
             (SELECT MAX(v.data) FROM vendite v WHERE v.cliente_id = cl.id) < date('now', ?)
             OR (SELECT MAX(v.data) FROM vendite v WHERE v.cliente_id = cl.id) IS NULL
           )`
      )
      .all(`-${finestraCliente} days`) as Array<{ id: number; nome: string }>
    clienti_inattivi_count = inattivi.length
    if (!reg.remoto) {
      for (const c of inattivi) {
        registra(reg, 'cliente', c.id, c.nome)
        clienti_inattivi_nomi.push(c.nome)
      }
    }
  } catch {
    // ignore
  }

  // --- Lista sintetica degli avvisi come "segnali" --------------------
  const avvisi: SegnaleAvviso[] = []
  for (const a of avvisiGrezzi) {
    let ref: string | null = null
    switch (a.riferimento_tabella) {
      case 'materie_prime':
        if (a.riferimento_id) {
          const r = db
            .prepare(`SELECT nome FROM materie_prime WHERE id = ?`)
            .get(a.riferimento_id) as { nome: string } | undefined
          if (r) ref = etichetta(reg, 'mp', a.riferimento_id, r.nome)
        }
        break
      case 'lotti_materie_prime':
        if (a.riferimento_id) {
          const r = db
            .prepare(
              `SELECT l.materia_prima_id AS id, m.nome FROM lotti_materie_prime l
               JOIN materie_prime m ON m.id = l.materia_prima_id WHERE l.id = ?`
            )
            .get(a.riferimento_id) as { id: number; nome: string } | undefined
          if (r) ref = etichetta(reg, 'mp', r.id, r.nome)
        }
        break
      case 'materiali_confezionamento':
        if (a.riferimento_id) {
          const r = db
            .prepare(`SELECT nome FROM materiali_confezionamento WHERE id = ?`)
            .get(a.riferimento_id) as { nome: string } | undefined
          if (r) ref = etichetta(reg, 'conf', a.riferimento_id, r.nome)
        }
        break
      case 'cotte':
        if (a.riferimento_id) {
          const r = db
            .prepare(
              `SELECT b.id, b.nome FROM cotte c JOIN birre b ON b.id = c.birra_id WHERE c.id = ?`
            )
            .get(a.riferimento_id) as { id: number; nome: string } | undefined
          if (r) ref = etichetta(reg, 'birra', r.id, r.nome)
        }
        break
      case 'birre':
        if (a.riferimento_id) {
          const r = db
            .prepare(`SELECT nome FROM birre WHERE id = ?`)
            .get(a.riferimento_id) as { nome: string } | undefined
          if (r) ref = etichetta(reg, 'birra', a.riferimento_id, r.nome)
        }
        break
      case 'clienti':
        if (a.riferimento_id) {
          const r = db
            .prepare(`SELECT nome FROM clienti WHERE id = ?`)
            .get(a.riferimento_id) as { nome: string } | undefined
          if (r) ref = etichetta(reg, 'cliente', a.riferimento_id, r.nome)
        }
        break
    }
    // In cloud il messaggio grezzo degli avvisi contiene nomi reali:
    // lo sostituiamo con una versione ridotta senza nomi.
    const riepilogo = reg.remoto ? descrizioneTipoAvviso(a.tipo) : a.messaggio
    avvisi.push({
      id: a.id,
      tipo: a.tipo,
      priorita: a.priorita,
      ref,
      riepilogo
    })
  }

  return {
    dataOggi,
    finestraGiorniScadenza: finestraGiorni,
    materie_prime,
    prodotti_finiti,
    materiali_conf,
    clienti_inattivi_count,
    clienti_inattivi_nomi,
    avvisi
  }
}

function descrizioneTipoAvviso(tipo: string): string {
  switch (tipo) {
    case 'scorta_bassa':
      return 'Giacenza sotto soglia'
    case 'scadenza_vicina':
      return 'Lotto materia prima in scadenza'
    case 'scadenza_prodotto_finito':
      return 'Prodotto finito in scadenza'
    case 'cliente_inattivo':
      return 'Cliente inattivo'
    case 'cotta_non_producibile':
      return 'Birra non producibile con giacenze attuali'
    default:
      return tipo
  }
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `Sei "Bira", agente analitico di un gestionale per birrifici artigianali.
Ricevi un JSON con lo stato operativo (scorte, scadenze, vendite recenti, segnali).
Il tuo compito e' produrre raccomandazioni CONCRETE, prioritizzate e raggruppate.

REGOLE FONDAMENTALI:
- Usa SOLO i dati forniti. Non inventare numeri, nomi o scadenze.
- Per riferirti a entita' (materie prime, birre, confezionamento, clienti) usa
  ESATTAMENTE i "ref" del JSON (es. "MP#12", "BIRRA#3"). Non inventare altri nomi.
- Raggruppa segnali correlati in UNA raccomandazione (es. una birra con MP in
  scadenza + giacenza bassa + vendite alte -> una sola "produci entro X giorni").
- Priorita':
  - "critica": rischio perdita prodotto o blocco produzione entro pochi giorni.
  - "alta": azione entro 1-2 settimane.
  - "media": da pianificare nel mese.
  - "bassa": monitorare.
- Le azioni devono essere CONCRETE: riordinare, produrre, promo, sconto, ecc.
- Gli importi monetari non esistono: non parlare di euro, ricavi o sconti in %
  se non sono nei dati.
- Rispondi SOLO con JSON valido conforme allo schema fornito. Niente prosa fuori dal JSON.

SCHEMA DI OUTPUT (JSON):
{
  "raccomandazioni": [
    {
      "priorita": "critica" | "alta" | "media" | "bassa",
      "titolo": "breve (max 80 caratteri), puo' contenere ref",
      "descrizione": "spiegazione estesa, motivata dai dati, puo' contenere ref",
      "refs": ["MP#12", "BIRRA#3"],
      "segnali_ids": [42, 43],
      "azioni": [
        { "tipo": "riordina" | "produci" | "promo" | "sconta" | "vendi" | "revisiona" | "altro",
          "testo": "azione concreta, max 140 caratteri" }
      ]
    }
  ]
}`

function buildUserMessage(ctx: SegnaliContesto): string {
  return (
    `DATA DI OGGI: ${ctx.dataOggi}\n` +
    `FINESTRA SCADENZE ANALIZZATA: ${ctx.finestraGiorniScadenza} giorni\n\n` +
    `Analizza i seguenti dati e genera le raccomandazioni.\n\n` +
    '```json\n' +
    JSON.stringify(
      {
        materie_prime: ctx.materie_prime,
        prodotti_finiti: ctx.prodotti_finiti,
        materiali_conf: ctx.materiali_conf,
        clienti_inattivi_count: ctx.clienti_inattivi_count,
        clienti_inattivi_nomi: ctx.clienti_inattivi_nomi,
        avvisi_attivi: ctx.avvisi
      },
      null,
      2
    ) +
    '\n```\n\n' +
    'Rispondi SOLO con JSON valido secondo lo schema indicato.'
  )
}

// ---------------------------------------------------------------------------
// Post-processing (parse + denormalizzazione)
// ---------------------------------------------------------------------------

const PRIORITA_VALIDE: PrioritaRacc[] = ['critica', 'alta', 'media', 'bassa']
const AZIONI_VALIDE: TipoAzione[] = [
  'riordina',
  'produci',
  'promo',
  'sconta',
  'vendi',
  'revisiona',
  'altro'
]

const REF_REGEX = /(MP|BIRRA|CONF|CLIENTE)#(\d+)/g

function trovaEntita(reg: Registro, alias: string): RiferimentoEntita | null {
  const m = alias.match(/^(MP|BIRRA|CONF|CLIENTE)#(\d+)$/)
  if (!m) return null
  const tipo: TipoEntita = m[1] === 'MP'
    ? 'mp'
    : m[1] === 'BIRRA'
      ? 'birra'
      : m[1] === 'CONF'
        ? 'conf'
        : 'cliente'
  const id = parseInt(m[2], 10)
  const cached = reg[tipo].get(id)
  if (!cached) return null
  return { tipo, id, nome: cached.nomeReale }
}

function sostituisciRefsNelTesto(reg: Registro, testo: string): string {
  if (!testo) return ''
  return testo.replace(REF_REGEX, (match) => {
    const ent = trovaEntita(reg, match)
    return ent ? ent.nome : match
  })
}

function normalizzaRaccomandazioni(
  reg: Registro,
  segnaliValidi: Set<number>,
  raw: unknown
): Raccomandazione[] {
  if (!raw || typeof raw !== 'object') return []
  const arr = (raw as { raccomandazioni?: unknown }).raccomandazioni
  if (!Array.isArray(arr)) return []

  const out: Raccomandazione[] = []
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue
    const r = item as Record<string, unknown>

    const priorita = PRIORITA_VALIDE.includes(r.priorita as PrioritaRacc)
      ? (r.priorita as PrioritaRacc)
      : 'media'
    const titoloRaw = typeof r.titolo === 'string' ? r.titolo : ''
    const descrizioneRaw = typeof r.descrizione === 'string' ? r.descrizione : ''

    const azioni: AzioneSuggerita[] = Array.isArray(r.azioni)
      ? r.azioni
          .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object')
          .map((a) => {
            const tipo = AZIONI_VALIDE.includes(a.tipo as TipoAzione)
              ? (a.tipo as TipoAzione)
              : 'altro'
            const testo = typeof a.testo === 'string' ? a.testo.slice(0, 200) : ''
            return { tipo, testo: sostituisciRefsNelTesto(reg, testo) }
          })
          .filter((a) => a.testo)
      : []

    // refs: dedup su (tipo,id), con nome reale
    const refsVisti = new Set<string>()
    const riferimenti: RiferimentoEntita[] = []
    const addRef = (ent: RiferimentoEntita | null): void => {
      if (!ent) return
      const key = `${ent.tipo}:${ent.id}`
      if (refsVisti.has(key)) return
      refsVisti.add(key)
      riferimenti.push(ent)
    }
    if (Array.isArray(r.refs)) {
      for (const rf of r.refs) {
        if (typeof rf === 'string') addRef(trovaEntita(reg, rf))
      }
    }
    // Scan del testo per non perdere ref non dichiarati
    for (const txt of [titoloRaw, descrizioneRaw, ...azioni.map((a) => a.testo)]) {
      const m = txt.matchAll(REF_REGEX)
      for (const mm of m) addRef(trovaEntita(reg, mm[0]))
    }

    const segnali_ids: number[] = Array.isArray(r.segnali_ids)
      ? (r.segnali_ids as unknown[]).filter(
          (n): n is number => typeof n === 'number' && segnaliValidi.has(n)
        )
      : []

    const titolo = sostituisciRefsNelTesto(reg, titoloRaw).slice(0, 180).trim()
    const descrizione = sostituisciRefsNelTesto(reg, descrizioneRaw).trim()

    if (!titolo && !descrizione && azioni.length === 0) continue
    out.push({
      priorita,
      titolo: titolo || descrizione.slice(0, 80),
      descrizione,
      azioni,
      riferimenti,
      segnali_ids
    })
  }

  out.sort((a, b) => PRIORITA_VALIDE.indexOf(a.priorita) - PRIORITA_VALIDE.indexOf(b.priorita))
  return out
}

function estraiJson(testo: string): unknown {
  const s = testo.trim()
  if (!s) return null
  // Prova parse diretto
  try {
    return JSON.parse(s)
  } catch {
    // Intento piu' robusto: trova prima { e ultima }
    const i = s.indexOf('{')
    const j = s.lastIndexOf('}')
    if (i >= 0 && j > i) {
      try {
        return JSON.parse(s.slice(i, j + 1))
      } catch {
        return null
      }
    }
    return null
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function generaAvvisiIntelligenti(
  db: BetterSqlite3.Database,
  client: ChatClient,
  modello: string,
  opts: { temperatura?: number; timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<AvvisiIntelligentiResult> {
  const reg = creaRegistro(client.remoto)
  const ctx = raccogliSegnali(db, reg)

  if (ctx.avvisi.length === 0) {
    return {
      ok: true,
      generato_il: new Date().toISOString(),
      modello,
      remoto: client.remoto,
      raccomandazioni: [],
      segnali_analizzati: 0
    }
  }

  const messaggi: OllamaMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserMessage(ctx) }
  ]

  let risposta
  try {
    risposta = await client.chat(
      {
        model: modello,
        messages: messaggi,
        format: 'json',
        options: { temperature: opts.temperatura ?? 0.2 }
      },
      opts.signal
    )
  } catch (e) {
    return { ok: false, errore: e instanceof Error ? e.message : String(e) }
  }

  const contenuto = risposta.message?.content ?? ''
  const parsed = estraiJson(contenuto)
  if (!parsed) {
    return {
      ok: false,
      errore: 'Il modello non ha restituito JSON valido. Riprova.'
    }
  }

  const idsValidi = new Set(ctx.avvisi.map((a) => a.id))
  const raccomandazioni = normalizzaRaccomandazioni(reg, idsValidi, parsed)

  return {
    ok: true,
    generato_il: new Date().toISOString(),
    modello,
    remoto: client.remoto,
    raccomandazioni,
    segnali_analizzati: ctx.avvisi.length
  }
}
