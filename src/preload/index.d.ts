import { ElectronAPI } from '@electron-toolkit/preload'

type LoginResponse = { ok: true } | { ok: false; errore: string }

type MateriaPrima = {
  id: number
  nome: string
  categoria: string
  unita_misura: string
  soglia_riordino_fissa: number | null
  soglia_riordino_dinamica_cotte: number | null
  fornitore_preferito: string | null
  note: string | null
  creato_il: string
  aggiornato_il: string
  giacenza_totale: number
}

type MateriaPrimaPayload = {
  nome: string
  categoria: string
  unita_misura: string
  soglia_riordino_fissa?: number | null
  soglia_riordino_dinamica_cotte?: number | null
  fornitore_preferito?: string | null
  note?: string | null
}

type LottoMateriaPrima = {
  id: number
  materia_prima_id: number
  fornitore_id: number | null
  lotto_fornitore: string
  data_carico: string
  data_scadenza: string
  quantita_iniziale: number
  quantita_residua: number
  note: string | null
  creato_il: string
  aggiornato_il: string
  fornitore_nome: string | null
}

type CaricoPayload = {
  materia_prima_id: number
  fornitore_id?: number | null
  lotto_fornitore: string
  data_carico: string
  data_scadenza: string
  quantita_iniziale: number
  note?: string | null
}

type FornitoreOption = {
  id: number
  nome: string
}

type MaterialeConfezionamento = {
  id: number
  nome: string
  categoria: string
  birra_id: number | null
  birra_nome: string | null
  capacita_cl: number | null
  capacita_litri: number | null
  soglia_riordino: number | null
  attivo: number
  creato_il: string
  aggiornato_il: string
  giacenza: number
}

type ConfCaricoPayload = {
  materiale_id: number
  quantita: number
  note?: string | null
}

type MovimentoConfezionamento = {
  id: number
  materiale_id: number
  tipo_movimento: string
  quantita: number
  data: string
  causale: string | null
  riferimento: string | null
  note: string | null
}

type ConfAggiornaSogliaPayload = {
  materiale_id: number
  soglia_riordino: number
}

type ConfCreaMaterialePayload = {
  nome: string
  categoria: string
  birra_id: number | null
  capacita_cl: number | null
  capacita_litri: number | null
  soglia_riordino: number
}

type Cotta = {
  id: number
  numero_lotto: string
  birra_id: number
  ricetta_id: number
  data_inizio: string
  data_confezionamento: string | null
  litri_teorici: number
  stato: 'in_corso' | 'confezionata' | 'esaurita' | string
  note: string | null
  creato_il: string
  aggiornato_il: string
  birra_nome: string
  birra_stile: string | null
  bottiglie_prodotte: number | null
  data_scadenza: string | null
}

type DettaglioCotta = Cotta & {
  scarto_litri: number | null
  confezionamento_data_scadenza: string | null
}

type BirraAttiva = {
  id: number
  nome: string
  stile: string | null
  descrizione: string | null
  attiva: number
  creato_il: string
  aggiornato_il: string
  ricetta_id: number
  versione: number
  cotta_litri_riferimento: number
}

type IngredienteRicetta = {
  id: number
  ricetta_id: number
  materia_prima_id: number
  quantita: number
  note: string | null
  mp_nome: string
  unita_misura: string
  giacenza_totale: number
}

type MaterialeCotta = {
  id: number
  cotta_id: number
  lotto_materia_prima_id: number
  materia_prima_id: number
  quantita_usata: number
  mp_nome: string
  unita_misura: string
  lotto_fornitore: string
  data_scadenza: string
}

type AvviaCottaPayload = {
  numero_lotto: string
  birra_id: number
  ricetta_id: number
  data_inizio: string
  litri_teorici: number
}

type AvviaCottaResult =
  | { ok: true; cotta_id: number; avvisi: string[] }
  | { ok: false; errore: string }

type ConfezionaPayload = {
  cotta_id: number
  bottiglie_prodotte: number
  fusti: Array<{ materiale_id: number; quantita: number }>
  scarto_litri?: number | null
}

type ConfezionaResult = { ok: true } | { ok: false; errore: string }

type GiacenzaProdottoFinitoCartoni = {
  cotta_id: number
  numero_lotto: string
  birra_nome: string
  stile: string | null
  data_scadenza: string
  bottiglie_prodotte: number
  bottiglie_disponibili: number
  fusti_disponibili: number
  data_confezionamento: string | null
}

type LottoBottigliaSuggerito = {
  cotta_id: number
  numero_lotto: string
  data_scadenza: string
  bottiglie_disponibili: number
}

type PfTogliBottigliePayload = {
  cotta_id: number
  quantita: number
  causale?: string | null
}

type PfTogliBottiglieResult = { ok: true } | { ok: false; errore: string }

type GiacenzaProdottoFinitoFusti = {
  cotta_id: number
  materiale_id: number
  quantita_disponibile: number
  formato_nome: string
  capacita_litri: number | null
  numero_lotto: string
  birra_nome: string
  data_scadenza: string
}

type ClientePayload = {
  nome: string
  tipo_cliente: string
  partita_iva?: string | null
  indirizzo?: string | null
  telefono?: string | null
  email?: string | null
  note?: string | null
}

type ClienteConStatistiche = {
  id: number
  nome: string
  partita_iva: string | null
  indirizzo: string | null
  telefono: string | null
  email: string | null
  tipo_cliente: string | null
  note: string | null
  attivo: number
  creato_il: string
  aggiornato_il: string
  ultima_vendita: string | null
  totale_vendite: number
}

type VenditaStoricoRiga = {
  id: number
  data: string
  note: string | null
  omaggio: number
  occasione: string | null
  totale_fusti: number
  totale_bottiglie: number
}

type VenditaListaRiga = {
  id: number
  cliente_id: number | null
  data: string
  note: string | null
  creato_il: string
  cliente_nome: string | null
  omaggio: number
  occasione: string | null
  totale_fusti: number
  totale_bottiglie: number
}

type VenditaDettaglioRiga = {
  id: number
  vendita_id: number
  cotta_id: number
  tipo_prodotto: 'bottiglia' | 'fusto'
  materiale_id: number | null
  quantita: number
  birra_nome: string
  numero_lotto: string
  formato_nome: string | null
}

type GiacenzaVenditaDisponibile = {
  tipo: 'bottiglia' | 'fusto'
  cotta_id: number
  numero_lotto: string
  birra_nome: string
  quantita_disponibile: number
  data_scadenza: string
  materiale_id: number | null
  formato_nome: string | null
}

type VenditaRigaRegistro = {
  cotta_id: number
  tipo_prodotto: 'bottiglia' | 'fusto'
  materiale_id: number | null
  quantita: number
}

type VenditeRegistraPayload = {
  cliente_id: number | null
  data: string
  note?: string | null
  omaggio?: boolean
  occasione?: string | null
  righe: VenditaRigaRegistro[]
}

type VenditeRegistraResult =
  | { ok: true; vendita_id: number }
  | { ok: false; errore: string }

type VenditeModificaRiga = {
  id: number | null
  cotta_id: number
  tipo_prodotto: 'bottiglia' | 'fusto'
  materiale_id: number | null
  quantita: number
}

type VenditeModificaPayload = {
  cliente_id: number | null
  data: string
  note?: string | null
  omaggio?: boolean
  occasione?: string | null
  righe: VenditeModificaRiga[]
}

type VenditeModificaResult = { ok: true } | { ok: false; errore: string }
type VenditeEliminaResult = { ok: true } | { ok: false; errore: string }

type ModificaLottoPayload = {
  data_scadenza: string
  quantita_residua: number
  lotto_fornitore: string
  note?: string | null
}

type ModificaLottoResult = { ok: true } | { ok: false; errore: string }
type EliminaLottoResult = { ok: true } | { ok: false; errore: string }

type ModificaMovimentoConfPayload = {
  quantita: number
  note?: string | null
}

type ModificaMovimentoConfResult = { ok: true } | { ok: false; errore: string }
type EliminaMovimentoConfResult = { ok: true } | { ok: false; errore: string }

type CaricoInizialePayload = {
  numero_lotto: string
  birra_id: number
  bottiglie: number | null
  fusti: Array<{ materiale_id: number; quantita: number }>
  data_scadenza: string
  note?: string | null
}

type CaricoInizialeResult =
  | { ok: true; cotta_id: number; numero_lotto: string }
  | { ok: false; errore: string }

type FustoAttivo = {
  id: number
  nome: string
  capacita_litri: number | null
}

type ConfezionamentoFustoRiga = {
  id: number
  confezionamento_id: number
  materiale_id: number
  quantita: number
  formato_nome: string
  capacita_litri: number | null
}

type ModificaConfezionamentoPayload = {
  bottiglie_prodotte: number
  fusti: Array<{ materiale_id: number; quantita: number }>
  scarto_litri?: number | null
  data_scadenza: string
  data_confezionamento: string
}

type ModificaConfezionamentoResult =
  | { ok: true; bottiglie_prodotte: number }
  | { ok: false; errore: string }

type ClienteSelezionabileVendite = {
  id: number
  nome: string
}

type DashboardCottaProducibile = {
  id: number
  nome: string
  stile: string | null
  cotte_producibili: number
  ingrediente_limitante: string
}

type DashboardDati = {
  avvisi_attivi: number
  cotte_in_corso: number
  lotti_in_scadenza: number
  cotte_producibili: DashboardCottaProducibile[]
  suggerimento: { nome: string; totale_venduto: number } | null
}

type AvvisoRecord = {
  id: number
  tipo: string
  riferimento_tabella: string | null
  riferimento_id: number | null
  messaggio: string
  data_generazione: string
  letto: number
  risolto: number
  priorita: string
}

type AvvisiGeneraResult = { ok: true; generati: number }

type ReportProduzioneRiga = {
  birra_nome: string
  numero_cotte: number
  litri_totali: number
  bottiglie_totali: number
}

type ReportVenditeClienteRiga = {
  cliente_nome: string
  tipo_cliente: string | null
  numero_vendite: number
  bottiglie_totali: number
  fusti_totali: number
  ultima_vendita: string | null
}

type ReportVenditeBirraRiga = {
  birra_nome: string
  stile: string | null
  bottiglie_totali: number
  fusti_totali: number
  numero_vendite: number
}

type ReportTrendMensileRiga = { mese: string; bottiglie: number; fusti: number }

type ReportOmaggioRigaDettaglio = {
  birra_nome: string
  numero_lotto: string
  tipo_prodotto: 'bottiglia' | 'fusto'
  formato_nome: string | null
  quantita: number
}

type ReportOmaggioRiga = {
  id: number
  data: string
  note: string | null
  occasione: string | null
  cliente_nome: string | null
  totale_fusti: number
  totale_bottiglie: number
  righe: ReportOmaggioRigaDettaglio[]
}

type ConfigurazioneRiga = {
  id: number
  chiave: string
  valore: string
  tipo: string
  etichetta: string
  categoria: string
  creato_il: string
  aggiornato_il: string
}

type BirraRecord = {
  id: number
  nome: string
  stile: string | null
  descrizione: string | null
  attiva: number
  creato_il: string
  aggiornato_il: string
}

type ImpostazioniBirraForm = { nome: string; stile: string; descrizione: string; attiva: number }
type ImpostazioniCreaBirra = { nome: string; stile: string; descrizione: string }
type SalvaRicettaInput = {
  birra_id: number
  ingredienti: Array<{ materia_prima_id: number; quantita: number; note?: string | null }>
}
type CambiaPasswordInput = { password_attuale: string; password_nuova: string }

type RicettaIngredienteRiga = {
  id: number
  ricetta_id: number
  materia_prima_id: number
  quantita: number
  note: string | null
  mp_nome: string
  unita_misura: string
}

type CambiaPasswordResult = { ok: true } | { ok: false; errore: string }

type BackupEseguiResult = { ok: true; percorso: string } | { ok: false; errore: string }
type BackupSelezionaCartellaResult = { ok: true; percorso: string } | { ok: false }
type BackupSelezionaFileResult = { ok: true; percorso: string } | { ok: false }
type BackupRipristinaResult = { ok: true } | { ok: false; errore: string }
type BackupLogRiga = {
  id: number
  data: string
  percorso_destinazione: string
  dimensione_bytes: number | null
  tipo: string
  esito: string
  messaggio_errore: string | null
}

type AiTurnoMessaggio =
  | { ruolo: 'user'; contenuto: string }
  | { ruolo: 'assistant'; contenuto: string }

type AiChatRichiesta = {
  conversazioneId: string
  cronologia: AiTurnoMessaggio[]
}

type AiEvento =
  | { tipo: 'inizio'; modello: string }
  | { tipo: 'tool_call'; nome: string; argomenti: Record<string, unknown> }
  | { tipo: 'tool_risultato'; nome: string; ok: boolean; anteprima: string }
  | { tipo: 'risposta'; testo: string }
  | { tipo: 'errore'; messaggio: string }
  | { tipo: 'fine' }

type AiEventoPayload = { conversazioneId: string; evento: AiEvento }

type AiNavigaPayload = {
  conversazioneId: string
  sezione: string
  motivo: string | null
}

type AiProviderTipo = 'ollama' | 'groq'

type AiHealth = {
  abilitato: boolean
  provider: AiProviderTipo
  url: string
  modello: string
  /** true se il provider e' cloud (dati escono dal PC). */
  remoto: boolean
  raggiungibile: boolean
  errore: string | null
}

type AiListaModelliResult =
  | { ok: true; modelli: string[] }
  | { ok: false; errore: string }

type AiListaToolResult = {
  tutti: string[]
  disponibili: string[]
  bloccati_cloud: string[]
  modalita_cloud: boolean
}

type AiRaccomandazionePriorita = 'critica' | 'alta' | 'media' | 'bassa'
type AiRaccomandazioneAzioneTipo =
  | 'riordina'
  | 'produci'
  | 'promo'
  | 'sconta'
  | 'vendi'
  | 'revisiona'
  | 'altro'
type AiRaccomandazioneEntitaTipo = 'mp' | 'birra' | 'conf' | 'cliente'

type AiRaccomandazioneAzione = {
  tipo: AiRaccomandazioneAzioneTipo
  testo: string
}

type AiRaccomandazioneRiferimento = {
  tipo: AiRaccomandazioneEntitaTipo
  id: number
  nome: string
}

type AiRaccomandazione = {
  priorita: AiRaccomandazionePriorita
  titolo: string
  descrizione: string
  azioni: AiRaccomandazioneAzione[]
  riferimenti: AiRaccomandazioneRiferimento[]
  segnali_ids: number[]
}

type AiAvvisiIntelligentiResult =
  | {
      ok: true
      generato_il: string
      modello: string
      remoto: boolean
      raccomandazioni: AiRaccomandazione[]
      segnali_analizzati: number
    }
  | { ok: false; errore: string }

interface FermentoAPI {
  login: {
    verifica: (password: string) => Promise<LoginResponse>
    impostaPassword: (password: string) => Promise<{ ok: true }>
  }
  mp: {
    lista: () => Promise<MateriaPrima[]>
    crea: (dati: MateriaPrimaPayload) => Promise<{ ok: true; id: number }>
    aggiorna: (id: number, dati: MateriaPrimaPayload) => Promise<{ ok: true }>
    lotti: (materia_prima_id: number) => Promise<LottoMateriaPrima[]>
    carico: (dati: CaricoPayload) => Promise<{ ok: true; id: number }>
    fornitori: () => Promise<FornitoreOption[]>
    modificaLotto: (id: number, dati: ModificaLottoPayload) => Promise<ModificaLottoResult>
    eliminaLotto: (id: number) => Promise<EliminaLottoResult>
  }
  conf: {
    lista: () => Promise<MaterialeConfezionamento[]>
    creaMateriale: (dati: ConfCreaMaterialePayload) => Promise<{ ok: true; id: number }>
    carico: (dati: ConfCaricoPayload) => Promise<{ ok: true }>
    movimenti: (materiale_id: number) => Promise<MovimentoConfezionamento[]>
    aggiornaSoglia: (dati: ConfAggiornaSogliaPayload) => Promise<{ ok: true }>
    modificaMovimento: (
      id: number,
      dati: ModificaMovimentoConfPayload
    ) => Promise<ModificaMovimentoConfResult>
    eliminaMovimento: (id: number) => Promise<EliminaMovimentoConfResult>
  }
  prod: {
    listaCotte: () => Promise<Cotta[]>
    birreAttive: () => Promise<BirraAttiva[]>
    ingredientiRicetta: (ricetta_id: number) => Promise<IngredienteRicetta[]>
    avviaCotta: (dati: AvviaCottaPayload) => Promise<AvviaCottaResult>
    dettaglioCotta: (cotta_id: number) => Promise<DettaglioCotta | undefined>
    materialiCotta: (cotta_id: number) => Promise<MaterialeCotta[]>
    confeziona: (dati: ConfezionaPayload) => Promise<ConfezionaResult>
    confezionamentoFusti: (cotta_id: number) => Promise<ConfezionamentoFustoRiga[]>
    modificaConfezionamento: (
      cotta_id: number,
      dati: ModificaConfezionamentoPayload
    ) => Promise<ModificaConfezionamentoResult>
  }
  pf: {
    giacenze: () => Promise<GiacenzaProdottoFinitoCartoni[]>
    giacenzeFusti: () => Promise<GiacenzaProdottoFinitoFusti[]>
    fustiAttivi: () => Promise<FustoAttivo[]>
    caricoIniziale: (dati: CaricoInizialePayload) => Promise<CaricoInizialeResult>
    togliBottiglie: (dati: PfTogliBottigliePayload) => Promise<PfTogliBottiglieResult>
    suggerisciLottoBottiglie: (birra_id: number) => Promise<LottoBottigliaSuggerito[]>
  }
  clienti: {
    lista: () => Promise<ClienteConStatistiche[]>
    crea: (dati: ClientePayload) => Promise<{ ok: true; id: number }>
    aggiorna: (id: number, dati: ClientePayload) => Promise<{ ok: true }>
    disattiva: (id: number) => Promise<{ ok: true }>
    storicoVendite: (clienteId: number) => Promise<VenditaStoricoRiga[]>
  }
  vendite: {
    lista: () => Promise<VenditaListaRiga[]>
    dettaglio: (venditaId: number) => Promise<VenditaDettaglioRiga[]>
    giacenzeDisponibili: () => Promise<GiacenzaVenditaDisponibile[]>
    registra: (dati: VenditeRegistraPayload) => Promise<VenditeRegistraResult>
    clienti: () => Promise<ClienteSelezionabileVendite[]>
    modifica: (id: number, dati: VenditeModificaPayload) => Promise<VenditeModificaResult>
    elimina: (id: number) => Promise<VenditeEliminaResult>
  }
  dashboard: {
    dati: () => Promise<DashboardDati>
  }
  avvisi: {
    genera: () => Promise<AvvisiGeneraResult>
    lista: () => Promise<AvvisoRecord[]>
    segnaLetto: (id: number) => Promise<{ ok: true }>
    segnaRisolto: (id: number) => Promise<{ ok: true }>
  }
  report: {
    produzione: (da: string, a: string) => Promise<ReportProduzioneRiga[]>
    venditePerCliente: (da: string, a: string) => Promise<ReportVenditeClienteRiga[]>
    venditePerId: (da: string, a: string) => Promise<ReportVenditeBirraRiga[]>
    trendMensile: (da: string, a: string) => Promise<ReportTrendMensileRiga[]>
    omaggi: (da: string | null, a: string | null) => Promise<ReportOmaggioRiga[]>
  }
  impostazioni: {
    lista: () => Promise<ConfigurazioneRiga[]>
    aggiorna: (chiave: string, valore: string) => Promise<{ ok: true }>
    birre: () => Promise<BirraRecord[]>
    aggiornaBirra: (id: number, dati: ImpostazioniBirraForm) => Promise<{ ok: true }>
    creaBirra: (dati: ImpostazioniCreaBirra) => Promise<{ ok: true; id: number }>
    ricetta: (birraId: number) => Promise<RicettaIngredienteRiga[]>
    salvaRicetta: (dati: SalvaRicettaInput) => Promise<{ ok: true }>
    cambiaPassword: (dati: CambiaPasswordInput) => Promise<CambiaPasswordResult>
    valoreDi: (chiave: string) => Promise<string>
  }
  backup: {
    esegui: (tipo: 'manuale' | 'automatico') => Promise<BackupEseguiResult>
    selezionaCartella: () => Promise<BackupSelezionaCartellaResult>
    selezionaFileRipristino: () => Promise<BackupSelezionaFileResult>
    configuraPercorso: (percorso: string) => Promise<{ ok: true }>
    lista: () => Promise<BackupLogRiga[]>
    ripristina: (percorsoFile: string) => Promise<BackupRipristinaResult>
  }
  ai: {
    health: () => Promise<AiHealth>
    listaModelli: () => Promise<AiListaModelliResult>
    listaTool: () => Promise<AiListaToolResult>
    avvisiIntelligenti: () => Promise<AiAvvisiIntelligentiResult>
    chat: (richiesta: AiChatRichiesta) => void
    annulla: (conversazioneId: string) => void
    onEvento: (handler: (payload: AiEventoPayload) => void) => () => void
    onNaviga: (handler: (payload: AiNavigaPayload) => void) => () => void
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: FermentoAPI
  }
}
