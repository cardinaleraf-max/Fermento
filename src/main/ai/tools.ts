/**
 * Registro degli strumenti che Bira può usare.
 *
 * Niente SQL libero generato dal modello: solo funzioni di alto livello, in
 * SOLA LETTURA, con parametri validati.
 *
 * REGOLE (leggere prima di aggiungere strumenti):
 *  - Mai restituire contatti dei clienti (email, telefono, P.IVA, indirizzo),
 *    note libere di clienti, vendite o fusti, contatti/note dei fornitori,
 *    riferimenti catastali, configurazioni segrete o personali.
 *  - I nomi di clienti, fornitori, titolare e operatori possono comparire:
 *    vengono sostituiti da codici prima di uscire dal PC (privacy.ts) e c'è
 *    comunque la guardia finale.
 *  - Descrizioni di una riga: ogni carattere costa token a ogni domanda.
 */
import { cercaDocs, isSezioneValida, SEZIONI_AGRICOLE, SEZIONI_VALIDE } from './docs'
import type { ChatToolDef } from './tipi'
import {
  asInt,
  asString,
  filtroPeriodo,
  getConfigInt,
  intero,
  testo,
  type Db,
  type ToolContext,
  type ToolDefinition
} from './strumenti/comuni'
import { strumentiAgricoli } from './strumenti/agricolo'
import { strumentiProduzione } from './strumenti/produzione'

export type { ToolContext, ToolDefinition } from './strumenti/comuni'

/** Configurazioni che Bira può leggere (le altre sono personali, segrete o interne). */
const CATEGORIE_CONFIG_AMMESSE = ['produzione', 'magazzino', 'avvisi', 'vendite', 'agricolo']
const CHIAVI_CONFIG_AMMESSE = ['nome_birrificio']

function configAmmessa(chiave: string, categoria: string | null): boolean {
  if (CHIAVI_CONFIG_AMMESSE.includes(chiave)) return true
  return !!categoria && CATEGORIE_CONFIG_AMMESSE.includes(categoria) && !chiave.startsWith('ai_')
}

const strumentiBase: ToolDefinition[] = [
  {
    name: 'riassunto_dashboard',
    description:
      'Situazione generale: avvisi, cotte in corso, lotti in scadenza, birra più venduta.',
    parameters: { type: 'object', properties: {} },
    handler: (db) => {
      const conta = (sql: string, ...p: unknown[]): number =>
        (db.prepare(sql).get(...p) as { c: number }).c
      const giorniScadenza = getConfigInt(db, 'anticipo_avviso_scadenza_giorni', 60)
      const giorniVendite = getConfigInt(db, 'finestra_analisi_vendite_giorni', 90)
      const top = db
        .prepare(
          `SELECT b.nome AS birra, SUM(vd.quantita) AS bottiglie
           FROM vendita_dettaglio vd
           JOIN cotte c ON c.id = vd.cotta_id
           JOIN birre b ON b.id = c.birra_id
           JOIN vendite v ON v.id = vd.vendita_id
           WHERE v.data >= DATE('now', ?) AND v.omaggio = 0 AND vd.tipo_prodotto = 'bottiglia'
           GROUP BY b.id ORDER BY bottiglie DESC LIMIT 1`
        )
        .get(`-${giorniVendite} days`)
      return {
        avvisi_attivi: conta(`SELECT COUNT(*) AS c FROM avvisi WHERE risolto = 0`),
        cotte_in_corso: conta(`SELECT COUNT(*) AS c FROM cotte WHERE stato = 'in_corso'`),
        lotti_in_scadenza: conta(
          `SELECT COUNT(*) AS c FROM lotti_materie_prime
           WHERE quantita_residua > 0 AND data_scadenza IS NOT NULL
             AND data_scadenza >= DATE('now') AND data_scadenza <= DATE('now', ?)`,
          `+${giorniScadenza} days`
        ),
        giorni_finestra_scadenze: giorniScadenza,
        giorni_finestra_vendite: giorniVendite,
        birra_piu_venduta: top ?? null
      }
    }
  },

  {
    name: 'lista_birre',
    description: 'Birre del birrificio con stile e se sono attive.',
    parameters: { type: 'object', properties: {} },
    handler: (db) => {
      const birre = db
        .prepare(`SELECT nome, stile, descrizione, attiva FROM birre ORDER BY attiva DESC, nome`)
        .all()
      return { totale: birre.length, birre }
    }
  },

  {
    name: 'materie_prime_in_scadenza',
    description: 'Lotti di materie prime che scadono entro N giorni.',
    parameters: {
      type: 'object',
      properties: { giorni: intero('Finestra in giorni (default: impostazione avvisi).') }
    },
    handler: (db, args) => {
      const def = getConfigInt(db, 'anticipo_avviso_scadenza_giorni', 60)
      const giorni = asInt(args.giorni, def, 1, 3650)
      const lotti = db
        .prepare(
          `SELECT mp.nome AS materia, l.lotto_fornitore AS lotto, l.data_scadenza AS scadenza,
                  l.quantita_residua AS residuo, mp.unita_misura AS unita,
                  CAST(julianday(l.data_scadenza) - julianday(DATE('now')) AS INTEGER) AS giorni_mancanti
           FROM lotti_materie_prime l JOIN materie_prime mp ON mp.id = l.materia_prima_id
           WHERE l.quantita_residua > 0 AND l.data_scadenza IS NOT NULL
             AND l.data_scadenza >= DATE('now') AND l.data_scadenza <= DATE('now', ?)
           ORDER BY l.data_scadenza`
        )
        .all(`+${giorni} days`)
      return { finestra_giorni: giorni, totale: lotti.length, lotti }
    }
  },

  {
    name: 'materie_prime_sotto_soglia',
    description: 'Materie prime con giacenza sotto la soglia di riordino.',
    parameters: { type: 'object', properties: {} },
    handler: (db) => {
      const materie = db
        .prepare(
          `SELECT mp.nome AS materia, mp.categoria, mp.unita_misura AS unita,
                  mp.soglia_riordino_fissa AS soglia, COALESCE(SUM(l.quantita_residua), 0) AS giacenza
           FROM materie_prime mp
           LEFT JOIN lotti_materie_prime l ON l.materia_prima_id = mp.id AND l.quantita_residua > 0
           WHERE mp.soglia_riordino_fissa IS NOT NULL
           GROUP BY mp.id
           HAVING giacenza < mp.soglia_riordino_fissa
           ORDER BY (mp.soglia_riordino_fissa - giacenza) DESC`
        )
        .all()
      return { totale: materie.length, materie }
    }
  },

  {
    name: 'confezionamento_sotto_soglia',
    description: 'Materiali di confezionamento (bottiglie, etichette, fusti, tappi) sotto soglia.',
    parameters: { type: 'object', properties: {} },
    handler: (db) => {
      const materiali = db
        .prepare(
          `SELECT mc.nome AS materiale, mc.categoria, b.nome AS birra, mc.soglia_riordino AS soglia,
                  COALESCE(g.quantita, 0) AS giacenza
           FROM materiali_confezionamento mc
           LEFT JOIN giacenza_confezionamento g ON g.materiale_id = mc.id
           LEFT JOIN birre b ON b.id = mc.birra_id
           WHERE mc.attivo = 1 AND mc.soglia_riordino IS NOT NULL
             AND COALESCE(g.quantita, 0) < mc.soglia_riordino
           ORDER BY (mc.soglia_riordino - COALESCE(g.quantita, 0)) DESC`
        )
        .all()
      return { totale: materiali.length, materiali }
    }
  },

  {
    name: 'cotte_attive',
    description: 'Cotte in corso con birra, lotto, data di inizio, litri e note.',
    parameters: { type: 'object', properties: {} },
    handler: (db) => {
      const cotte = db
        .prepare(
          `SELECT c.numero_lotto AS lotto, b.nome AS birra, c.data_inizio AS inizio,
                  c.litri_teorici AS litri, c.note
           FROM cotte c JOIN birre b ON b.id = c.birra_id
           WHERE c.stato = 'in_corso' ORDER BY c.data_inizio DESC`
        )
        .all()
      return { totale: cotte.length, cotte }
    }
  },

  {
    name: 'giacenza_prodotto_finito',
    description: 'Prodotto finito disponibile: bottiglie per lotto e fusti pieni per formato.',
    parameters: { type: 'object', properties: {} },
    handler: (db) => {
      const bottiglie = db
        .prepare(
          `SELECT b.nome AS birra, c.numero_lotto AS lotto, conf.data_scadenza AS scadenza,
                  COALESCE(g.bottiglie_sfuse, 0) AS bottiglie
           FROM giacenza_prodotto_finito_cartoni g
           JOIN cotte c ON c.id = g.cotta_id
           JOIN birre b ON b.id = c.birra_id
           LEFT JOIN confezionamento conf ON conf.cotta_id = c.id
           WHERE COALESCE(g.bottiglie_sfuse, 0) > 0
           ORDER BY conf.data_scadenza`
        )
        .all()
      const fusti = db
        .prepare(
          `SELECT b.nome AS birra, c.numero_lotto AS lotto, mc.nome AS formato, g.quantita_disponibile AS fusti
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
    description:
      'Quante cotte di ogni birra si possono fare con il magazzino attuale e cosa limita.',
    parameters: { type: 'object', properties: {} },
    handler: (db) => {
      const righe = db
        .prepare(
          `SELECT b.id, b.nome, ri.quantita, mp.nome AS mp_nome, COALESCE(g.tot, 0) AS giacenza
           FROM birre b
           JOIN ricette r ON r.birra_id = b.id AND r.attiva = 1
           JOIN ricetta_ingredienti ri ON ri.ricetta_id = r.id
           JOIN materie_prime mp ON mp.id = ri.materia_prima_id
           LEFT JOIN (
             SELECT materia_prima_id, SUM(quantita_residua) AS tot FROM lotti_materie_prime
             WHERE quantita_residua > 0 GROUP BY materia_prima_id
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
      const perBirra = new Map<number, { nome: string; minimo: number; limitante: string }>()
      for (const r of righe) {
        const rapporto = r.quantita > 0 ? Number(r.giacenza) / r.quantita : 0
        const e = perBirra.get(r.id)
        if (!e || rapporto < e.minimo) {
          perBirra.set(r.id, { nome: r.nome, minimo: rapporto, limitante: r.mp_nome })
        }
      }
      const birre = [...perBirra.values()]
        .map((d) => ({ birra: d.nome, cotte: Math.floor(d.minimo), limitante: d.limitante }))
        .sort((a, b) => a.cotte - b.cotte)
      return { totale: birre.length, birre }
    }
  },

  {
    name: 'clienti_inattivi',
    description: 'Clienti senza acquisti negli ultimi N giorni.',
    parameters: {
      type: 'object',
      properties: { giorni: intero('Soglia in giorni (default: impostazione avvisi).') }
    },
    handler: (db, args) => {
      const giorni = asInt(args.giorni, getConfigInt(db, 'cliente_inattivo_giorni', 20), 1, 3650)
      const clienti = db
        .prepare(
          `SELECT cli.nome AS cliente, cli.tipo_cliente AS tipo,
                  MAX(CASE WHEN v.omaggio = 0 THEN v.data END) AS ultima_vendita
           FROM clienti cli LEFT JOIN vendite v ON v.cliente_id = cli.id
           WHERE cli.attivo = 1
           GROUP BY cli.id
           HAVING ultima_vendita IS NULL OR DATE(ultima_vendita) < DATE('now', ?)
           ORDER BY ultima_vendita IS NULL DESC, ultima_vendita`
        )
        .all(`-${giorni} days`)
      return { soglia_giorni: giorni, totale: clienti.length, clienti }
    }
  },

  {
    name: 'top_clienti',
    description:
      'Clienti migliori per bottiglie e fusti acquistati in un periodo (omaggi esclusi).',
    parameters: {
      type: 'object',
      properties: {
        giorni: intero('Giorni indietro (default 90).'),
        limite: intero('Quanti clienti (default 10).'),
        da: testo('Dal (AAAA-MM-GG).'),
        a: testo('Al (AAAA-MM-GG).')
      }
    },
    handler: (db, args) => {
      const limite = asInt(args.limite, 10, 1, 100)
      const p = filtroPeriodo('v.data', args, 90)
      const clienti = db
        .prepare(
          `SELECT cli.nome AS cliente, cli.tipo_cliente AS tipo, COUNT(DISTINCT v.id) AS ordini,
                  SUM(CASE WHEN vd.tipo_prodotto = 'bottiglia' THEN vd.quantita ELSE 0 END) AS bottiglie,
                  SUM(CASE WHEN vd.tipo_prodotto = 'fusto' THEN vd.quantita ELSE 0 END) AS fusti
           FROM vendite v
           JOIN vendita_dettaglio vd ON vd.vendita_id = v.id
           JOIN clienti cli ON cli.id = v.cliente_id
           WHERE v.omaggio = 0 AND ${p.sql}
           GROUP BY cli.id ORDER BY bottiglie DESC, fusti DESC LIMIT ${limite}`
        )
        .all(...p.params)
      return { totale: clienti.length, clienti }
    }
  },

  {
    name: 'vendite_per_birra',
    description: 'Bottiglie e fusti venduti per birra in un periodo (omaggi esclusi).',
    parameters: {
      type: 'object',
      properties: {
        giorni: intero('Giorni indietro (default 90).'),
        da: testo('Dal (AAAA-MM-GG).'),
        a: testo('Al (AAAA-MM-GG).')
      }
    },
    handler: (db, args) => {
      const p = filtroPeriodo('v.data', args, 90)
      const vendite = db
        .prepare(
          `SELECT b.nome AS birra,
                  SUM(CASE WHEN vd.tipo_prodotto = 'bottiglia' THEN vd.quantita ELSE 0 END) AS bottiglie,
                  SUM(CASE WHEN vd.tipo_prodotto = 'fusto' THEN vd.quantita ELSE 0 END) AS fusti
           FROM vendite v
           JOIN vendita_dettaglio vd ON vd.vendita_id = v.id
           JOIN cotte c ON c.id = vd.cotta_id
           JOIN birre b ON b.id = c.birra_id
           WHERE v.omaggio = 0 AND ${p.sql}
           GROUP BY b.id ORDER BY bottiglie DESC`
        )
        .all(...p.params)
      return { totale: vendite.length, vendite }
    }
  },

  {
    name: 'trend_vendite_mensile',
    description: 'Vendite mese per mese (bottiglie e fusti) negli ultimi N mesi.',
    parameters: { type: 'object', properties: { mesi: intero('Mesi indietro (default 6).') } },
    handler: (db, args) => {
      const mesi = asInt(args.mesi, 6, 1, 60)
      const righe = db
        .prepare(
          `SELECT strftime('%Y-%m', v.data) AS mese,
                  SUM(CASE WHEN vd.tipo_prodotto = 'bottiglia' THEN vd.quantita ELSE 0 END) AS bottiglie,
                  SUM(CASE WHEN vd.tipo_prodotto = 'fusto' THEN vd.quantita ELSE 0 END) AS fusti
           FROM vendite v JOIN vendita_dettaglio vd ON vd.vendita_id = v.id
           WHERE v.omaggio = 0 AND v.data >= DATE('now', ?)
           GROUP BY mese ORDER BY mese`
        )
        .all(`-${mesi} months`)
      return { mesi, righe }
    }
  },

  {
    name: 'fusti_a_rendere',
    description: 'Fusti a rendere ancora presso i clienti, per cliente e formato.',
    parameters: {
      type: 'object',
      properties: { cliente: testo('Filtro facoltativo sul cliente.') }
    },
    handler: (db, args) => {
      const cliente = asString(args.cliente).trim()
      const righe = db
        .prepare(
          `SELECT cli.nome AS cliente, mc.nome AS formato,
                  SUM(CASE WHEN m.tipo = 'uscita' THEN m.quantita ELSE -m.quantita END) AS da_restituire
           FROM movimenti_fusti_rendere m
           JOIN clienti cli ON cli.id = m.cliente_id
           JOIN materiali_confezionamento mc ON mc.id = m.materiale_id
           ${cliente ? 'WHERE cli.nome LIKE ?' : ''}
           GROUP BY m.cliente_id, m.materiale_id
           HAVING da_restituire > 0
           ORDER BY cli.nome, mc.capacita_litri`
        )
        .all(...(cliente ? [`%${cliente}%`] : [])) as Array<{ da_restituire: number }>
      const totale = righe.reduce((s, r) => s + Number(r.da_restituire ?? 0), 0)
      return { totale_fusti_in_giro: totale, righe }
    }
  },

  {
    name: 'altri_prodotti',
    description: 'Giacenza degli altri prodotti (gadget, merchandising).',
    parameters: { type: 'object', properties: {} },
    handler: (db) => {
      const prodotti = db
        .prepare(
          `SELECT ap.nome, COALESCE(g.quantita_disponibile, 0) AS disponibili
           FROM altri_prodotti ap LEFT JOIN giacenza_altri_prodotti g ON g.altro_prodotto_id = ap.id
           WHERE ap.attivo = 1 ORDER BY ap.nome`
        )
        .all()
      return { totale: prodotti.length, prodotti }
    }
  },

  {
    name: 'omaggi',
    description: 'Omaggi e assaggi negli ultimi N giorni: data, cliente, quantità.',
    parameters: { type: 'object', properties: { giorni: intero('Giorni indietro (default 90).') } },
    handler: (db, args) => {
      const p = filtroPeriodo('v.data', args, 90)
      const omaggi = db
        .prepare(
          `SELECT v.data, cli.nome AS cliente,
                  SUM(CASE WHEN vd.tipo_prodotto = 'bottiglia' THEN vd.quantita ELSE 0 END) AS bottiglie,
                  SUM(CASE WHEN vd.tipo_prodotto = 'fusto' THEN vd.quantita ELSE 0 END) AS fusti
           FROM vendite v
           LEFT JOIN clienti cli ON cli.id = v.cliente_id
           LEFT JOIN vendita_dettaglio vd ON vd.vendita_id = v.id
           WHERE v.omaggio = 1 AND ${p.sql}
           GROUP BY v.id ORDER BY v.data DESC`
        )
        .all(...p.params)
      return { totale: omaggi.length, omaggi }
    }
  },

  {
    name: 'avvisi_attivi',
    description: 'Avvisi non risolti, dai più urgenti.',
    parameters: { type: 'object', properties: { limite: intero('Quanti (default 30).') } },
    handler: (db, args) => {
      const limite = asInt(args.limite, 30, 1, 200)
      const avvisi = db
        .prepare(
          `SELECT tipo, messaggio, priorita, DATE(data_generazione) AS data
           FROM avvisi WHERE risolto = 0
           ORDER BY CASE priorita WHEN 'alta' THEN 1 WHEN 'media' THEN 2 WHEN 'bassa' THEN 3 ELSE 4 END,
                    data_generazione DESC
           LIMIT ?`
        )
        .all(limite)
      const totale = (
        db.prepare(`SELECT COUNT(*) AS c FROM avvisi WHERE risolto = 0`).get() as { c: number }
      ).c
      return { totale, mostrati: avvisi.length, avvisi }
    }
  },

  {
    name: 'configurazione',
    description:
      'Impostazioni di lavoro (litri cotta, shelf life, soglie…). Senza chiave le elenca.',
    parameters: { type: 'object', properties: { chiave: testo('Chiave esatta (facoltativa).') } },
    handler: (db, args) => {
      const chiave = asString(args.chiave).trim()
      const righe = db
        .prepare(
          `SELECT chiave, valore, etichetta, categoria FROM configurazioni ORDER BY categoria, chiave`
        )
        .all() as Array<{
        chiave: string
        valore: string
        etichetta: string
        categoria: string | null
      }>
      const ammesse = righe.filter((r) => configAmmessa(r.chiave, r.categoria))
      if (!chiave) {
        return {
          impostazioni: ammesse.map(({ chiave: c, valore, etichetta }) => ({
            chiave: c,
            valore,
            etichetta
          }))
        }
      }
      const r = ammesse.find((x) => x.chiave === chiave)
      return r
        ? { trovata: true, chiave: r.chiave, valore: r.valore, etichetta: r.etichetta }
        : { trovata: false }
    }
  },

  {
    name: 'cerca_documentazione',
    description:
      'Guida di Fermento: come si fa, dove si trova, dove si imposta. Usala per le domande di aiuto.',
    parameters: {
      type: 'object',
      properties: { query: testo('La domanda in parole semplici.') },
      required: ['query']
    },
    handler: (_db, args) => {
      const query = asString(args.query).trim()
      const risultati = cercaDocs(query, 3)
      return { totale: risultati.length, risultati }
    }
  },

  {
    name: 'naviga_a_schermata',
    description:
      "Propone all'utente di aprire una schermata (può rifiutare). Usala dopo aver spiegato.",
    parameters: {
      type: 'object',
      properties: {
        sezione: testo(`Una tra: ${SEZIONI_VALIDE.join(', ')}.`),
        motivo: testo('Perché la proponi, in breve.')
      },
      required: ['sezione']
    },
    descrizioneAgricola: `Con il modulo agricolo anche: ${SEZIONI_AGRICOLE.join(', ')}.`,
    handler: (_db, args, ctx) => {
      const sezione = asString(args.sezione).trim()
      if (!isSezioneValida(sezione, { moduloAgricolo: ctx.moduloAgricolo })) {
        return { ok: false, errore: `Sezione '${sezione}' non valida` }
      }
      const motivo = asString(args.motivo).trim() || undefined
      ctx.richiediNavigazione?.(sezione, motivo)
      return { ok: true, sezione, proposto: !!ctx.richiediNavigazione }
    }
  }
]

const tutti: ToolDefinition[] = [...strumentiBase, ...strumentiProduzione, ...strumentiAgricoli]
const perNome = new Map(tutti.map((t) => [t.name, t]))

export type OpzioniStrumenti = { moduloAgricolo?: boolean }

function disponibili(opts: OpzioniStrumenti): ToolDefinition[] {
  return tutti.filter((t) => !t.agricolo || opts.moduloAgricolo)
}

export function getToolDefinitions(opts: OpzioniStrumenti = {}): ChatToolDef[] {
  return disponibili(opts).map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description:
        opts.moduloAgricolo && t.descrizioneAgricola
          ? `${t.description} ${t.descrizioneAgricola}`
          : t.description,
      parameters: t.parameters
    }
  }))
}

export function getToolNames(opts: OpzioniStrumenti = {}): string[] {
  return disponibili(opts).map((t) => t.name)
}

export function executeTool(
  db: Db,
  name: string,
  args: unknown,
  opts: OpzioniStrumenti = {},
  ctx: ToolContext = {}
): { ok: true; result: unknown } | { ok: false; errore: string } {
  const tool = perNome.get(name)
  if (!tool) return { ok: false, errore: `Strumento sconosciuto: ${name}` }
  if (tool.agricolo && !opts.moduloAgricolo) {
    return { ok: false, errore: 'Il modulo agricolo è spento: questi dati non sono disponibili.' }
  }
  let parsed: Record<string, unknown> = {}
  if (args && typeof args === 'object' && !Array.isArray(args)) {
    parsed = args as Record<string, unknown>
  } else if (typeof args === 'string') {
    try {
      const j = JSON.parse(args)
      if (j && typeof j === 'object' && !Array.isArray(j)) parsed = j as Record<string, unknown>
    } catch {
      // argomento non JSON: oggetto vuoto
    }
  }
  try {
    return {
      ok: true,
      result: tool.handler(db, parsed, { ...ctx, moduloAgricolo: !!opts.moduloAgricolo })
    }
  } catch (e) {
    return { ok: false, errore: e instanceof Error ? e.message : String(e) }
  }
}
