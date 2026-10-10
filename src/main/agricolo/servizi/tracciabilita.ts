import type BetterSqlite3 from 'better-sqlite3'
import type {
  DirezioneTraccia,
  NodoTraccia,
  PartenzaTraccia,
  TipoNodo,
  TipoParametro
} from '../../../shared/agricolo'
import { ETICHETTE_CATEGORIA, TIPI_OPERAZIONE } from '../../../shared/agricolo'
import { aggiungiGiorni, doseEttaro } from '../calcoli'
import { reseMaltazione, verificaCarenza } from './lavorazioni'
import { consumiDi } from './magazzino'
import { valoriLeggibili } from './parametri'
import { lottiImballiCotta } from './imballi'

type Db = BetterSqlite3.Database
type Dettaglio = { etichetta: string; valore: string }

/**
 * Tracciabilità della filiera, a ritroso ("da dove viene") e in avanti ("dove
 * è finito"), come albero di nodi. Le catene sono costruite seguendo i lotti:
 * origine del lotto → lavorazione → lotti in ingresso, e viceversa.
 */

const PROFONDITA_MAX = 16

// ── Formattazione ────────────────────────────────────────────────────────────

function data(iso: string | null | undefined): string {
  if (!iso) return '—'
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

function num(n: number | null | undefined, dec = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  return n.toLocaleString('it-IT', { maximumFractionDigits: dec })
}

function qta(n: number | null | undefined, unita: string | null | undefined): string {
  return n === null || n === undefined ? '—' : `${num(n)}${unita ? ` ${unita}` : ''}`
}

function perc(r: number | null | undefined): string {
  if (r === null || r === undefined || !Number.isFinite(r)) return '—'
  return `${(r * 100).toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

/** "Campo 1A" resta "Campo 1A"; "Su Pranu" diventa "Campo Su Pranu". */
function nomeCampo(nome: string): string {
  return /^campo\b/i.test(nome.trim()) ? nome.trim() : `Campo ${nome.trim()}`
}

function valoreParametro(tipo: TipoParametro, valore: string, unita: string | null): string {
  if (tipo === 'si_no') return valore === 'si' ? 'Sì' : 'No'
  if (tipo === 'numero') return `${valore.replace('.', ',')}${unita ? ` ${unita}` : ''}`
  if (tipo === 'scala') return `${valore}/10`
  return valore
}

function dettagliParametri(db: Db, lavorazioneId: number): Dettaglio[] {
  const righe = valoriLeggibili(db, lavorazioneId)
  const out: Dettaglio[] = []
  const dateViste = new Set<string>()
  for (const r of righe) {
    if (r.data_gruppo && !dateViste.has(r.gruppo)) {
      dateViste.add(r.gruppo)
      out.push({ etichetta: `${r.gruppo} · data`, valore: data(r.data_gruppo) })
    }
    out.push({ etichetta: `${r.gruppo} · ${r.parametro}`, valore: valoreParametro(r.tipo, r.valore, r.unita) })
  }
  return out
}

function d(etichetta: string, valore: string | null | undefined): Dettaglio | null {
  return valore === null || valore === undefined || valore === '' ? null : { etichetta, valore }
}

function nodo(
  chiave: string,
  tipo: TipoNodo,
  titolo: string,
  sottotitolo: string | null,
  dettagli: Array<Dettaglio | null>,
  figli: NodoTraccia[] = []
): NodoTraccia {
  return { chiave, tipo, titolo, sottotitolo, dettagli: dettagli.filter((x): x is Dettaglio => x !== null), figli }
}

// ── Costruttore ──────────────────────────────────────────────────────────────

class Tracciatore {
  private percorso = new Set<string>()
  private contatore = 0

  constructor(
    private readonly db: Db,
    private readonly dir: DirezioneTraccia
  ) {}

  /** Evita cicli e alberi infiniti: un nodo già presente nel percorso corrente non si riespande. */
  private espandi(chiave: string, livello: number, fn: () => NodoTraccia[]): NodoTraccia[] {
    if (this.percorso.has(chiave) || livello > PROFONDITA_MAX) return []
    this.percorso.add(chiave)
    try {
      return fn()
    } finally {
      this.percorso.delete(chiave)
    }
  }

  private chiave(base: string): string {
    this.contatore += 1
    return `${base}#${this.contatore}`
  }

  // ── Lotto ──

  lotto(id: number, livello: number, usato: { quantita: number; unita: string } | null = null): NodoTraccia | null {
    const l = this.db
      .prepare(
        `SELECT l.id, l.lotto_fornitore, l.data_carico, l.data_scadenza, l.quantita_iniziale, l.quantita_residua,
                l.origine_tipo, l.origine_id, l.stagione, l.calibro, mp.nome, mp.categoria, mp.unita_misura
         FROM lotti_materie_prime l JOIN materie_prime mp ON mp.id = l.materia_prima_id WHERE l.id = ?`
      )
      .get(id) as
      | {
          id: number
          lotto_fornitore: string | null
          data_carico: string | null
          data_scadenza: string | null
          quantita_iniziale: number
          quantita_residua: number
          origine_tipo: string | null
          origine_id: number | null
          stagione: string | null
          calibro: string | null
          nome: string
          categoria: string
          unita_misura: string
        }
      | undefined
    if (!l) return null
    const origine = l.origine_tipo ?? 'acquisto'
    const etichettaOrigine: Record<string, string> = {
      acquisto: 'acquistato',
      raccolta: 'da raccolta',
      calibratura: 'da calibratura',
      maltazione: 'da maltazione'
    }
    const figli = this.espandi(`lotto-${id}`, livello, () => {
      if (this.dir === 'indietro') {
        if (origine === 'raccolta' && l.origine_id !== null) return this.unico(this.raccolta(l.origine_id, livello + 1))
        if (origine === 'calibratura' && l.origine_id !== null) return this.unico(this.calibratura(l.origine_id, livello + 1))
        if (origine === 'maltazione' && l.origine_id !== null) return this.unico(this.maltazione(l.origine_id, livello + 1))
        return []
      }
      return this.usiDelLotto(id, livello + 1)
    })
    return nodo(
      this.chiave(`lotto-${id}`),
      'lotto',
      `${l.nome} · lotto ${l.lotto_fornitore || '#' + l.id}`,
      `${ETICHETTE_CATEGORIA[l.categoria] ?? l.categoria}, ${etichettaOrigine[origine] ?? origine}`,
      [
        usato ? d('Quantità usata', qta(usato.quantita, usato.unita)) : null,
        d('Quantità caricata', qta(l.quantita_iniziale, l.unita_misura)),
        d('Residuo', qta(l.quantita_residua, l.unita_misura)),
        d('Data di carico', data(l.data_carico)),
        d('Scadenza', l.data_scadenza ? data(l.data_scadenza) : null),
        d('Calibro', l.calibro),
        d('Stagione', l.stagione)
      ],
      figli
    )
  }

  private unico(n: NodoTraccia | null): NodoTraccia[] {
    return n ? [n] : []
  }

  /** In avanti: dove è stato usato un lotto (lavorazioni, cotte, semine/operazioni). */
  private usiDelLotto(lottoId: number, livello: number): NodoTraccia[] {
    const out: NodoTraccia[] = []
    const lavorazioni = this.db
      .prepare(
        `SELECT i.lavorazione_id, lv.tipo FROM agri_lavorazione_input i JOIN agri_lavorazioni lv ON lv.id = i.lavorazione_id
         WHERE i.lotto_id = ? ORDER BY lv.data_inizio, lv.id`
      )
      .all(lottoId) as Array<{ lavorazione_id: number; tipo: string }>
    for (const lv of lavorazioni) {
      const n = lv.tipo === 'calibratura' ? this.calibratura(lv.lavorazione_id, livello) : this.maltazione(lv.lavorazione_id, livello)
      if (n) out.push(n)
    }
    const cotte = this.db
      .prepare(`SELECT DISTINCT cotta_id FROM cotta_materie_prime WHERE lotto_materia_prima_id = ? ORDER BY cotta_id`)
      .all(lottoId) as Array<{ cotta_id: number }>
    for (const c of cotte) {
      const n = this.cotta(c.cotta_id, livello)
      if (n) out.push(n)
    }
    const consumi = this.db
      .prepare(`SELECT DISTINCT rif_tipo, rif_id FROM agri_consumi WHERE lotto_id = ? ORDER BY id`)
      .all(lottoId) as Array<{ rif_tipo: 'semina' | 'operazione'; rif_id: number }>
    for (const c of consumi) {
      const n = c.rif_tipo === 'semina' ? this.semina(c.rif_id, livello) : this.operazione(c.rif_id, livello)
      if (n) out.push(n)
    }
    return out
  }

  // ── Lavorazioni ──

  private ingressiOUscite(lavId: number, livello: number): NodoTraccia[] {
    if (this.dir === 'indietro') {
      const ingressi = this.db
        .prepare(
          `SELECT i.lotto_id, i.quantita, mp.unita_misura FROM agri_lavorazione_input i
           JOIN lotti_materie_prime l ON l.id = i.lotto_id JOIN materie_prime mp ON mp.id = l.materia_prima_id
           WHERE i.lavorazione_id = ? ORDER BY i.id`
        )
        .all(lavId) as Array<{ lotto_id: number; quantita: number; unita_misura: string }>
      return ingressi
        .map((i) => this.lotto(i.lotto_id, livello, { quantita: i.quantita, unita: i.unita_misura }))
        .filter((x): x is NodoTraccia => x !== null)
    }
    const uscite = this.db
      .prepare(`SELECT lotto_id FROM agri_lavorazione_output WHERE lavorazione_id = ? AND lotto_id IS NOT NULL ORDER BY ordine, id`)
      .all(lavId) as Array<{ lotto_id: number }>
    return uscite.map((u) => this.lotto(u.lotto_id, livello)).filter((x): x is NodoTraccia => x !== null)
  }

  raccolta(id: number, livello: number): NodoTraccia | null {
    const r = this.db
      .prepare(
        `SELECT lv.codice, lv.data_inizio, lv.semina_id, lv.stagione, o.quantita, mp.unita_misura, mp.nome
         FROM agri_lavorazioni lv
         LEFT JOIN agri_lavorazione_output o ON o.lavorazione_id = lv.id
         LEFT JOIN materie_prime mp ON mp.id = lv.materia_prima_id
         WHERE lv.id = ? AND lv.tipo = 'raccolta'`
      )
      .get(id) as
      | { codice: string | null; data_inizio: string; semina_id: number | null; stagione: string; quantita: number | null; unita_misura: string | null; nome: string | null }
      | undefined
    if (!r) return null
    const carenza = r.semina_id !== null ? verificaCarenza(this.db, r.semina_id, r.data_inizio) : []
    const figli = this.espandi(`raccolta-${id}`, livello, () => {
      if (this.dir === 'indietro') return r.semina_id !== null ? this.unico(this.semina(r.semina_id, livello + 1)) : []
      return this.ingressiOUscite(id, livello + 1)
    })
    return nodo(
      this.chiave(`raccolta-${id}`),
      'raccolta',
      `Raccolta ${r.codice ?? ''}`.trim(),
      `${data(r.data_inizio)} · ${r.nome ?? ''}`,
      [
        d('Data', data(r.data_inizio)),
        d('Quantità raccolta', qta(r.quantita, r.unita_misura)),
        d('Stagione', r.stagione),
        ...carenza.map((c) =>
          d('Attenzione', `raccolta dentro il tempo di carenza di ${c.prodotto} (fino al ${data(c.fine_carenza)})`)
        ),
        ...dettagliParametri(this.db, id)
      ],
      figli
    )
  }

  calibratura(id: number, livello: number): NodoTraccia | null {
    const c = this.db
      .prepare(`SELECT codice, data_inizio, stagione FROM agri_lavorazioni WHERE id = ? AND tipo = 'calibratura'`)
      .get(id) as { codice: string | null; data_inizio: string; stagione: string } | undefined
    if (!c) return null
    const frazioni = this.db
      .prepare(
        `SELECT o.nome, o.percentuale, o.quantita, o.scarto, o.peso_specifico_gl, mp.unita_misura
         FROM agri_lavorazione_output o JOIN agri_lavorazioni lv ON lv.id = o.lavorazione_id
         LEFT JOIN materie_prime mp ON mp.id = lv.materia_prima_id
         WHERE o.lavorazione_id = ? ORDER BY o.ordine`
      )
      .all(id) as Array<{ nome: string; percentuale: number | null; quantita: number; scarto: number; peso_specifico_gl: number | null; unita_misura: string | null }>
    const figli = this.espandi(`calibratura-${id}`, livello, () => this.ingressiOUscite(id, livello + 1))
    return nodo(
      this.chiave(`calibratura-${id}`),
      'calibratura',
      `Analisi e calibratura del lotto ${c.codice ?? ''}`.trim(),
      data(c.data_inizio),
      [
        d('Data', data(c.data_inizio)),
        d('Stagione', c.stagione),
        ...dettagliParametri(this.db, id),
        ...frazioni.map((f) =>
          d(
            `Frazione ${f.nome}`,
            `${num(f.percentuale)}% · ${qta(f.quantita, f.unita_misura)}${f.peso_specifico_gl !== null ? ` · ${num(f.peso_specifico_gl)} g/L` : ''}${f.scarto ? ' · scarto' : ''}`
          )
        )
      ],
      figli
    )
  }

  maltazione(id: number, livello: number): NodoTraccia | null {
    const m = this.db
      .prepare(
        `SELECT lv.codice, lv.data_inizio, lv.data_fine, lv.stato, lv.stagione, mp.nome,
                (SELECT SUM(quantita_kg) FROM agri_lavorazione_input WHERE lavorazione_id = lv.id) AS kg_in,
                (SELECT SUM(quantita_kg) FROM agri_lavorazione_output WHERE lavorazione_id = lv.id AND lotto_id IS NOT NULL) AS kg_out
         FROM agri_lavorazioni lv LEFT JOIN materie_prime mp ON mp.id = lv.materia_prima_id
         WHERE lv.id = ? AND lv.tipo = 'maltazione'`
      )
      .get(id) as
      | { codice: string | null; data_inizio: string; data_fine: string | null; stato: string; stagione: string; nome: string | null; kg_in: number | null; kg_out: number | null }
      | undefined
    if (!m) return null
    const rese = reseMaltazione(this.db, id)
    const figli = this.espandi(`maltazione-${id}`, livello, () => this.ingressiOUscite(id, livello + 1))
    return nodo(
      this.chiave(`maltazione-${id}`),
      'maltazione',
      `Maltazione ${m.codice ?? ''}`.trim(),
      `${m.nome ?? ''}${m.stato === 'in_corso' ? ' · in corso' : ''}`,
      [
        d('Inizio', data(m.data_inizio)),
        d('Uscita', m.data_fine ? data(m.data_fine) : 'in corso'),
        d('Peso iniziale', qta(m.kg_in, 'kg')),
        d('Peso finale', m.kg_out !== null ? qta(m.kg_out, 'kg') : null),
        d('Resa di maltazione', rese.resa_maltazione !== null ? perc(rese.resa_maltazione) : null),
        d('Resa complessiva', rese.resa_complessiva !== null ? perc(rese.resa_complessiva) : null),
        d('Scarto di calibratura', rese.perc_scarto_calibratura !== null ? perc(rese.perc_scarto_calibratura) : null),
        d('Stagione', m.stagione),
        ...dettagliParametri(this.db, id)
      ],
      figli
    )
  }

  // ── Campo, semina, operazioni ──

  campo(id: number, livello: number): NodoTraccia | null {
    const c = this.db
      .prepare(`SELECT nome, superficie_ha, localita, rif_catastale FROM agri_campi WHERE id = ?`)
      .get(id) as { nome: string; superficie_ha: number | null; localita: string | null; rif_catastale: string | null } | undefined
    if (!c) return null
    const figli = this.espandi(`campo-${id}`, livello, () => {
      if (this.dir === 'indietro') return []
      const semine = this.db.prepare(`SELECT id FROM agri_semine WHERE campo_id = ? ORDER BY data, id`).all(id) as Array<{ id: number }>
      return semine.map((s) => this.semina(s.id, livello + 1)).filter((x): x is NodoTraccia => x !== null)
    })
    return nodo(
      this.chiave(`campo-${id}`),
      'campo',
      nomeCampo(c.nome),
      c.localita,
      [
        d('Superficie', c.superficie_ha !== null ? `${num(c.superficie_ha)} ha` : null),
        d('Località', c.localita),
        d('Riferimento catastale', c.rif_catastale)
      ],
      figli
    )
  }

  semina(id: number, livello: number): NodoTraccia | null {
    const s = this.db
      .prepare(
        `SELECT s.campo_id, s.stagione, s.coltura, s.varieta, s.data, s.superficie_ha, s.semente_testo, c.nome AS campo
         FROM agri_semine s JOIN agri_campi c ON c.id = s.campo_id WHERE s.id = ?`
      )
      .get(id) as
      | { campo_id: number; stagione: string; coltura: string; varieta: string | null; data: string; superficie_ha: number | null; semente_testo: string | null; campo: string }
      | undefined
    if (!s) return null
    const semente = consumiDi(this.db, 'semina', id)
    const figli = this.espandi(`semina-${id}`, livello, () => {
      if (this.dir === 'indietro') {
        const out: NodoTraccia[] = [...this.unico(this.campo(s.campo_id, livello + 1))]
        const operazioni = this.db
          .prepare(`SELECT id FROM agri_operazioni WHERE semina_id = ? ORDER BY data, id`)
          .all(id) as Array<{ id: number }>
        if (operazioni.length > 0) {
          out.push(
            nodo(
              this.chiave(`operazioni-${id}`),
              'gruppo',
              'Operazioni di campo',
              `${operazioni.length} ${operazioni.length === 1 ? 'operazione' : 'operazioni'}`,
              [],
              operazioni.map((o) => this.operazione(o.id, livello + 2)).filter((x): x is NodoTraccia => x !== null)
            )
          )
        }
        for (const l of semente) {
          const n = this.lotto(l.lotto_id, livello + 1, { quantita: l.quantita, unita: l.unita_misura })
          if (n) out.push(n)
        }
        return out
      }
      const raccolte = this.db
        .prepare(`SELECT id FROM agri_lavorazioni WHERE tipo = 'raccolta' AND semina_id = ? ORDER BY data_inizio, id`)
        .all(id) as Array<{ id: number }>
      return raccolte.map((r) => this.raccolta(r.id, livello + 1)).filter((x): x is NodoTraccia => x !== null)
    })
    const coltura = s.coltura === 'orzo' ? 'Orzo' : 'Luppolo'
    return nodo(
      this.chiave(`semina-${id}`),
      'semina',
      `Semina ${coltura}${s.varieta ? ` ${s.varieta}` : ''}`,
      `${s.campo} · ${data(s.data)}`,
      [
        d('Data', data(s.data)),
        d('Stagione', s.stagione),
        d('Superficie seminata', s.superficie_ha !== null ? `${num(s.superficie_ha)} ha` : null),
        d(
          'Semente',
          semente.length > 0
            ? semente.map((l) => `${l.materia_prima_nome} · lotto ${l.lotto_codice} · ${qta(l.quantita, l.unita_misura)}`).join('; ')
            : s.semente_testo
        )
      ],
      figli
    )
  }

  operazione(id: number, livello: number): NodoTraccia | null {
    const o = this.db
      .prepare(
        `SELECT o.semina_id, o.tipo, o.data, o.quantita, o.motivo, o.operatore, o.note, s.superficie_ha,
                mp.nome AS prodotto, mp.unita_misura, mp.tempo_carenza_giorni
         FROM agri_operazioni o JOIN agri_semine s ON s.id = o.semina_id
         LEFT JOIN materie_prime mp ON mp.id = o.materia_prima_id WHERE o.id = ?`
      )
      .get(id) as
      | { semina_id: number; tipo: string; data: string; quantita: number | null; motivo: string | null; operatore: string | null; note: string | null; superficie_ha: number | null; prodotto: string | null; unita_misura: string | null; tempo_carenza_giorni: number | null }
      | undefined
    if (!o) return null
    const lotti = consumiDi(this.db, 'operazione', id)
    const figli = this.espandi(`operazione-${id}`, livello, () => {
      if (this.dir === 'indietro') return []
      return this.unico(this.semina(o.semina_id, livello + 1))
    })
    const tipo = TIPI_OPERAZIONE.find((t) => t.valore === o.tipo)?.etichetta ?? o.tipo
    const dose = doseEttaro(o.quantita, o.superficie_ha)
    return nodo(
      this.chiave(`operazione-${id}`),
      'operazione',
      `${tipo} del ${data(o.data)}`,
      o.motivo,
      [
        d(
          'Prodotto',
          o.prodotto
            ? `${o.prodotto}${lotti.length > 0 ? ` · lotto ${lotti.map((l) => l.lotto_codice).join(', ')}` : ''} · ${qta(o.quantita, o.unita_misura)}`
            : null
        ),
        d('Dose per ettaro', dose !== null ? `${num(dose)} ${o.unita_misura ?? ''}/ha` : null),
        d(
          'Fine carenza',
          o.tipo === 'trattamento' && o.tempo_carenza_giorni && o.tempo_carenza_giorni > 0
            ? data(aggiungiGiorni(o.data, o.tempo_carenza_giorni))
            : null
        ),
        d('Motivo', o.motivo),
        d('Operatore', o.operatore),
        d('Note', o.note)
      ],
      figli
    )
  }

  // ── Cotte e vendite ──

  cotta(id: number, livello: number): NodoTraccia | null {
    const c = this.db
      .prepare(
        `SELECT c.numero_lotto, c.data_inizio, c.data_confezionamento, c.litri_teorici, c.stato, b.nome AS birra,
                conf.bottiglie_prodotte, conf.data_scadenza
         FROM cotte c JOIN birre b ON b.id = c.birra_id LEFT JOIN confezionamento conf ON conf.cotta_id = c.id
         WHERE c.id = ?`
      )
      .get(id) as
      | { numero_lotto: string; data_inizio: string; data_confezionamento: string | null; litri_teorici: number | null; stato: string; birra: string; bottiglie_prodotte: number | null; data_scadenza: string | null }
      | undefined
    if (!c) return null
    const figli = this.espandi(`cotta-${id}`, livello, () => (this.dir === 'indietro' ? this.ingredientiCotta(id, livello + 1) : this.venditeCotta(id)))
    return nodo(
      this.chiave(`cotta-${id}`),
      'cotta',
      `Cotta ${c.numero_lotto}`,
      c.birra,
      [
        d('Inizio', data(c.data_inizio)),
        d('Confezionamento', c.data_confezionamento ? data(c.data_confezionamento) : null),
        d('Litri teorici', c.litri_teorici !== null ? `${num(c.litri_teorici)} L` : null),
        d('Bottiglie prodotte', c.bottiglie_prodotte !== null ? num(c.bottiglie_prodotte, 0) : null),
        d('Scadenza', c.data_scadenza ? data(c.data_scadenza) : null),
        d('Stato', c.stato === 'confezionata' ? 'confezionata' : 'in corso')
      ],
      figli
    )
  }

  private ingredientiCotta(id: number, livello: number): NodoTraccia[] {
    const righe = this.db
      .prepare(
        `SELECT cmp.lotto_materia_prima_id AS lotto_id, SUM(cmp.quantita_usata) AS quantita, mp.unita_misura
         FROM cotta_materie_prime cmp JOIN materie_prime mp ON mp.id = cmp.materia_prima_id
         WHERE cmp.cotta_id = ? GROUP BY cmp.lotto_materia_prima_id ORDER BY MIN(cmp.id)`
      )
      .all(id) as Array<{ lotto_id: number; quantita: number; unita_misura: string }>
    const out = righe
      .map((r) => this.lotto(r.lotto_id, livello, { quantita: r.quantita, unita: r.unita_misura }))
      .filter((x): x is NodoTraccia => x !== null)
    const imballi = lottiImballiCotta(this.db, id)
    if (imballi.length > 0) {
      out.push(
        nodo(
          this.chiave(`imballi-${id}`),
          'gruppo',
          'Imballi (HACCP)',
          `${imballi.length} ${imballi.length === 1 ? 'lotto' : 'lotti'}`,
          [],
          imballi.map((i) =>
            nodo(
              this.chiave(`imballo-${i.movimento_id}`),
              'imballo',
              i.materiale_nome,
              `${i.lotto_fornitore ? `lotto ${i.lotto_fornitore}` : 'carico senza lotto'}${i.fornitore ? ` · ${i.fornitore}` : ''}`,
              [d('Ricevuto il', data(i.data)), d('Quantità del carico', num(i.quantita, 0))]
            )
          )
        )
      )
    }
    return out
  }

  private venditeCotta(id: number): NodoTraccia[] {
    const righe = this.db
      .prepare(
        `SELECT v.id, v.data, COALESCE(v.omaggio, 0) AS omaggio, cl.nome AS cliente, vd.tipo_prodotto, vd.quantita,
                mc.nome AS formato
         FROM vendita_dettaglio vd JOIN vendite v ON v.id = vd.vendita_id
         LEFT JOIN clienti cl ON cl.id = v.cliente_id
         LEFT JOIN materiali_confezionamento mc ON mc.id = vd.materiale_id
         WHERE vd.cotta_id = ? ORDER BY v.data, v.id`
      )
      .all(id) as Array<{ id: number; data: string; omaggio: number; cliente: string | null; tipo_prodotto: string; quantita: number; formato: string | null }>
    const perVendita = new Map<number, typeof righe>()
    for (const r of righe) perVendita.set(r.id, [...(perVendita.get(r.id) ?? []), r])
    return [...perVendita.entries()].map(([venditaId, rr]) => {
      const prima = rr[0]
      const quantita = rr
        .map((r) =>
          r.tipo_prodotto === 'fusto'
            ? `${num(r.quantita, 0)} ${r.quantita === 1 ? 'fusto' : 'fusti'}${r.formato ? ` ${r.formato}` : ''}`
            : `${num(r.quantita, 0)} ${r.quantita === 1 ? 'bottiglia' : 'bottiglie'}`
        )
        .join(', ')
      return nodo(
        this.chiave(`vendita-${venditaId}`),
        'vendita',
        `Vendita a ${prima.cliente ?? 'cliente non indicato'}`,
        `${data(prima.data)}${prima.omaggio ? ' · omaggio' : ''}`,
        [d('Data', data(prima.data)), d('Quantità', quantita)]
      )
    })
  }
}

// ── API ──────────────────────────────────────────────────────────────────────

export function traccia(
  db: Db,
  partenza: { tipo: PartenzaTraccia['tipo']; id: number },
  direzione: DirezioneTraccia
): NodoTraccia[] {
  const t = new Tracciatore(db, direzione)
  const radice =
    partenza.tipo === 'cotta'
      ? t.cotta(partenza.id, 1)
      : partenza.tipo === 'lotto'
        ? t.lotto(partenza.id, 1)
        : partenza.tipo === 'campo'
          ? t.campo(partenza.id, 1)
          : t.semina(partenza.id, 1)
  return radice ? [radice] : []
}

/** Punti di partenza per la ricerca: cotte, lotti, campi, semine. Testo vuoto = i più recenti. */
export function cercaPartenze(db: Db, testo: string): PartenzaTraccia[] {
  const t = (testo ?? '').trim()
  const like = `%${t}%`
  const vuoto = t === ''
  const cotte = db
    .prepare(
      `SELECT c.id, c.numero_lotto, c.data_inizio, b.nome AS birra FROM cotte c JOIN birre b ON b.id = c.birra_id
       WHERE ? = 1 OR c.numero_lotto LIKE ? OR b.nome LIKE ?
       ORDER BY c.data_inizio DESC, c.id DESC LIMIT ?`
    )
    .all(vuoto ? 1 : 0, like, like, vuoto ? 8 : 15) as Array<{ id: number; numero_lotto: string; data_inizio: string; birra: string }>
  const lotti = db
    .prepare(
      `SELECT l.id, l.lotto_fornitore, l.origine_tipo, mp.nome, mp.categoria FROM lotti_materie_prime l
       JOIN materie_prime mp ON mp.id = l.materia_prima_id
       WHERE (? = 1 AND l.origine_tipo <> 'acquisto') OR (? = 0 AND l.lotto_fornitore LIKE ?)
       ORDER BY l.id DESC LIMIT ?`
    )
    .all(vuoto ? 1 : 0, vuoto ? 1 : 0, like, vuoto ? 8 : 15) as Array<{ id: number; lotto_fornitore: string | null; origine_tipo: string; nome: string; categoria: string }>
  const campi = db
    .prepare(`SELECT id, nome, localita FROM agri_campi WHERE ? = 1 OR nome LIKE ? ORDER BY attivo DESC, nome LIMIT 15`)
    .all(vuoto ? 1 : 0, like) as Array<{ id: number; nome: string; localita: string | null }>
  const semine = vuoto
    ? []
    : (db
        .prepare(
          `SELECT s.id, s.coltura, s.varieta, s.data, s.stagione, c.nome AS campo FROM agri_semine s
           JOIN agri_campi c ON c.id = s.campo_id WHERE c.nome LIKE ? OR s.varieta LIKE ? ORDER BY s.data DESC LIMIT 10`
        )
        .all(like, like) as Array<{ id: number; coltura: string; varieta: string | null; data: string; stagione: string; campo: string }>)
  return [
    ...cotte.map((c) => ({ tipo: 'cotta' as const, id: c.id, etichetta: `Cotta ${c.numero_lotto}`, sottotitolo: `${c.birra} · ${data(c.data_inizio)}` })),
    ...lotti.map((l) => ({
      tipo: 'lotto' as const,
      id: l.id,
      etichetta: `${l.lotto_fornitore || '#' + l.id} · ${l.nome}`,
      sottotitolo: ETICHETTE_CATEGORIA[l.categoria] ?? l.categoria
    })),
    ...campi.map((c) => ({ tipo: 'campo' as const, id: c.id, etichetta: nomeCampo(c.nome), sottotitolo: c.localita ?? 'campo' })),
    ...semine.map((s) => ({
      tipo: 'semina' as const,
      id: s.id,
      etichetta: `Semina ${s.coltura === 'orzo' ? 'orzo' : 'luppolo'}${s.varieta ? ` ${s.varieta}` : ''}`,
      sottotitolo: `${s.campo} · ${data(s.data)} · ${s.stagione}`
    }))
  ]
}
