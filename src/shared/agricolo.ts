/**
 * Tipi e costanti condivisi del modulo agricolo (main, preload, renderer).
 * Solo dati: nessun import da Electron o dal database.
 */

// ── Categorie e unità ────────────────────────────────────────────────────────

/** Materie prime agricole: stanno nel Magazzino materie prime. */
export const CATEGORIE_MP_AGRICOLE = ['orzo_grezzo', 'orzo_calibrato', 'luppolo_grezzo'] as const
/** Input agricoli: stanno nel Magazzino input agricoli. */
export const CATEGORIE_INPUT_AGRICOLI = ['semente', 'concime', 'fitofarmaco', 'input_altro'] as const

export type CategoriaMpAgricola = (typeof CATEGORIE_MP_AGRICOLE)[number]
export type CategoriaInputAgricolo = (typeof CATEGORIE_INPUT_AGRICOLI)[number]

export const ETICHETTE_CATEGORIA: Record<string, string> = {
  malto: 'Malto',
  luppolo: 'Luppolo',
  lievito: 'Lievito',
  altro: 'Altro',
  orzo_grezzo: 'Orzo grezzo',
  orzo_calibrato: 'Orzo calibrato',
  luppolo_grezzo: 'Luppolo grezzo',
  semente: 'Semente',
  concime: 'Concime',
  fitofarmaco: 'Fitofarmaco',
  input_altro: 'Altro input'
}

/** Unità sempre disponibili. */
export const UNITA_BASE = ['kg', 'g'] as const
/** Unità aggiunte dal modulo agricolo (visibili solo a modulo attivo). */
export const UNITA_AGRICOLE = ['q', 'L'] as const

export const ETICHETTE_UNITA: Record<string, string> = {
  kg: 'kg',
  g: 'g',
  q: 'q (quintali)',
  L: 'L (litri)'
}

export function isCategoriaInputAgricolo(c: string): c is CategoriaInputAgricolo {
  return (CATEGORIE_INPUT_AGRICOLI as readonly string[]).includes(c)
}

export function isCategoriaMpAgricola(c: string): c is CategoriaMpAgricola {
  return (CATEGORIE_MP_AGRICOLE as readonly string[]).includes(c)
}

// ── Stagioni ─────────────────────────────────────────────────────────────────

/** Stagione agraria/maltaria "AAAA/AAAA+1" che parte a luglio (dopo la raccolta). */
export function stagioneDaData(iso: string): string {
  const anno = Number(iso.slice(0, 4))
  const mese = Number(iso.slice(5, 7))
  const inizio = mese >= 7 ? anno : anno - 1
  return `${inizio}/${inizio + 1}`
}

/** "2026/2027" valida; "2026/2028", "2026-2027" no. */
export function stagioneValida(s: string): boolean {
  const m = /^(\d{4})\/(\d{4})$/.exec(s)
  return m !== null && Number(m[2]) === Number(m[1]) + 1
}

// ── Esiti ────────────────────────────────────────────────────────────────────

export type Esito = { ok: true } | { ok: false; errore: string }
export type EsitoId = { ok: true; id: number } | { ok: false; errore: string }

// ── Stato modulo ─────────────────────────────────────────────────────────────

export type StatoModuloAgricolo = {
  attivo: boolean
  stagione_corrente: string
  /** Stagioni presenti nei dati + quella corrente, dalla più recente. */
  stagioni: string[]
}

export type FrazioneDefault = { nome: string; scarto: boolean }

// ── Campi e semine ───────────────────────────────────────────────────────────

export type Coltura = 'orzo' | 'luppolo'

export type CampoPayload = {
  nome: string
  superficie_ha: number | null
  localita: string | null
  rif_catastale: string | null
  note: string | null
}

export type CampoRiga = CampoPayload & {
  id: number
  attivo: number
  semine_stagione: number
  semine_totali: number
}

export type SementeDaMagazzino = {
  materia_prima_id: number
  quantita: number
  /** null = scarico automatico dal lotto che scade prima */
  lotto_id: number | null
}

export type SeminaPayload = {
  campo_id: number
  stagione: string
  coltura: Coltura
  varieta: string | null
  data: string
  superficie_ha: number | null
  semente_testo: string | null
  semente: SementeDaMagazzino | null
  note: string | null
}

export type ConsumoLotto = {
  lotto_id: number
  lotto_codice: string
  materia_prima_id: number
  materia_prima_nome: string
  unita_misura: string
  quantita: number
}

export type SeminaRiga = {
  id: number
  campo_id: number
  campo_nome: string
  stagione: string
  coltura: Coltura
  varieta: string | null
  data: string
  superficie_ha: number | null
  semente_testo: string | null
  note: string | null
  semente: ConsumoLotto[]
  operazioni: number
  raccolte: number
}

// ── Lotti ────────────────────────────────────────────────────────────────────

export type OrigineLotto = 'acquisto' | 'raccolta' | 'calibratura' | 'maltazione'

export type LottoDisponibile = {
  id: number
  materia_prima_id: number
  materia_prima_nome: string
  categoria: string
  unita_misura: string
  codice: string
  data_carico: string | null
  data_scadenza: string | null
  quantita_residua: number
  quantita_iniziale: number
  origine_tipo: OrigineLotto
  stagione: string | null
  calibro: string | null
  tempo_carenza_giorni: number | null
}

// ── Operazioni di campo ──────────────────────────────────────────────────────

export type TipoOperazione = 'concimazione' | 'trattamento' | 'lavorazione' | 'irrigazione' | 'altro'

export const TIPI_OPERAZIONE: Array<{ valore: TipoOperazione; etichetta: string }> = [
  { valore: 'concimazione', etichetta: 'Concimazione' },
  { valore: 'trattamento', etichetta: 'Trattamento' },
  { valore: 'lavorazione', etichetta: 'Lavorazione del terreno' },
  { valore: 'irrigazione', etichetta: 'Irrigazione' },
  { valore: 'altro', etichetta: 'Altro' }
]

export type ProdottoOperazione = {
  materia_prima_id: number
  quantita: number
  lotto_id: number | null
}

export type OperazionePayload = {
  semina_id: number
  tipo: TipoOperazione
  data: string
  prodotto: ProdottoOperazione | null
  motivo: string | null
  operatore: string | null
  note: string | null
}

export type OperazioneRiga = {
  id: number
  semina_id: number
  campo_id: number
  campo_nome: string
  stagione: string
  coltura: Coltura
  varieta: string | null
  superficie_ha: number | null
  tipo: TipoOperazione
  data: string
  materia_prima_id: number | null
  materia_prima_nome: string | null
  categoria: string | null
  unita_misura: string | null
  quantita: number | null
  dose_ha: number | null
  tempo_carenza_giorni: number | null
  fine_carenza: string | null
  motivo: string | null
  operatore: string | null
  note: string | null
  lotti: ConsumoLotto[]
}

// ── Parametri di fase ────────────────────────────────────────────────────────

export type FaseLavorazione = 'raccolta' | 'calibratura' | 'maltazione'
export type TipoParametro = 'numero' | 'testo' | 'scala' | 'si_no'

export const ETICHETTE_FASE: Record<FaseLavorazione, string> = {
  raccolta: 'Raccolta',
  calibratura: 'Analisi e calibratura',
  maltazione: 'Maltazione'
}

export const ETICHETTE_TIPO_PARAMETRO: Record<TipoParametro, string> = {
  numero: 'Numero',
  testo: 'Testo',
  scala: 'Scala da 1 a 10',
  si_no: 'Sì / No'
}

export type Parametro = {
  id: number
  gruppo_id: number
  nome: string
  unita: string | null
  tipo: TipoParametro
  ordine: number
}

export type GruppoParametri = {
  id: number
  fase: FaseLavorazione
  nome: string
  ordine: number
  con_data: boolean
  parametri: Parametro[]
}

export type GruppoPayload = { fase: FaseLavorazione; nome: string; con_data: boolean }
export type ParametroPayload = { gruppo_id: number; nome: string; unita: string | null; tipo: TipoParametro }

export type ValoriParametri = {
  /** parametro_id → valore (stringa; numeri con il punto decimale) */
  valori: Record<number, string>
  /** gruppo_id → data AAAA-MM-GG (solo gruppi con data propria) */
  date: Record<number, string>
}

/** Valore storico di un parametro, anche se nel frattempo è stato nascosto. */
export type ValoreStorico = {
  gruppo: string
  parametro: string
  unita: string | null
  tipo: TipoParametro
  valore: string
}

// ── Lavorazioni (raccolta, calibratura, maltazione) ─────────────────────────

export type StatoLavorazione = 'in_corso' | 'chiusa'

export type RaccoltaPayload = {
  semina_id: number
  data: string
  stagione: string
  materia_prima_id: number
  quantita: number
  codice: string
  data_scadenza: string | null
  note: string | null
}

export type FrazionePayload = {
  nome: string
  percentuale: number
  scarto: boolean
  peso_specifico_gl: number | null
}

export type CalibraturaPayload = {
  lotto_id: number
  data: string
  stagione: string
  quantita: number
  materia_prima_id: number
  frazioni: FrazionePayload[]
  note: string | null
}

export type MaltazioneInput = { lotto_id: number; kg: number }

export type MaltazioneAvviaPayload = {
  data_inizio: string
  stagione: string
  materia_prima_id: number
  codice: string
  input: MaltazioneInput[]
  note: string | null
}

export type MaltazioneChiudiPayload = {
  data_uscita: string
  peso_finale_kg: number
  data_scadenza: string | null
}

export type Rese = {
  resa_maltazione: number | null
  resa_complessiva: number | null
  kg_grezzo_equivalenti: number | null
  perc_scarto_calibratura: number | null
  parziale: boolean
}

export type LavorazioneRiga = {
  id: number
  tipo: FaseLavorazione
  stagione: string
  codice: string | null
  data_inizio: string
  data_fine: string | null
  stato: StatoLavorazione
  materia_prima_id: number | null
  materia_prima_nome: string | null
  unita_misura: string | null
  semina_id: number | null
  campo_nome: string | null
  coltura: Coltura | null
  varieta: string | null
  note: string | null
  /** Somma degli input in kg (null se non convertibile) */
  input_kg: number | null
  /** Somma degli output non scarto in kg */
  output_kg: number | null
  /** Testo breve degli input, es. "1A/2026 (300 q)" */
  input_descrizione: string
  /** Testo breve degli output, es. "3-4 mm 207 q · 4-5 mm 30 q" */
  output_descrizione: string
  /** Avvisi tempo di carenza (solo raccolte) */
  carenza: ViolazioneCarenzaRiga[]
  rese: Rese | null
}

export type InputDettaglio = {
  id: number
  lotto_id: number
  codice: string
  materia_prima_nome: string
  categoria: string
  unita_misura: string
  calibro: string | null
  stagione: string | null
  quantita: number
  quantita_kg: number | null
}

export type OutputDettaglio = {
  id: number
  ordine: number
  nome: string | null
  percentuale: number | null
  quantita: number
  quantita_kg: number | null
  scarto: boolean
  peso_specifico_gl: number | null
  lotto_id: number | null
  lotto_codice: string | null
  lotto_residuo: number | null
  unita_misura: string | null
  /** Motivo per cui il lotto non è più modificabile (usato a valle), o null */
  uso_a_valle: string | null
}

export type LavorazioneDettaglio = LavorazioneRiga & {
  input: InputDettaglio[]
  output: OutputDettaglio[]
  gruppi: GruppoParametri[]
  valori: ValoriParametri
  /** Valori di parametri ormai nascosti, da mostrare come storico */
  valori_storici: ValoreStorico[]
  /** Motivo per cui la lavorazione non si può più modificare/eliminare, o null */
  bloccata: string | null
  data_scadenza_output: string | null
}

export type ViolazioneCarenzaRiga = {
  prodotto: string
  data: string
  giorni: number
  fine_carenza: string
}

// ── Lotti imballi (HACCP) ────────────────────────────────────────────────────

export type CaricoImballo = {
  id: number
  data: string
  quantita: number
  lotto_fornitore: string | null
  fornitore: string | null
  note: string | null
}

export type MaterialeImballo = {
  materiale_id: number
  nome: string
  categoria: string
  carichi: CaricoImballo[]
}

export type LottoImballoRiga = {
  movimento_id: number
  materiale_id: number
  materiale_nome: string
  categoria: string
  data: string
  quantita: number
  lotto_fornitore: string | null
  fornitore: string | null
}

// ── Tracciabilità ────────────────────────────────────────────────────────────

export type TipoNodo =
  | 'cotta'
  | 'lotto'
  | 'maltazione'
  | 'calibratura'
  | 'raccolta'
  | 'semina'
  | 'campo'
  | 'operazione'
  | 'imballo'
  | 'vendita'
  | 'gruppo'

export const ETICHETTE_NODO: Record<TipoNodo, string> = {
  cotta: 'Cotta',
  lotto: 'Lotto',
  maltazione: 'Maltazione',
  calibratura: 'Analisi e calibratura',
  raccolta: 'Raccolta',
  semina: 'Semina',
  campo: 'Campo',
  operazione: 'Operazione di campo',
  imballo: 'Imballo',
  vendita: 'Vendita',
  gruppo: 'Gruppo'
}

export type NodoTraccia = {
  chiave: string
  tipo: TipoNodo
  titolo: string
  sottotitolo: string | null
  dettagli: Array<{ etichetta: string; valore: string }>
  figli: NodoTraccia[]
}

export type PartenzaTraccia = {
  tipo: 'cotta' | 'lotto' | 'campo' | 'semina'
  id: number
  etichetta: string
  sottotitolo: string
}

export type DirezioneTraccia = 'indietro' | 'avanti'
