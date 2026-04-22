/**
 * Knowledge base statica sulle schermate e funzionalita' di Fermento.
 *
 * Il file e' curato a mano (non legge il DB): cosi' non contiene MAI dati
 * del birrificio e puo' essere mostrato integralmente a qualsiasi provider
 * LLM senza rischi di privacy.
 *
 * Ogni voce descrive una schermata dell'app, cosa ci si fa, e come
 * arrivarci. La ricerca e' uno scoring semplice su parole chiave (niente
 * embedding: basta e funziona offline).
 */

/** Id delle sezioni navigabili, deve combaciare con Sezione in Layout.tsx. */
export type SezioneId =
  | 'dashboard'
  | 'magazzino-mp'
  | 'magazzino-conf'
  | 'produzione'
  | 'prodotto-finito'
  | 'clienti'
  | 'vendite'
  | 'report'
  | 'avvisi'
  | 'impostazioni'

export const SEZIONI_VALIDE: SezioneId[] = [
  'dashboard',
  'magazzino-mp',
  'magazzino-conf',
  'produzione',
  'prodotto-finito',
  'clienti',
  'vendite',
  'report',
  'avvisi',
  'impostazioni'
]

export type DocEntry = {
  sezione: SezioneId
  titolo: string
  descrizione: string
  /** Come si accede dalla navigation laterale. */
  percorso: string
  /** Operazioni tipiche che si fanno qui. */
  azioni: string[]
  /** Parole chiave aggiuntive per il matching (lowercase). */
  tags: string[]
}

export const DOCS: DocEntry[] = [
  {
    sezione: 'dashboard',
    titolo: 'Dashboard',
    descrizione:
      'Panoramica dello stato del birrificio: numero avvisi attivi, cotte in corso, lotti in scadenza, cotte producibili per ogni birra (calcolate dalle giacenze di materia prima) e la birra piu\' venduta.',
    percorso: 'Prima voce della sidebar ("Dashboard").',
    azioni: [
      'vedere a colpo d\'occhio i KPI principali',
      'cliccare sul riquadro "Avvisi" per saltare alla lista avvisi'
    ],
    tags: ['home', 'sintesi', 'riepilogo', 'kpi', 'panoramica', 'cruscotto']
  },
  {
    sezione: 'magazzino-mp',
    titolo: 'Magazzino materie prime',
    descrizione:
      'Elenco delle materie prime (malti, luppoli, lieviti, additivi, ecc.) con giacenze totali e soglie di riordino. Per ogni MP e\' possibile vedere i lotti caricati, la loro scadenza e la quantita\' residua.',
    percorso: 'Sidebar → "Magazzino materie prime".',
    azioni: [
      'creare/modificare una materia prima (categoria, unita\' di misura, soglia di riordino, fornitore)',
      'registrare un nuovo carico (lotto fornitore, data scadenza, quantita\')',
      'vedere i lotti attivi di una MP e modificare o eliminare un lotto esistente',
      'controllare quali MP sono sotto soglia o con lotti in scadenza'
    ],
    tags: [
      'materie prime',
      'mp',
      'malto',
      'luppolo',
      'lievito',
      'ingredienti',
      'carico',
      'lotto',
      'lotti',
      'scadenza',
      'fornitore',
      'soglia',
      'riordino'
    ]
  },
  {
    sezione: 'magazzino-conf',
    titolo: 'Magazzino confezionamento',
    descrizione:
      'Materiali di confezionamento: bottiglie, tappi, etichette, cartoni, fusti. Giacenze, soglie di riordino e movimenti (carichi/scarichi).',
    percorso: 'Sidebar → "Magazzino confezionamento".',
    azioni: [
      'creare un nuovo materiale di confezionamento (bottiglia/tappo/etichetta/fusto)',
      'caricare quantita\' di un materiale',
      'modificare la soglia di riordino',
      'vedere i movimenti storici e correggere/eliminare un movimento'
    ],
    tags: [
      'confezionamento',
      'bottiglie',
      'tappi',
      'etichette',
      'cartoni',
      'fusti',
      'magazzino',
      'carico confezionamento',
      'scarico confezionamento',
      'movimenti'
    ]
  },
  {
    sezione: 'produzione',
    titolo: 'Produzione (cotte)',
    descrizione:
      'Elenco di tutte le cotte (in corso, confezionate, esaurite). Da qui si avvia una nuova cotta selezionando birra + ricetta + litri + numero lotto: il sistema scarica automaticamente le materie prime dai lotti in base alla ricetta.',
    percorso: 'Sidebar → "Produzione".',
    azioni: [
      'avviare una nuova cotta (seleziona birra, ricetta, data inizio, litri teorici, numero lotto)',
      'aprire il dettaglio di una cotta in corso e vedere le MP usate',
      'confezionare una cotta (bottiglie prodotte, fusti per formato, scarto)',
      'correggere un confezionamento gia\' effettuato'
    ],
    tags: [
      'cotta',
      'cotte',
      'produzione',
      'avviare cotta',
      'nuova cotta',
      'confeziona',
      'confezionare',
      'lotto birra',
      'brew'
    ]
  },
  {
    sezione: 'prodotto-finito',
    titolo: 'Prodotto finito',
    descrizione:
      'Giacenze di prodotto finito (bottiglie sfuse e fusti) per ogni cotta confezionata, con data di scadenza.',
    percorso: 'Sidebar → "Prodotto finito".',
    azioni: [
      'vedere bottiglie e fusti disponibili per lotto/cotta',
      'registrare un carico iniziale (bottiglie e fusti gia\' esistenti prima dell\'uso del gestionale)',
      'togliere bottiglie manualmente (scarto, rottura, assaggio)'
    ],
    tags: [
      'prodotto finito',
      'pf',
      'giacenza birra',
      'bottiglie disponibili',
      'fusti disponibili',
      'scarto',
      'rotture',
      'carico iniziale'
    ]
  },
  {
    sezione: 'clienti',
    titolo: 'Clienti',
    descrizione:
      'Anagrafica clienti (pub, ristoranti, privati) con statistiche di vendita.',
    percorso: 'Sidebar → "Clienti".',
    azioni: [
      'creare/modificare un cliente (nome, tipo, partita IVA, contatti)',
      'disattivare un cliente',
      'vedere lo storico vendite di un cliente',
      'identificare clienti inattivi da un certo periodo'
    ],
    tags: ['clienti', 'anagrafica', 'cliente', 'pub', 'ristoranti', 'inattivi', 'storico']
  },
  {
    sezione: 'vendite',
    titolo: 'Vendite',
    descrizione:
      'Registrazione delle vendite. Ogni vendita e\' legata a un cliente (o e\' un omaggio/assaggio) e contiene righe con bottiglie/fusti di cotte specifiche. Il sistema scala le giacenze di prodotto finito in automatico.',
    percorso: 'Sidebar → "Vendite".',
    azioni: [
      'registrare una nuova vendita (cliente, data, righe bottiglie/fusti)',
      'marcare una vendita come omaggio',
      'modificare o eliminare una vendita esistente',
      'vedere elenco vendite con totali per bottiglie/fusti'
    ],
    tags: [
      'vendita',
      'vendite',
      'registra vendita',
      'fatturare',
      'omaggio',
      'assaggio',
      'scarico pf',
      'modifica vendita'
    ]
  },
  {
    sezione: 'report',
    titolo: 'Report',
    descrizione:
      'Report periodici: produzione (cotte e litri), vendite per cliente, vendite per birra, trend mensile, omaggi.',
    percorso: 'Sidebar → "Report".',
    azioni: [
      'selezionare intervallo da/a',
      'vedere cotte e litri prodotti per birra',
      'vedere vendite per cliente (bottiglie, fusti, numero vendite)',
      'vedere vendite per birra',
      'vedere trend mensile',
      'elencare gli omaggi'
    ],
    tags: [
      'report',
      'statistiche',
      'trend',
      'periodo',
      'analisi',
      'vendite per cliente',
      'vendite per birra',
      'omaggi'
    ]
  },
  {
    sezione: 'avvisi',
    titolo: 'Avvisi',
    descrizione:
      'Lista degli avvisi attivi (scorte basse, lotti in scadenza, clienti inattivi, cotte non producibili, prodotto finito in scadenza). In cima c\'e\' il pannello "Consigli di Bira": un\'analisi AI che raggruppa segnali correlati e suggerisce azioni concrete.',
    percorso: 'Sidebar → "Avvisi".',
    azioni: [
      'rigenerare gli avvisi',
      'filtrare per tipo',
      'segnare un avviso come letto o risolto',
      'cliccare "Analizza con Bira" per ottenere raccomandazioni AI prioritizzate'
    ],
    tags: [
      'avvisi',
      'allarmi',
      'segnali',
      'scorta bassa',
      'scadenza',
      'cliente inattivo',
      'consigli bira',
      'raccomandazioni'
    ]
  },
  {
    sezione: 'impostazioni',
    titolo: 'Impostazioni',
    descrizione:
      'Configurazioni generali, gestione birre e ricette, cambio password, assistente AI (provider, modello, API key Groq, tool abilitati), backup.',
    percorso: 'Sidebar → "Impostazioni".',
    azioni: [
      'modificare i parametri globali (finestra scadenze, giorni per cliente inattivo, nome birrificio)',
      'creare/modificare una birra (nome, stile, descrizione, attiva)',
      'definire o modificare la ricetta attiva di una birra (elenco ingredienti e quantita\')',
      'configurare l\'assistente AI: scegliere provider (ollama/groq), modello, API key, timeout',
      'cambiare la password di accesso',
      'configurare il percorso di backup, eseguire backup manuale, ripristinare un backup'
    ],
    tags: [
      'impostazioni',
      'settings',
      'configurazione',
      'birra',
      'ricetta',
      'ricette',
      'password',
      'backup',
      'ripristino',
      'assistente ai',
      'bira',
      'provider',
      'api key',
      'groq',
      'ollama'
    ]
  }
]

// ---------------------------------------------------------------------------
// Ricerca: scoring semplice su token
// ---------------------------------------------------------------------------

function tokenize(s: string): string[] {
  return (s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2)
}

const STOPWORDS = new Set([
  'come',
  'cosa',
  'dove',
  'perche',
  'quando',
  'che',
  'chi',
  'del',
  'della',
  'dei',
  'delle',
  'dal',
  'dalla',
  'dai',
  'dalle',
  'per',
  'con',
  'sul',
  'sulla',
  'sui',
  'sulle',
  'fra',
  'tra',
  'uno',
  'una',
  'gli',
  'lo',
  'la',
  'il',
  'le',
  'non',
  'piu',
  'sono',
  'posso',
  'puoi',
  'voglio',
  'vorrei',
  'fare',
  'faccio',
  'fai',
  'qui',
  'questo',
  'questa',
  'quello',
  'quella',
  'esse',
  'essa',
  'app'
])

function utileToken(t: string): boolean {
  return !STOPWORDS.has(t) && t.length > 2
}

function scoreDoc(doc: DocEntry, queryTokens: string[]): number {
  const corpus =
    [
      doc.titolo,
      doc.descrizione,
      doc.percorso,
      doc.azioni.join(' '),
      doc.tags.join(' '),
      doc.sezione
    ]
      .join(' ')
      .toLowerCase()
  let score = 0
  for (const qt of queryTokens) {
    if (!utileToken(qt)) continue
    // Match esatto nei tag = peso doppio
    if (doc.tags.some((t) => t.includes(qt))) score += 4
    // Match nel titolo = peso forte
    if (doc.titolo.toLowerCase().includes(qt)) score += 3
    // Match in qualsiasi campo = peso base
    if (corpus.includes(qt)) score += 1
  }
  return score
}

export type DocMatch = {
  sezione: SezioneId
  titolo: string
  descrizione: string
  percorso: string
  azioni: string[]
  score: number
}

export function cercaDocs(query: string, maxResults = 3): DocMatch[] {
  const tokens = tokenize(query)
  if (tokens.length === 0) {
    // query vuota: elenco alfabetico
    return DOCS.slice(0, maxResults).map((d) => ({
      sezione: d.sezione,
      titolo: d.titolo,
      descrizione: d.descrizione,
      percorso: d.percorso,
      azioni: d.azioni,
      score: 0
    }))
  }
  const scored = DOCS.map((d) => ({ doc: d, score: scoreDoc(d, tokens) })).filter(
    (x) => x.score > 0
  )
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, maxResults).map(({ doc, score }) => ({
    sezione: doc.sezione,
    titolo: doc.titolo,
    descrizione: doc.descrizione,
    percorso: doc.percorso,
    azioni: doc.azioni,
    score
  }))
}

export function isSezioneValida(s: string): s is SezioneId {
  return (SEZIONI_VALIDE as string[]).includes(s)
}
