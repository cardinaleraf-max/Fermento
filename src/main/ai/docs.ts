/**
 * Guida interna di Fermento per Bira.
 *
 * Scritta a mano (non legge il database): non contiene MAI dati del
 * birrificio e può essere inviata al modello senza rischi.
 *
 * Ogni voce descrive una schermata: cosa ci si fa e come arrivarci. La
 * ricerca è un punteggio semplice su parole chiave (funziona offline).
 */

/** Id delle sezioni navigabili: devono combaciare con Sezione in Layout.tsx. */
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
  | 'agri-campi'
  | 'agri-operazioni'
  | 'agri-raccolte'
  | 'agri-calibrature'
  | 'agri-maltazioni'
  | 'agri-input'
  | 'agri-tracciabilita'

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

/** Schermate del modulo agricolo: navigabili solo a modulo acceso. */
export const SEZIONI_AGRICOLE: SezioneId[] = [
  'agri-campi',
  'agri-operazioni',
  'agri-raccolte',
  'agri-calibrature',
  'agri-maltazioni',
  'agri-input',
  'agri-tracciabilita'
]

export type DocEntry = {
  sezione: SezioneId
  titolo: string
  descrizione: string
  /** Come si accede dal menu laterale. */
  percorso: string
  /** Operazioni tipiche che si fanno qui. */
  azioni: string[]
  /** Parole chiave aggiuntive per la ricerca (minuscole). */
  tags: string[]
}

const PERCORSO_AGRICOLO =
  'Menu laterale → gruppo "Filiera agricola" (visibile con il modulo agricolo acceso)'

export const DOCS: DocEntry[] = [
  {
    sezione: 'dashboard',
    titolo: 'Dashboard',
    descrizione:
      'Panoramica del birrificio: avvisi attivi, cotte in corso, prodotto in scadenza, suggerimento per la prossima cotta e cotte producibili per ogni birra (calcolate dalle giacenze di materia prima).',
    percorso: 'Prima voce del menu laterale ("Dashboard").',
    azioni: [
      "vedere a colpo d'occhio la situazione",
      'cliccare sul riquadro "Avvisi attivi" per aprire la lista avvisi'
    ],
    tags: ['home', 'sintesi', 'riepilogo', 'kpi', 'panoramica', 'cruscotto']
  },
  {
    sezione: 'dashboard',
    titolo: 'Aspetto: tema chiaro o scuro',
    descrizione:
      'Fermento può essere usato con lo schermo scuro o chiaro. Si cambia con le due icone in alto a destra: luna per il tema scuro, sole per il tema chiaro. La scelta resta salvata anche alla riapertura.',
    percorso: 'Icone luna e sole in alto a destra, in ogni schermata.',
    azioni: ['passare al tema chiaro cliccando il sole', 'tornare al tema scuro cliccando la luna'],
    tags: [
      'tema',
      'chiaro',
      'scuro',
      'bianco',
      'nero',
      'schermo',
      'luminoso',
      'colori',
      'sole',
      'luna',
      'aspetto'
    ]
  },
  {
    sezione: 'magazzino-mp',
    titolo: 'Magazzino materie prime',
    descrizione:
      'Materie prime (malti, luppoli, lieviti, additivi) con giacenze totali e soglie di riordino. Per ogni materia prima si vedono i lotti caricati, la scadenza e la quantità residua.',
    percorso: 'Menu laterale → "Magazzino materie prime".',
    azioni: [
      'creare o modificare una materia prima (categoria, unità di misura, soglia di riordino, fornitore)',
      'registrare un nuovo carico (lotto fornitore, scadenza, quantità)',
      'vedere i lotti attivi e modificare o eliminare un lotto',
      'controllare cosa è sotto soglia o in scadenza'
    ],
    tags: [
      'materie prime',
      'mp',
      'malto',
      'luppolo',
      'lievito',
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
      'Materiali di confezionamento: bottiglie, tappi, etichette, cartoni, fusti. Giacenze, soglie di riordino e movimenti. Nei carichi si possono indicare lotto e fornitore del materiale: servono alla tracciabilità HACCP degli imballi a contatto con la birra.',
    percorso: 'Menu laterale → "Magazzino confezionamento".',
    azioni: [
      'creare un materiale (bottiglia, tappo, etichetta, fusto)',
      'caricare quantità indicando, se vuoi, lotto e fornitore (HACCP)',
      'modificare la soglia di riordino',
      'vedere i movimenti e correggere o eliminare un movimento'
    ],
    tags: [
      'confezionamento',
      'bottiglie',
      'tappi',
      'etichette',
      'cartoni',
      'fusti',
      'imballi',
      'lotti imballi',
      'haccp',
      'movimenti',
      'carico confezionamento'
    ]
  },
  {
    sezione: 'produzione',
    titolo: 'Produzione (cotte)',
    descrizione:
      'Elenco delle cotte (in corso, confezionate, esaurite). Con "Nuova cotta" scegli birra, numero di lotto e data: la tabella degli ingredienti parte dalla ricetta e la puoi cambiare solo per quella cotta (quantità, sostituzione, togliere o aggiungere un ingrediente). Gli ingredienti si correggono anche a cotta già avviata con "Modifica ingredienti". Il magazzino si aggiorna da solo, la ricetta resta com\'è.',
    percorso: 'Menu laterale → "Produzione".',
    azioni: [
      'avviare una nuova cotta (birra, numero di lotto, data di inizio) modificando gli ingredienti prima di avviarla',
      'modificare gli ingredienti anche a cotta già avviata, e anche dopo il confezionamento: nel dettaglio della cotta, pulsante "Modifica ingredienti" (cambiare la quantità, sostituire con la matita, togliere con il cestino, aggiungere con "Aggiungi ingrediente")',
      'vedere nel dettaglio le materie prime usate con i loro lotti e le variazioni rispetto alla ricetta',
      'confezionare una cotta (bottiglie, fusti per formato, scarto) indicando i lotti degli imballi usati (HACCP)',
      'impostare la scadenza al confezionamento: proposta dalla shelf life, modificabile',
      'correggere un confezionamento già fatto'
    ],
    tags: [
      'cotta',
      'cotte',
      'produzione',
      'nuova cotta',
      'avviare cotta',
      'ingredienti',
      'modifica ingredienti',
      'sostituire ingrediente',
      'togliere ingrediente',
      'confeziona',
      'confezionare',
      'lotto birra',
      'haccp'
    ]
  },
  {
    sezione: 'prodotto-finito',
    titolo: 'Prodotto finito',
    descrizione:
      'Giacenze di prodotto finito (bottiglie e fusti) per ogni cotta confezionata, con scadenza.',
    percorso: 'Menu laterale → "Prodotto finito".',
    azioni: [
      'vedere bottiglie e fusti disponibili per lotto',
      "registrare un carico iniziale (prodotto esistente prima dell'uso del gestionale)",
      'togliere bottiglie a mano (scarto, rottura, assaggio)',
      'gestire gli "altri prodotti" (gadget, merchandising) e la loro giacenza'
    ],
    tags: [
      'prodotto finito',
      'pf',
      'giacenza birra',
      'bottiglie disponibili',
      'fusti disponibili',
      'scarto',
      'rotture',
      'carico iniziale',
      'altri prodotti',
      'gadget',
      'merchandising'
    ]
  },
  {
    sezione: 'clienti',
    titolo: 'Clienti',
    descrizione:
      'Anagrafica clienti (pub, ristoranti, privati) con contatti e statistiche di vendita.',
    percorso: 'Menu laterale → "Clienti".',
    azioni: [
      'creare o modificare un cliente (nome, tipo, partita IVA, contatti)',
      'disattivare un cliente',
      'vedere lo storico vendite di un cliente',
      'trovare i clienti inattivi'
    ],
    tags: [
      'clienti',
      'anagrafica',
      'cliente',
      'pub',
      'ristoranti',
      'inattivi',
      'storico',
      'contatti',
      'telefono',
      'email'
    ]
  },
  {
    sezione: 'vendite',
    titolo: 'Vendite',
    descrizione:
      'Registrazione delle vendite: cliente (o omaggio/assaggio), data e righe di bottiglie, fusti o altri prodotti di cotte precise. Le giacenze di prodotto finito scalano da sole. Sulle righe fusto si indica quanti fusti sono "a rendere".',
    percorso: 'Menu laterale → "Vendite".',
    azioni: [
      'registrare una vendita (cliente, data, righe)',
      'indicare i fusti a rendere su una riga fusto',
      "segnare una vendita come omaggio, con l'occasione",
      'modificare o eliminare una vendita',
      'aprire "Fusti in giro" (in alto nelle Vendite) per i fusti da restituire'
    ],
    tags: [
      'vendita',
      'vendite',
      'registra vendita',
      'omaggio',
      'assaggio',
      'modifica vendita',
      'fusti a rendere',
      'altri prodotti'
    ]
  },
  {
    sezione: 'vendite',
    titolo: 'Fusti a rendere (Fusti in giro)',
    descrizione:
      'I fusti consegnati ai clienti che devono tornare indietro. La vista "Fusti in giro" mostra per ogni cliente e formato quanti fusti mancano (uscite meno rientri) e permette di registrare i rientri.',
    percorso: 'Menu laterale → "Vendite" → pulsante "Fusti in giro" in alto.',
    azioni: [
      'vedere chi ha fusti da restituire e quanti, per formato',
      'registrare il rientro dei fusti',
      'consultare lo storico dei movimenti di un cliente'
    ],
    tags: [
      'fusti a rendere',
      'fusti in giro',
      'rientro fusti',
      'restituzione fusti',
      'saldo fusti',
      'vuoto a rendere'
    ]
  },
  {
    sezione: 'report',
    titolo: 'Report',
    descrizione:
      'Report di periodo: produzione (cotte e litri), vendite per cliente e per birra, andamento mensile, omaggi.',
    percorso: 'Menu laterale → "Report".',
    azioni: [
      'scegliere il periodo da/a',
      'vedere produzione per birra',
      'vedere vendite per cliente e per birra',
      'vedere andamento mensile',
      'elencare gli omaggi'
    ],
    tags: [
      'report',
      'statistiche',
      'trend',
      'andamento',
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
      'Avvisi attivi: scorte basse, lotti in scadenza, clienti inattivi, cotte non producibili, prodotto in scadenza. In cima il pannello "Consigli di Bira" raggruppa i segnali e suggerisce cosa fare.',
    percorso: 'Menu laterale → "Avvisi".',
    azioni: [
      'rigenerare gli avvisi',
      'filtrare per tipo',
      'segnare un avviso come letto o risolto',
      'cliccare "Analizza con Bira" per i consigli'
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
      'Identità del birrificio e licenza, parametri di lavoro (cotta standard, shelf life, soglie, avvisi), birre e ricette, Bira, password e backup.',
    percorso: 'Menu laterale → "Impostazioni".',
    azioni: [
      'cambiare nome del birrificio e titolare (scheda Identità); lì si vede anche la licenza e si cambia la chiave di licenza',
      'modificare i parametri di lavoro (scheda Parametri): litri della cotta standard, shelf life, bottiglie per cartone, soglie di riordino, giorni per gli avvisi',
      'creare o modificare una birra e la sua ricetta (scheda Birre e ricette)',
      'attivare Bira (scheda Bira): incolla la chiave di Bira e premi Salva, poi "Prova Bira" per controllare',
      'cambiare la password (scheda Sicurezza)',
      'scegliere la cartella dei backup, quanti conservarne, fare un backup o ripristinarlo (scheda Backup)'
    ],
    tags: [
      'impostazioni',
      'configurazione',
      'parametri',
      'birra',
      'ricetta',
      'ricette',
      'password',
      'backup',
      'ripristino',
      'licenza',
      'bira',
      'chiave di bira',
      'chiave',
      'assistente'
    ]
  },
  {
    sezione: 'impostazioni',
    titolo: 'Moduli aggiuntivi (modulo agricolo)',
    descrizione:
      'Funzioni facoltative da accendere solo se servono. Il modulo agricolo (filiera campo → malto) si attiva o si spegne dall\'interruttore nella card "Moduli aggiuntivi"; spegnendolo i dati restano salvati, solo nascosti. Acceso, compaiono il gruppo "Filiera agricola" nel menu e la scheda "Modulo agricolo" nelle Impostazioni (stagione corrente, frazioni di calibratura proposte, scadenza del malto, parametri delle fasi).',
    percorso: 'Menu laterale → "Impostazioni" → scheda "Parametri" → card "Moduli aggiuntivi".',
    azioni: [
      'accendere o spegnere il modulo agricolo',
      'impostare stagione corrente, frazioni di calibratura e scadenza proposta del malto',
      'personalizzare i parametri delle fasi (raccolta, analisi e calibratura, maltazione): rinominarli, riordinarli, aggiungerne'
    ],
    tags: [
      'modulo agricolo',
      'moduli aggiuntivi',
      'attivare',
      'attivo',
      'accendere',
      'spegnere',
      'filiera agricola',
      'parametri fasi',
      'stagione'
    ]
  },
  {
    sezione: 'agri-campi',
    titolo: 'Campi e semine',
    descrizione:
      'Il quaderno di campagna: i campi (superficie, località) e cosa ci è stato seminato stagione per stagione (coltura orzo o luppolo, varietà, data, superficie, semente scaricata dal magazzino).',
    percorso: `${PERCORSO_AGRICOLO} → "Campi e semine".`,
    azioni: [
      'creare un campo',
      'registrare una semina con la semente usata',
      'vedere le semine di un campo per stagione',
      'archiviare un campo'
    ],
    tags: [
      'campo',
      'campi',
      'semina',
      'semine',
      'seminare',
      'varieta',
      'coltura',
      'quaderno di campagna',
      'ettari'
    ]
  },
  {
    sezione: 'agri-operazioni',
    titolo: 'Operazioni di campo',
    descrizione:
      'Concimazioni, trattamenti, lavorazioni e irrigazioni di ogni semina. Il prodotto usato si scarica dal magazzino agricolo; per i fitofarmaci si calcola la fine del tempo di carenza, controllata poi alla raccolta.',
    percorso: `${PERCORSO_AGRICOLO} → "Operazioni di campo".`,
    azioni: [
      'registrare un trattamento con fitofarmaco, dose e operatore',
      'registrare una concimazione',
      'vedere la fine del tempo di carenza',
      'filtrare per stagione e tipo'
    ],
    tags: [
      'operazioni',
      'trattamento',
      'trattamenti',
      'fitofarmaco',
      'concimazione',
      'concime',
      'irrigazione',
      'tempo di carenza',
      'carenza',
      'operatore',
      'dose'
    ]
  },
  {
    sezione: 'agri-raccolte',
    titolo: 'Raccolte',
    descrizione:
      'Ogni raccolta crea in magazzino un lotto di orzo (o luppolo) grezzo collegato al campo e alla semina. Se la raccolta cade dentro un tempo di carenza viene segnalato.',
    percorso: `${PERCORSO_AGRICOLO} → "Raccolte".`,
    azioni: [
      'registrare una raccolta (semina, data, quantità, codice lotto)',
      'vedere i lotti grezzi creati',
      'correggere o eliminare una raccolta non ancora usata'
    ],
    tags: [
      'raccolta',
      'raccolte',
      'raccogliere',
      'mietitura',
      'orzo',
      'grezzo',
      'lotto grezzo',
      'luppolo'
    ]
  },
  {
    sezione: 'agri-calibrature',
    titolo: 'Analisi e calibratura',
    descrizione:
      'Analisi del lotto di orzo grezzo e divisione in frazioni per calibro (setacci). Le frazioni buone diventano lotti di orzo calibrato pronti per la maltazione; quelle di scarto (es. sotto 2,2 mm) si registrano ma non entrano in magazzino.',
    percorso: `${PERCORSO_AGRICOLO} → "Analisi e calibratura".`,
    azioni: [
      'registrare analisi e calibratura di un lotto grezzo',
      'indicare le percentuali delle frazioni e il peso specifico',
      'vedere i lotti calibrati creati'
    ],
    tags: [
      'calibratura',
      'calibrature',
      'calibro',
      'frazioni',
      'setaccio',
      'analisi',
      'umidita',
      'proteine',
      'peso specifico',
      'scarto'
    ]
  },
  {
    sezione: 'agri-maltazioni',
    titolo: 'Maltazioni',
    descrizione:
      "Dall'orzo calibrato al malto, con i parametri di ogni fase: preparazione, macerazione, germinazione, essiccazione (sei fasi: curva umida, calo peso, curva 2, 3, 4, colpo di fuoco, con umidità, temperatura in entrata e in uscita, ore), post-essiccazione (radichetta, ricalibratura, peso, umidità finale, friabilità, analisi sensoriale) e test di laboratorio. Il lotto di malto entra in magazzino quando registri l'uscita; si vedono le rese.",
    percorso: `${PERCORSO_AGRICOLO} → "Maltazioni".`,
    azioni: [
      'avviare una maltazione scegliendo i lotti di orzo calibrato',
      'compilare i parametri delle fasi e salvarli',
      "registrare l'uscita del malto (peso finale, scadenza) per caricarlo in magazzino",
      'vedere resa di maltazione e resa complessiva'
    ],
    tags: [
      'maltazione',
      'maltazioni',
      'malto',
      'malteria',
      'macerazione',
      'germinazione',
      'essiccazione',
      'post-essiccazione',
      'post',
      'radichetta',
      'curve',
      'colpo di fuoco',
      'resa',
      'test di laboratorio'
    ]
  },
  {
    sezione: 'agri-input',
    titolo: 'Magazzino input agricoli',
    descrizione:
      'Sementi, concimi, fitofarmaci e altri prodotti per il campo: lotti, carichi e scadenze. Per i fitofarmaci si registrano principio attivo, numero di registrazione e tempo di carenza.',
    percorso: `${PERCORSO_AGRICOLO} → "Magazzino input agricoli".`,
    azioni: [
      'creare un prodotto per il campo',
      'registrare un carico con lotto e scadenza',
      'vedere giacenze e lotti'
    ],
    tags: [
      'input agricoli',
      'sementi',
      'semente',
      'concimi',
      'fitofarmaci',
      'magazzino agricolo',
      'principio attivo'
    ]
  },
  {
    sezione: 'agri-tracciabilita',
    titolo: 'Tracciabilità',
    descrizione:
      'Dalla bottiglia al campo e dal campo alla bottiglia: partendo da una cotta, un lotto o un campo si vede tutta la catena (campo, semina, trattamenti, raccolta, calibratura, maltazione, cotta, imballi, clienti) e la si può esportare in CSV.',
    percorso: `${PERCORSO_AGRICOLO} → "Tracciabilità".`,
    azioni: [
      'cercare una cotta, un lotto o un campo',
      'scegliere la direzione: a ritroso o in avanti',
      'esportare la catena in CSV'
    ],
    tags: [
      'tracciabilita',
      'tracciare',
      'filiera',
      'rintracciare',
      'richiamo',
      'campo',
      'bottiglia',
      'csv',
      'esporta'
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
  const corpus = [
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

export function isSezioneValida(s: string, o: { moduloAgricolo?: boolean } = {}): s is SezioneId {
  if ((SEZIONI_VALIDE as string[]).includes(s)) return true
  return !!o.moduloAgricolo && (SEZIONI_AGRICOLE as string[]).includes(s)
}
