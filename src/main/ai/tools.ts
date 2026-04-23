/**
 * Registry dei tool che l'agente AI puo' chiamare.
 *
 * Filosofia: niente SQL libero generato dal modello. Esponiamo solo
 * funzioni di alto livello, con parametri tipizzati e validati. Ogni tool
 * ha:
 *  - schema JSON Schema-like (per il modello, formato Ollama/OpenAI)
 *  - executor che riceve gli argomenti e restituisce un oggetto JSON
 *  - flag `cloud_safe` che dichiara se puo' essere esposto a un provider
 *    remoto (Groq, Ollama Cloud, ...) senza far uscire dati sensibili.
 *
 * I tool sono in sola lettura: non modificano il database.
 *
 * REGOLA DI SICUREZZA (LEGGERE PRIMA DI AGGIUNGERE TOOL):
 *  - Nessun tool deve MAI restituire campi delle tabelle `ricette` o
 *    `ricetta_ingredienti` (formulazione delle birre = segreto
 *    industriale). I tool che usano quelle tabelle possono calcolare
 *    aggregati, ma il risultato non deve esporre quantita' di ingredienti.
 *  - Se un tool restituisce nomi/contatti di clienti, email, telefoni,
 *    indirizzi o partite IVA deve avere cloud_safe=false.
 *  - Se un tool restituisce nomi di materie prime deve avere
 *    cloud_safe=false (per non far trapelare la tavolozza di ingredienti
 *    usati dal birrificio, segnale utile a un competitor).
 *  - In caso di dubbio: cloud_safe=false, si puo' sempre allargare dopo.
 */
import type BetterSqlite3 from 'better-sqlite3'
import type { OllamaToolDef } from './ollama'
import { cercaDocs, isSezioneValida, SEZIONI_VALIDE } from './docs'

/**
 * Contesto che l'agente passa ai tool per side-effect sicuri verso il
 * renderer (es. proposta di navigazione a una schermata). I tool
 * lo usano solo se e' presente.
 */
export type ToolContext = {
  /**
   * Invocata dal tool `naviga_a_schermata`: chiede al renderer di
   * navigare a una sezione. Non e' garantito che l'utente accetti.
   */
  richiediNavigazione?: (sezione: string, motivo?: string) => void
}

type ToolHandler = (
  db: BetterSqlite3.Database,
  args: Record<string, unknown>,
  ctx: ToolContext
) => unknown

export type ToolDefinition = {
  name: string
  description: string
  parameters: OllamaToolDef['function']['parameters']
  handler: ToolHandler
  /**
   * true  = il tool puo' essere esposto anche a provider cloud (dati non PII,
   *         ne' ricette, ne' nomi di materie prime).
   * false = il tool e' disponibile solo in locale (Ollama su localhost o rete
   *         privata). I provider remoti non lo vedono nemmeno.
   */
  cloud_safe: boolean
}

// ---------- helpers di parsing ----------

function asInt(v: unknown, fallback: number, min?: number, max?: number): number {
  const n =
    typeof v === 'number'
      ? v
      : typeof v === 'string' && v.trim() !== ''
        ? Number(v)
        : NaN
  if (!Number.isFinite(n)) return fallback
  let out = Math.trunc(n)
  if (min !== undefined && out < min) out = min
  if (max !== undefined && out > max) out = max
  return out
}

function asString(v: unknown): string {
  if (typeof v === 'string') return v
  if (v == null) return ''
  return String(v)
}

function asDateOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null
  // Validazione minimale formato YYYY-MM-DD
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
}

/**
 * Groq a volte emette numeri come stringhe ("90") nei tool calls.
 * Accettiamo sia integer sia stringhe numeriche per evitare 400 lato provider.
 */
function integerLikeParam(description: string): Record<string, unknown> {
  return {
    anyOf: [
      { type: 'integer' },
      { type: 'string', pattern: '^-?\\d+$' }
    ],
    description
  }
}

function getConfigInt(db: BetterSqlite3.Database, chiave: string, fallback: number): number {
  try {
    const row = db
      .prepare(`SELECT valore FROM configurazioni WHERE chiave = ?`)
      .get(chiave) as { valore: string } | undefined
    if (!row?.valore) return fallback
    const n = parseInt(row.valore, 10)
    return Number.isFinite(n) ? n : fallback
  } catch {
    return fallback
  }
}

// ---------- tool implementations ----------

const tools: ToolDefinition[] = [
  {
    name: 'riassunto_dashboard',
    cloud_safe: true,
    description:
      'Restituisce uno snapshot generale del birrificio: avvisi attivi, cotte in corso, lotti in scadenza, top birra venduta nella finestra di analisi.',
    parameters: { type: 'object', properties: {} },
    handler: (db) => {
      const avvisi = db
        .prepare(`SELECT COUNT(*) as c FROM avvisi WHERE risolto = 0`)
        .get() as { c: number }
      const cotteInCorso = db
        .prepare(`SELECT COUNT(*) as c FROM cotte WHERE stato = 'in_corso'`)
        .get() as { c: number }
      const giorniScadenza = getConfigInt(db, 'anticipo_avviso_scadenza_giorni', 60)
      const lottiInScad = db
        .prepare(
          `SELECT COUNT(*) as c FROM lotti_materie_prime
           WHERE quantita_residua > 0
             AND data_scadenza IS NOT NULL
             AND data_scadenza >= DATE('now')
             AND data_scadenza <= DATE('now', ?)`
        )
        .get(`+${giorniScadenza} days`) as { c: number }
      const giorniVendite = getConfigInt(db, 'finestra_analisi_vendite_giorni', 90)
      const topBirra = db
        .prepare(
          `SELECT b.nome as birra, SUM(vd.quantita) as bottiglie_vendute
           FROM vendita_dettaglio vd
           JOIN cotte c ON c.id = vd.cotta_id
           JOIN birre b ON b.id = c.birra_id
           JOIN vendite v ON v.id = vd.vendita_id
           WHERE v.data >= DATE('now', ?)
             AND v.omaggio = 0
             AND vd.tipo_prodotto = 'bottiglia'
           GROUP BY b.id
           ORDER BY bottiglie_vendute DESC
           LIMIT 1`
        )
        .get(`-${giorniVendite} days`) as
        | { birra: string; bottiglie_vendute: number }
        | undefined

      return {
        avvisi_attivi: avvisi.c,
        cotte_in_corso: cotteInCorso.c,
        lotti_materie_prime_in_scadenza: lottiInScad.c,
        finestra_analisi_vendite_giorni: giorniVendite,
        top_birra_venduta: topBirra
          ? { nome: topBirra.birra, bottiglie_vendute: Number(topBirra.bottiglie_vendute) || 0 }
          : null
      }
    }
  },

  {
    name: 'lista_birre',
    cloud_safe: true,
    description:
      'Elenca tutte le birre del birrificio con il loro stile. Usa solo_attive=true per filtrare solo birre in produzione.',
    parameters: {
      type: 'object',
      properties: {
        solo_attive: {
          type: 'boolean',
          description: 'Se true, restituisce solo birre con attiva=1. Default true.'
        }
      }
    },
    handler: (db, args) => {
      const soloAttive = args.solo_attive !== false
      const rows = db
        .prepare(
          `SELECT id, nome, stile, descrizione, attiva
           FROM birre ${soloAttive ? 'WHERE attiva = 1' : ''}
           ORDER BY nome`
        )
        .all()
      return { totale: rows.length, birre: rows }
    }
  },

  {
    name: 'materie_prime_in_scadenza',
    cloud_safe: false,
    description:
      'Elenca i lotti di materie prime con scadenza entro N giorni (default: usa la configurazione anticipo_avviso_scadenza_giorni). Restituisce lotto, materia prima, data scadenza, quantita residua.',
    parameters: {
      type: 'object',
      properties: {
        giorni: {
          ...integerLikeParam('Finestra in giorni a partire da oggi. Se omesso usa la configurazione.')
        }
      }
    },
    handler: (db, args) => {
      const giorniDefault = getConfigInt(db, 'anticipo_avviso_scadenza_giorni', 60)
      const giorni = args.giorni !== undefined ? asInt(args.giorni, giorniDefault, 1, 3650) : giorniDefault
      const rows = db
        .prepare(
          `SELECT l.id as lotto_id,
                  l.lotto_fornitore,
                  l.data_scadenza,
                  l.quantita_residua,
                  mp.nome as materia_prima,
                  mp.unita_misura,
                  CAST(julianday(l.data_scadenza) - julianday('now') AS INTEGER) as giorni_alla_scadenza
           FROM lotti_materie_prime l
           JOIN materie_prime mp ON mp.id = l.materia_prima_id
           WHERE l.quantita_residua > 0
             AND l.data_scadenza IS NOT NULL
             AND l.data_scadenza >= DATE('now')
             AND l.data_scadenza <= DATE('now', ?)
           ORDER BY l.data_scadenza ASC`
        )
        .all(`+${giorni} days`)
      return { finestra_giorni: giorni, totale: rows.length, lotti: rows }
    }
  },

  {
    name: 'materie_prime_sotto_soglia',
    cloud_safe: false,
    description:
      'Elenca le materie prime la cui giacenza totale e\' sotto la soglia di riordino fissa configurata.',
    parameters: { type: 'object', properties: {} },
    handler: (db) => {
      const rows = db
        .prepare(
          `SELECT mp.id,
                  mp.nome,
                  mp.categoria,
                  mp.unita_misura,
                  mp.soglia_riordino_fissa,
                  COALESCE(SUM(l.quantita_residua), 0) as giacenza
           FROM materie_prime mp
           LEFT JOIN lotti_materie_prime l
             ON l.materia_prima_id = mp.id AND l.quantita_residua > 0
           WHERE mp.soglia_riordino_fissa IS NOT NULL
           GROUP BY mp.id
           HAVING giacenza < mp.soglia_riordino_fissa
           ORDER BY (mp.soglia_riordino_fissa - giacenza) DESC`
        )
        .all()
      return { totale: rows.length, materie_prime: rows }
    }
  },

  {
    name: 'confezionamento_sotto_soglia',
    cloud_safe: true,
    description:
      'Materiali di confezionamento (bottiglie, etichette, fusti, tappi...) con giacenza sotto la soglia di riordino.',
    parameters: { type: 'object', properties: {} },
    handler: (db) => {
      const rows = db
        .prepare(
          `SELECT mc.id,
                  mc.nome,
                  mc.categoria,
                  b.nome as birra_associata,
                  mc.soglia_riordino,
                  COALESCE(g.quantita, 0) as giacenza
           FROM materiali_confezionamento mc
           LEFT JOIN giacenza_confezionamento g ON g.materiale_id = mc.id
           LEFT JOIN birre b ON b.id = mc.birra_id
           WHERE mc.attivo = 1
             AND mc.soglia_riordino IS NOT NULL
             AND COALESCE(g.quantita, 0) < mc.soglia_riordino
           ORDER BY (mc.soglia_riordino - COALESCE(g.quantita, 0)) DESC`
        )
        .all()
      return { totale: rows.length, materiali: rows }
    }
  },

  {
    name: 'cotte_attive',
    cloud_safe: true,
    description:
      'Restituisce le cotte attualmente in corso (stato = in_corso) con birra, lotto, data inizio e litri teorici.',
    parameters: { type: 'object', properties: {} },
    handler: (db) => {
      const rows = db
        .prepare(
          `SELECT c.id,
                  c.numero_lotto,
                  b.nome as birra,
                  c.data_inizio,
                  c.litri_teorici,
                  c.note
           FROM cotte c
           JOIN birre b ON b.id = c.birra_id
           WHERE c.stato = 'in_corso'
           ORDER BY c.data_inizio DESC`
        )
        .all()
      return { totale: rows.length, cotte: rows }
    }
  },

  {
    name: 'giacenza_prodotto_finito',
    cloud_safe: true,
    description:
      'Giacenza prodotto finito per birra: bottiglie sfuse + bottiglie equivalenti, e fusti per formato.',
    parameters: { type: 'object', properties: {} },
    handler: (db) => {
      const bottiglie = db
        .prepare(
          `SELECT b.nome as birra,
                  c.numero_lotto,
                  c.data_confezionamento,
                  conf.data_scadenza,
                  COALESCE(g.bottiglie_sfuse, 0) as bottiglie_disponibili
           FROM giacenza_prodotto_finito_cartoni g
           JOIN cotte c ON c.id = g.cotta_id
           JOIN birre b ON b.id = c.birra_id
           LEFT JOIN confezionamento conf ON conf.cotta_id = c.id
           WHERE COALESCE(g.bottiglie_sfuse, 0) > 0
           ORDER BY conf.data_scadenza ASC`
        )
        .all()

      const fusti = db
        .prepare(
          `SELECT b.nome as birra,
                  c.numero_lotto,
                  mc.nome as formato_fusto,
                  mc.capacita_litri,
                  g.quantita_disponibile
           FROM giacenza_prodotto_finito_fusti g
           JOIN cotte c ON c.id = g.cotta_id
           JOIN birre b ON b.id = c.birra_id
           JOIN materiali_confezionamento mc ON mc.id = g.materiale_id
           WHERE g.quantita_disponibile > 0
           ORDER BY b.nome, mc.capacita_litri DESC`
        )
        .all()

      return { bottiglie, fusti }
    }
  },

  {
    name: 'cotte_producibili',
    cloud_safe: false,
    description:
      'Per ogni birra calcola quante cotte si potrebbero produrre con le materie prime attualmente disponibili, indicando l\'ingrediente limitante.',
    parameters: { type: 'object', properties: {} },
    handler: (db) => {
      const rows = db
        .prepare(
          `SELECT b.id, b.nome, ri.quantita, mp.nome as mp_nome,
                  COALESCE(g.tot, 0) as giacenza
           FROM birre b
           JOIN ricette r ON r.birra_id = b.id AND r.attiva = 1
           JOIN ricetta_ingredienti ri ON ri.ricetta_id = r.id
           JOIN materie_prime mp ON mp.id = ri.materia_prima_id
           LEFT JOIN (
             SELECT materia_prima_id, SUM(quantita_residua) as tot
             FROM lotti_materie_prime
             WHERE quantita_residua > 0
             GROUP BY materia_prima_id
           ) g ON g.materia_prima_id = ri.materia_prima_id
           WHERE b.attiva = 1`
        )
        .all() as Array<{
        id: number
        nome: string
        quantita: number
        mp_nome: string
        giacenza: number
      }>

      const perBirra = new Map<
        number,
        { nome: string; minRatio: number; limitante: string }
      >()
      for (const row of rows) {
        const ratio = row.quantita > 0 ? Number(row.giacenza) / row.quantita : 0
        const e = perBirra.get(row.id)
        if (!e) perBirra.set(row.id, { nome: row.nome, minRatio: ratio, limitante: row.mp_nome })
        else if (ratio < e.minRatio) {
          e.minRatio = ratio
          e.limitante = row.mp_nome
        }
      }

      const out = [...perBirra.entries()]
        .map(([id, d]) => ({
          id,
          birra: d.nome,
          cotte_producibili: Math.floor(d.minRatio),
          ingrediente_limitante: d.limitante
        }))
        .sort((a, b) => a.cotte_producibili - b.cotte_producibili)
      return { totale: out.length, birre: out }
    }
  },

  {
    name: 'clienti_inattivi',
    cloud_safe: false,
    description:
      'Elenca clienti senza vendite (non omaggio) negli ultimi N giorni. Default: usa la configurazione cliente_inattivo_giorni.',
    parameters: {
      type: 'object',
      properties: {
        giorni: {
          ...integerLikeParam('Soglia in giorni. Se omesso usa la configurazione.')
        }
      }
    },
    handler: (db, args) => {
      const def = getConfigInt(db, 'cliente_inattivo_giorni', 20)
      const giorni = args.giorni !== undefined ? asInt(args.giorni, def, 1, 3650) : def
      const rows = db
        .prepare(
          `SELECT cli.id,
                  cli.nome,
                  cli.tipo_cliente,
                  cli.telefono,
                  cli.email,
                  MAX(CASE WHEN v.omaggio = 0 THEN v.data END) as ultima_vendita
           FROM clienti cli
           LEFT JOIN vendite v ON v.cliente_id = cli.id
           WHERE cli.attivo = 1
           GROUP BY cli.id
           HAVING ultima_vendita IS NULL
              OR DATE(ultima_vendita) < DATE('now', ?)
           ORDER BY ultima_vendita IS NULL DESC, ultima_vendita ASC`
        )
        .all(`-${giorni} days`)
      return { soglia_giorni: giorni, totale: rows.length, clienti: rows }
    }
  },

  {
    name: 'top_clienti',
    cloud_safe: false,
    description:
      'Top clienti per bottiglie vendute (escluse omaggio) in un periodo. Default: ultimi 90 giorni, primi 10.',
    parameters: {
      type: 'object',
      properties: {
        giorni: { ...integerLikeParam('Periodo in giorni indietro. Default 90.') },
        limite: { ...integerLikeParam('Numero max clienti. Default 10.') },
        da: { type: 'string', description: 'Data inizio YYYY-MM-DD (alternativa a giorni).' },
        a: { type: 'string', description: 'Data fine YYYY-MM-DD (alternativa a giorni).' }
      }
    },
    handler: (db, args) => {
      const limite = asInt(args.limite, 10, 1, 100)
      const da = asDateOrNull(args.da)
      const a = asDateOrNull(args.a)
      let where = `v.omaggio = 0`
      const params: unknown[] = []
      if (da && a) {
        where += ` AND v.data BETWEEN ? AND ?`
        params.push(da, a)
      } else {
        const giorni = asInt(args.giorni, 90, 1, 3650)
        where += ` AND v.data >= DATE('now', ?)`
        params.push(`-${giorni} days`)
      }
      const sql = `
        SELECT cli.id,
               cli.nome,
               cli.tipo_cliente,
               COUNT(DISTINCT v.id) as numero_ordini,
               SUM(CASE WHEN vd.tipo_prodotto = 'bottiglia' THEN vd.quantita ELSE 0 END) as bottiglie,
               SUM(CASE WHEN vd.tipo_prodotto = 'fusto' THEN vd.quantita ELSE 0 END) as fusti
        FROM vendite v
        JOIN vendita_dettaglio vd ON vd.vendita_id = v.id
        JOIN clienti cli ON cli.id = v.cliente_id
        WHERE ${where}
        GROUP BY cli.id
        ORDER BY bottiglie DESC, fusti DESC
        LIMIT ${limite}
      `
      const rows = db.prepare(sql).all(...params)
      return { totale: rows.length, clienti: rows }
    }
  },

  {
    name: 'vendite_per_birra',
    cloud_safe: true,
    description:
      'Aggregato vendite per birra in un periodo: bottiglie e fusti venduti, esclusi omaggi.',
    parameters: {
      type: 'object',
      properties: {
        giorni: { ...integerLikeParam('Giorni indietro da oggi. Default 90.') },
        da: { type: 'string', description: 'Data inizio YYYY-MM-DD (opzionale).' },
        a: { type: 'string', description: 'Data fine YYYY-MM-DD (opzionale).' }
      }
    },
    handler: (db, args) => {
      const da = asDateOrNull(args.da)
      const a = asDateOrNull(args.a)
      let where = `v.omaggio = 0`
      const params: unknown[] = []
      if (da && a) {
        where += ` AND v.data BETWEEN ? AND ?`
        params.push(da, a)
      } else {
        const giorni = asInt(args.giorni, 90, 1, 3650)
        where += ` AND v.data >= DATE('now', ?)`
        params.push(`-${giorni} days`)
      }
      const rows = db
        .prepare(
          `SELECT b.id,
                  b.nome as birra,
                  SUM(CASE WHEN vd.tipo_prodotto = 'bottiglia' THEN vd.quantita ELSE 0 END) as bottiglie,
                  SUM(CASE WHEN vd.tipo_prodotto = 'fusto' THEN vd.quantita ELSE 0 END) as fusti
           FROM vendite v
           JOIN vendita_dettaglio vd ON vd.vendita_id = v.id
           JOIN cotte c ON c.id = vd.cotta_id
           JOIN birre b ON b.id = c.birra_id
           WHERE ${where}
           GROUP BY b.id
           ORDER BY bottiglie DESC`
        )
        .all(...params)
      return { totale: rows.length, vendite: rows }
    }
  },

  {
    name: 'trend_vendite_mensile',
    cloud_safe: true,
    description:
      'Trend mensile di vendite (bottiglie e fusti) negli ultimi N mesi. Default 6 mesi. Esclude omaggi.',
    parameters: {
      type: 'object',
      properties: {
        mesi: { ...integerLikeParam('Numero mesi indietro. Default 6.') }
      }
    },
    handler: (db, args) => {
      const mesi = asInt(args.mesi, 6, 1, 60)
      const rows = db
        .prepare(
          `SELECT strftime('%Y-%m', v.data) as mese,
                  SUM(CASE WHEN vd.tipo_prodotto = 'bottiglia' THEN vd.quantita ELSE 0 END) as bottiglie,
                  SUM(CASE WHEN vd.tipo_prodotto = 'fusto' THEN vd.quantita ELSE 0 END) as fusti
           FROM vendite v
           JOIN vendita_dettaglio vd ON vd.vendita_id = v.id
           WHERE v.omaggio = 0
             AND v.data >= DATE('now', ?)
           GROUP BY mese
           ORDER BY mese ASC`
        )
        .all(`-${mesi} months`)
      return { mesi, righe: rows }
    }
  },

  {
    name: 'cerca_cliente',
    cloud_safe: false,
    description: 'Cerca clienti per nome (LIKE case-insensitive). Restituisce max 20 risultati.',
    parameters: {
      type: 'object',
      properties: {
        testo: { type: 'string', description: 'Testo da cercare nel nome.' }
      },
      required: ['testo']
    },
    handler: (db, args) => {
      const testo = asString(args.testo).trim()
      if (!testo) return { totale: 0, clienti: [] }
      const rows = db
        .prepare(
          `SELECT id, nome, tipo_cliente, telefono, email, attivo
           FROM clienti
           WHERE nome LIKE ?
           ORDER BY attivo DESC, nome ASC
           LIMIT 20`
        )
        .all(`%${testo}%`)
      return { totale: rows.length, clienti: rows }
    }
  },

  {
    name: 'avvisi_attivi',
    cloud_safe: false,
    description: 'Elenca gli avvisi non risolti, ordinati per priorita.',
    parameters: {
      type: 'object',
      properties: {
        limite: { ...integerLikeParam('Numero max avvisi. Default 50.') }
      }
    },
    handler: (db, args) => {
      const limite = asInt(args.limite, 50, 1, 500)
      const rows = db
        .prepare(
          `SELECT id, tipo, riferimento_tabella, riferimento_id, messaggio,
                  data_generazione, priorita, letto
           FROM avvisi
           WHERE risolto = 0
           ORDER BY CASE priorita
                      WHEN 'alta' THEN 1
                      WHEN 'media' THEN 2
                      WHEN 'bassa' THEN 3
                      ELSE 4
                    END,
                    data_generazione DESC
           LIMIT ?`
        )
        .all(limite)
      return { totale: rows.length, avvisi: rows }
    }
  },

  {
    name: 'configurazione',
    cloud_safe: false,
    description:
      'Restituisce il valore di una chiave di configurazione (es. cotta_litri, bottiglie_per_cartone, shelf_life_mesi).',
    parameters: {
      type: 'object',
      properties: {
        chiave: { type: 'string', description: 'Chiave esatta della configurazione.' }
      },
      required: ['chiave']
    },
    handler: (db, args) => {
      const chiave = asString(args.chiave).trim()
      if (!chiave) return { trovata: false }
      const row = db
        .prepare(`SELECT chiave, valore, tipo, etichetta, categoria FROM configurazioni WHERE chiave = ?`)
        .get(chiave)
      return row ? { trovata: true, ...(row as Record<string, unknown>) } : { trovata: false }
    }
  },
  {
    name: 'cerca_documentazione',
    description:
      "Cerca nella documentazione in-app di Fermento (schermate, operazioni, come si fa X). Ritorna i brani piu' pertinenti con nome schermata, descrizione e azioni. USA QUESTO TOOL per rispondere a domande \"come si fa\", \"dove trovo\", \"dove imposto\".",
    cloud_safe: true,
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: "Testo libero della domanda dell'utente (es. \"come carico una materia prima\")."
        },
        max_risultati: {
          ...integerLikeParam('Numero massimo di voci da restituire (default 3).')
        }
      },
      required: ['query']
    },
    handler: (_db, args) => {
      const query = asString(args.query).trim()
      const maxR = asInt(args.max_risultati, 3, 1, 6)
      const risultati = cercaDocs(query, maxR)
      return { query, totale: risultati.length, risultati }
    }
  },
  {
    name: 'naviga_a_schermata',
    description:
      "Propone all'utente di navigare a una schermata specifica. USA QUESTO TOOL quando pensi che sia utile mostrare una schermata all'utente per completare l'operazione che sta chiedendo. L'utente puo' rifiutare.",
    cloud_safe: true,
    parameters: {
      type: 'object',
      properties: {
        sezione: {
          type: 'string',
          description: `Id della sezione. Valori validi: ${SEZIONI_VALIDE.join(', ')}.`
        },
        motivo: {
          type: 'string',
          description: "Breve spiegazione del perche' stai proponendo questa navigazione."
        }
      },
      required: ['sezione']
    },
    handler: (_db, args, ctx) => {
      const sezione = asString(args.sezione).trim()
      if (!isSezioneValida(sezione)) {
        return {
          ok: false,
          errore: `Sezione '${sezione}' non valida`,
          sezioni_valide: SEZIONI_VALIDE
        }
      }
      const motivo = asString(args.motivo).trim() || undefined
      if (ctx.richiediNavigazione) {
        ctx.richiediNavigazione(sezione, motivo)
        return { ok: true, sezione, motivo: motivo ?? null, proposto: true }
      }
      return { ok: true, sezione, motivo: motivo ?? null, proposto: false }
    }
  }
]

// ---------- API esposta all'agente ----------

const toolByName = new Map(tools.map((t) => [t.name, t]))

export type GetToolsOptions = {
  /**
   * Se true, espone solo i tool marcati cloud_safe. Da usare con provider
   * remoti (Groq, Ollama Cloud, ecc.) per evitare la fuga di nomi clienti,
   * nomi materie prime o dati riconducibili alle ricette.
   */
  soloCloudSafe?: boolean
}

export function getToolDefinitions(opts: GetToolsOptions = {}): OllamaToolDef[] {
  return filtraTool(opts).map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }
  }))
}

export function getToolNames(opts: GetToolsOptions = {}): string[] {
  return filtraTool(opts).map((t) => t.name)
}

/** Nomi dei tool bloccati in modalita' cloud (utile per log/UI). */
export function getToolNamesBloccatiCloud(): string[] {
  return tools.filter((t) => !t.cloud_safe).map((t) => t.name)
}

function filtraTool(opts: GetToolsOptions): ToolDefinition[] {
  if (opts.soloCloudSafe) return tools.filter((t) => t.cloud_safe)
  return tools
}

export function executeTool(
  db: BetterSqlite3.Database,
  name: string,
  args: unknown,
  opts: GetToolsOptions = {},
  ctx: ToolContext = {}
): { ok: true; result: unknown } | { ok: false; errore: string } {
  const tool = toolByName.get(name)
  if (!tool) return { ok: false, errore: `Tool sconosciuto: ${name}` }
  // Difesa in profondita': anche se il modello ignora la lista di tool
  // esposta, qui rifiutiamo qualunque tool non cloud_safe in modalita' remota.
  if (opts.soloCloudSafe && !tool.cloud_safe) {
    return {
      ok: false,
      errore: `Tool '${name}' non disponibile in modalita' cloud (dati sensibili).`
    }
  }
  let parsed: Record<string, unknown> = {}
  if (args && typeof args === 'object' && !Array.isArray(args)) {
    parsed = args as Record<string, unknown>
  } else if (typeof args === 'string') {
    try {
      const j = JSON.parse(args)
      if (j && typeof j === 'object' && !Array.isArray(j)) parsed = j as Record<string, unknown>
    } catch {
      // argomento non JSON: lascia parsed vuoto
    }
  }
  try {
    const result = tool.handler(db, parsed, ctx)
    return { ok: true, result }
  } catch (e) {
    return { ok: false, errore: e instanceof Error ? e.message : String(e) }
  }
}
