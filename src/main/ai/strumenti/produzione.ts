/**
 * Strumenti di Bira su magazzino, ricette, cotte e vendite per cliente.
 * Solo lettura; mai contatti o note libere di clienti/vendite.
 */
import { asDateOrNull, asInt, asString, intero, testo, type ToolDefinition } from './comuni'

export const strumentiProduzione: ToolDefinition[] = [
  {
    name: 'giacenze_materie_prime',
    description:
      'Giacenze delle materie prime con soglia e lotti (codice, scadenza, residuo, fornitore).',
    parameters: {
      type: 'object',
      properties: {
        nome: testo('Filtro sul nome (anche parziale).'),
        categoria: testo('Filtro categoria, es. malto, luppolo, lievito.')
      }
    },
    handler: (db, args) => {
      const nome = asString(args.nome).trim()
      const categoria = asString(args.categoria).trim()
      const where: string[] = []
      const params: unknown[] = []
      if (nome) {
        where.push(`mp.nome LIKE ?`)
        params.push(`%${nome}%`)
      }
      if (categoria) {
        where.push(`mp.categoria LIKE ?`)
        params.push(`%${categoria}%`)
      }
      const materie = db
        .prepare(
          `SELECT mp.id, mp.nome AS materia, mp.categoria, mp.unita_misura AS unita,
                  mp.soglia_riordino_fissa AS soglia,
                  COALESCE((SELECT SUM(l.quantita_residua) FROM lotti_materie_prime l
                            WHERE l.materia_prima_id = mp.id AND l.quantita_residua > 0), 0) AS giacenza
           FROM materie_prime mp
           ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
           ORDER BY mp.categoria, mp.nome
           LIMIT 80`
        )
        .all(...params) as Array<Record<string, unknown> & { id: number }>
      const lotti = db.prepare(
        `SELECT l.lotto_fornitore AS lotto, l.data_scadenza AS scadenza, l.quantita_residua AS residuo,
                f.nome AS fornitore
         FROM lotti_materie_prime l
         LEFT JOIN fornitori f ON f.id = l.fornitore_id
         WHERE l.materia_prima_id = ? AND l.quantita_residua > 0
         ORDER BY l.data_scadenza IS NULL, l.data_scadenza`
      )
      return {
        totale: materie.length,
        materie: materie.map(({ id, ...m }) => ({ ...m, lotti: lotti.all(id) }))
      }
    }
  },

  {
    name: 'ricetta_birra',
    description: 'Ricetta attiva di una birra: ingredienti e quantità per cotta.',
    parameters: {
      type: 'object',
      properties: { birra: testo('Nome della birra (anche parziale).') },
      required: ['birra']
    },
    handler: (db, args) => {
      const birra = asString(args.birra).trim()
      const trovate = db
        .prepare(`SELECT id, nome, stile FROM birre WHERE nome LIKE ? ORDER BY attiva DESC, nome`)
        .all(`%${birra}%`) as Array<{ id: number; nome: string; stile: string | null }>
      if (trovate.length === 0) return { trovata: false }
      const esatta = trovate.find((b) => b.nome.toLowerCase() === birra.toLowerCase())
      if (!esatta && trovate.length > 1)
        return { trovata: false, birre_simili: trovate.map((b) => b.nome) }
      const b = esatta ?? trovate[0]
      const ricetta = db
        .prepare(
          `SELECT id, versione, cotta_litri_riferimento AS litri, note FROM ricette
           WHERE birra_id = ? AND attiva = 1 AND COALESCE(archiviata, 0) = 0
           ORDER BY versione DESC LIMIT 1`
        )
        .get(b.id) as
        | { id: number; versione: number; litri: number; note: string | null }
        | undefined
      if (!ricetta) return { birra: b.nome, ricetta: null }
      const ingredienti = db
        .prepare(
          `SELECT mp.nome AS materia, ri.quantita, mp.unita_misura AS unita
           FROM ricetta_ingredienti ri JOIN materie_prime mp ON mp.id = ri.materia_prima_id
           WHERE ri.ricetta_id = ? ORDER BY mp.categoria, mp.nome`
        )
        .all(ricetta.id)
      return {
        birra: b.nome,
        stile: b.stile,
        versione: ricetta.versione,
        litri_riferimento: ricetta.litri,
        note: ricetta.note,
        ingredienti
      }
    }
  },

  {
    name: 'storico_cotte',
    description: 'Elenco cotte (anche concluse) con date, stato, litri e bottiglie confezionate.',
    parameters: {
      type: 'object',
      properties: {
        birra: testo('Filtro birra.'),
        stato: testo('in_corso, confezionata, esaurita.'),
        da: testo('Dal AAAA-MM-GG.'),
        a: testo('Al AAAA-MM-GG.'),
        limite: intero('Default 20.')
      }
    },
    handler: (db, args) => {
      const where: string[] = []
      const params: unknown[] = []
      const birra = asString(args.birra).trim()
      if (birra) {
        where.push(`b.nome LIKE ?`)
        params.push(`%${birra}%`)
      }
      const stato = asString(args.stato).trim()
      if (stato) {
        where.push(`c.stato = ?`)
        params.push(stato)
      }
      const da = asDateOrNull(args.da)
      const a = asDateOrNull(args.a)
      if (da) {
        where.push(`c.data_inizio >= ?`)
        params.push(da)
      }
      if (a) {
        where.push(`c.data_inizio <= ?`)
        params.push(a)
      }
      const limite = asInt(args.limite, 20, 1, 100)
      const cotte = db
        .prepare(
          `SELECT c.numero_lotto AS lotto, b.nome AS birra, c.data_inizio AS inizio,
                  c.data_confezionamento AS confezionamento, c.stato, c.litri_teorici AS litri,
                  conf.bottiglie_prodotte AS bottiglie, conf.data_scadenza AS scadenza
           FROM cotte c
           JOIN birre b ON b.id = c.birra_id
           LEFT JOIN confezionamento conf ON conf.cotta_id = c.id
           ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
           ORDER BY c.data_inizio DESC, c.id DESC
           LIMIT ${limite}`
        )
        .all(...params)
      return { totale: cotte.length, cotte }
    }
  },

  {
    name: 'dettaglio_cotta',
    description:
      'Una cotta per numero di lotto: ingredienti usati con i lotti, variazioni dalla ricetta, confezionamento.',
    parameters: {
      type: 'object',
      properties: { numero_lotto: testo('Numero di lotto della cotta.') },
      required: ['numero_lotto']
    },
    handler: (db, args) => {
      const lotto = asString(args.numero_lotto).trim()
      const cotta = (db
        .prepare(
          `SELECT c.id, c.numero_lotto AS lotto, b.nome AS birra, c.data_inizio AS inizio,
                  c.data_confezionamento AS confezionamento, c.stato, c.litri_teorici AS litri, c.note
           FROM cotte c JOIN birre b ON b.id = c.birra_id
           WHERE c.numero_lotto = ?`
        )
        .get(lotto) ??
        db
          .prepare(
            `SELECT c.id, c.numero_lotto AS lotto, b.nome AS birra, c.data_inizio AS inizio,
                    c.data_confezionamento AS confezionamento, c.stato, c.litri_teorici AS litri, c.note
             FROM cotte c JOIN birre b ON b.id = c.birra_id
             WHERE c.numero_lotto LIKE ? ORDER BY c.data_inizio DESC LIMIT 1`
          )
          .get(`%${lotto}%`)) as (Record<string, unknown> & { id: number }) | undefined
      if (!cotta) return { trovata: false }
      const { id, ...dati } = cotta
      const ingredienti = db
        .prepare(
          `SELECT mp.nome AS materia, l.lotto_fornitore AS lotto, l.data_scadenza AS scadenza,
                  cmp.quantita_usata AS quantita, mp.unita_misura AS unita
           FROM cotta_materie_prime cmp
           JOIN materie_prime mp ON mp.id = cmp.materia_prima_id
           LEFT JOIN lotti_materie_prime l ON l.id = cmp.lotto_materia_prima_id
           WHERE cmp.cotta_id = ? ORDER BY mp.categoria, mp.nome`
        )
        .all(id)
      const conf = db
        .prepare(
          `SELECT id, bottiglie_prodotte AS bottiglie, cartoni_prodotti AS cartoni,
                  scarto_litri, data_scadenza AS scadenza
           FROM confezionamento WHERE cotta_id = ?`
        )
        .get(id) as (Record<string, unknown> & { id: number }) | undefined
      let confezionamento: Record<string, unknown> | null = null
      if (conf) {
        const { id: confId, ...c } = conf
        confezionamento = {
          ...c,
          fusti: db
            .prepare(
              `SELECT mc.nome AS formato, cf.quantita FROM confezionamento_fusti cf
               JOIN materiali_confezionamento mc ON mc.id = cf.materiale_id WHERE cf.confezionamento_id = ?`
            )
            .all(confId)
        }
      }
      let lotti_imballi: unknown[] = []
      try {
        lotti_imballi = db
          .prepare(
            `SELECT mc.nome AS materiale, m.lotto_fornitore AS lotto, m.fornitore
             FROM confezionamento_lotti_imballi li
             JOIN materiali_confezionamento mc ON mc.id = li.materiale_id
             LEFT JOIN movimenti_confezionamento m ON m.id = li.movimento_id
             WHERE li.cotta_id = ?`
          )
          .all(id)
      } catch {
        // tabella assente su DB vecchi
      }
      return { ...dati, ingredienti, confezionamento, lotti_imballi }
    }
  },

  {
    name: 'vendite_cliente',
    description:
      'Cosa ha comprato un cliente in un periodo, per birra (bottiglie e fusti), omaggi esclusi.',
    parameters: {
      type: 'object',
      properties: {
        cliente: testo('Nome o codice del cliente.'),
        giorni: intero('Giorni indietro (default 365).')
      },
      required: ['cliente']
    },
    handler: (db, args) => {
      const nome = asString(args.cliente).trim()
      const trovati = db
        .prepare(
          `SELECT id, nome, tipo_cliente AS tipo FROM clienti WHERE nome LIKE ? ORDER BY nome`
        )
        .all(`%${nome}%`) as Array<{ id: number; nome: string; tipo: string | null }>
      if (trovati.length === 0) return { trovato: false }
      const esatto = trovati.find((c) => c.nome.toLowerCase() === nome.toLowerCase())
      if (!esatto && trovati.length > 1)
        return { trovato: false, clienti_simili: trovati.map((c) => c.nome) }
      const c = esatto ?? trovati[0]
      const giorni = asInt(args.giorni, 365, 1, 3650)
      const periodo = `-${giorni} days`
      const per_birra = db
        .prepare(
          `SELECT b.nome AS birra,
                  SUM(CASE WHEN vd.tipo_prodotto = 'bottiglia' THEN vd.quantita ELSE 0 END) AS bottiglie,
                  SUM(CASE WHEN vd.tipo_prodotto = 'fusto' THEN vd.quantita ELSE 0 END) AS fusti
           FROM vendite v
           JOIN vendita_dettaglio vd ON vd.vendita_id = v.id
           JOIN cotte co ON co.id = vd.cotta_id
           JOIN birre b ON b.id = co.birra_id
           WHERE v.cliente_id = ? AND v.omaggio = 0 AND COALESCE(vd.omaggio, 0) = 0 AND v.data >= DATE('now', ?)
           GROUP BY b.id ORDER BY bottiglie DESC, fusti DESC`
        )
        .all(c.id, periodo)
      const riepilogo = db
        .prepare(
          `SELECT COUNT(*) AS ordini, MAX(data) AS ultima FROM vendite
           WHERE cliente_id = ? AND omaggio = 0 AND data >= DATE('now', ?)`
        )
        .get(c.id, periodo) as { ordini: number; ultima: string | null }
      return {
        cliente: c.nome,
        tipo: c.tipo,
        periodo_giorni: giorni,
        ordini: riepilogo.ordini,
        ultima_vendita: riepilogo.ultima,
        per_birra
      }
    }
  }
]
