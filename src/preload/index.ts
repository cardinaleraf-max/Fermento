import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

type MateriaPrimaPayload = {
  nome: string
  categoria: string
  unita_misura: string
  soglia_riordino_fissa?: number | null
  soglia_riordino_dinamica_cotte?: number | null
  fornitore_preferito?: string | null
  note?: string | null
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

type ConfCaricoPayload = {
  materiale_id: number
  quantita: number
  note?: string | null
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

type AvviaCottaPayload = {
  numero_lotto: string
  birra_id: number
  ricetta_id: number
  data_inizio: string
  litri_teorici: number
}

type ConfezionaPayload = {
  cotta_id: number
  bottiglie_prodotte: number
  fusti: Array<{ materiale_id: number; quantita: number }>
  scarto_litri?: number | null
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

type VenditaRigaRegistro = {
  cotta_id: number
  tipo_prodotto: 'cartone' | 'fusto' | 'bottiglia'
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

type VenditeModificaRiga = {
  id: number | null
  cotta_id: number
  tipo_prodotto: 'cartone' | 'fusto' | 'bottiglia'
  materiale_id: number | null
  quantita: number
}

type PfTogliBottigliePayload = {
  cotta_id: number
  quantita: number
  causale?: string | null
}

type VenditeModificaPayload = {
  cliente_id: number | null
  data: string
  note?: string | null
  omaggio?: boolean
  occasione?: string | null
  righe: VenditeModificaRiga[]
}

type ReportOmaggiPeriodo = { da?: string | null; a?: string | null }

type ModificaLottoPayload = {
  data_scadenza: string
  quantita_residua: number
  lotto_fornitore: string
  note?: string | null
}

type ModificaMovimentoConfPayload = {
  quantita: number
  note?: string | null
}

type CaricoInizialePayload = {
  numero_lotto: string
  birra_id: number
  cartoni: number | null
  fusti: Array<{ materiale_id: number; quantita: number }>
  data_scadenza: string
  note?: string | null
}

type ModificaConfezionamentoPayload = {
  bottiglie_prodotte: number
  fusti: Array<{ materiale_id: number; quantita: number }>
  scarto_litri?: number | null
  data_scadenza: string
  data_confezionamento: string
}

type ReportPeriodo = { da: string; a: string }

type ImpostazioniBirraPayload = { nome: string; stile: string; descrizione: string; attiva: number }
type ImpostazioniCreaBirraPayload = { nome: string; stile: string; descrizione: string }
type SalvaRicettaPayload = {
  birra_id: number
  ingredienti: Array<{ materia_prima_id: number; quantita: number; note?: string | null }>
}
type CambiaPasswordPayload = { password_attuale: string; password_nuova: string }

// Custom APIs for renderer
const api = {
  login: {
    verifica: (password: string) => ipcRenderer.invoke('login:verifica', password),
    impostaPassword: (password: string) => ipcRenderer.invoke('login:imposta-password', password)
  },
  mp: {
    lista: () => ipcRenderer.invoke('mp:lista'),
    crea: (dati: MateriaPrimaPayload) => ipcRenderer.invoke('mp:crea', dati),
    aggiorna: (id: number, dati: MateriaPrimaPayload) => ipcRenderer.invoke('mp:aggiorna', id, dati),
    lotti: (materia_prima_id: number) => ipcRenderer.invoke('mp:lotti', materia_prima_id),
    carico: (dati: CaricoPayload) => ipcRenderer.invoke('mp:carico', dati),
    fornitori: () => ipcRenderer.invoke('mp:fornitori'),
    modificaLotto: (id: number, dati: ModificaLottoPayload) =>
      ipcRenderer.invoke('mp:modifica-lotto', id, dati),
    eliminaLotto: (id: number) => ipcRenderer.invoke('mp:elimina-lotto', id)
  },
  conf: {
    lista: () => ipcRenderer.invoke('conf:lista'),
    creaMateriale: (dati: ConfCreaMaterialePayload) => ipcRenderer.invoke('conf:crea-materiale', dati),
    carico: (dati: ConfCaricoPayload) => ipcRenderer.invoke('conf:carico', dati),
    movimenti: (materiale_id: number) => ipcRenderer.invoke('conf:movimenti', materiale_id),
    aggiornaSoglia: (dati: ConfAggiornaSogliaPayload) => ipcRenderer.invoke('conf:aggiorna-soglia', dati),
    modificaMovimento: (id: number, dati: ModificaMovimentoConfPayload) =>
      ipcRenderer.invoke('conf:modifica-movimento', id, dati),
    eliminaMovimento: (id: number) => ipcRenderer.invoke('conf:elimina-movimento', id)
  },
  prod: {
    listaCotte: () => ipcRenderer.invoke('prod:lista-cotte'),
    birreAttive: () => ipcRenderer.invoke('prod:birre-attive'),
    ingredientiRicetta: (ricetta_id: number) =>
      ipcRenderer.invoke('prod:ingredienti-ricetta', ricetta_id),
    avviaCotta: (dati: AvviaCottaPayload) => ipcRenderer.invoke('prod:avvia-cotta', dati),
    dettaglioCotta: (cotta_id: number) => ipcRenderer.invoke('prod:dettaglio-cotta', cotta_id),
    materialiCotta: (cotta_id: number) => ipcRenderer.invoke('prod:materiali-cotta', cotta_id),
    confeziona: (dati: ConfezionaPayload) => ipcRenderer.invoke('prod:confeziona', dati),
    confezionamentoFusti: (cotta_id: number) =>
      ipcRenderer.invoke('prod:confezionamento-fusti', cotta_id),
    modificaConfezionamento: (cotta_id: number, dati: ModificaConfezionamentoPayload) =>
      ipcRenderer.invoke('prod:modifica-confezionamento', cotta_id, dati)
  },
  pf: {
    giacenze: () => ipcRenderer.invoke('pf:giacenze'),
    giacenzeFusti: () => ipcRenderer.invoke('pf:giacenze-fusti'),
    fustiAttivi: () => ipcRenderer.invoke('pf:fusti-attivi'),
    caricoIniziale: (dati: CaricoInizialePayload) =>
      ipcRenderer.invoke('pf:carico-iniziale', dati),
    togliBottiglie: (dati: PfTogliBottigliePayload) =>
      ipcRenderer.invoke('pf:togli-bottiglie', dati),
    suggerisciLottoBottiglie: (birra_id: number) =>
      ipcRenderer.invoke('pf:suggerisci-lotto-bottiglie', birra_id)
  },
  clienti: {
    lista: () => ipcRenderer.invoke('clienti:lista'),
    crea: (dati: ClientePayload) => ipcRenderer.invoke('clienti:crea', dati),
    aggiorna: (id: number, dati: ClientePayload) => ipcRenderer.invoke('clienti:aggiorna', id, dati),
    disattiva: (id: number) => ipcRenderer.invoke('clienti:disattiva', id),
    storicoVendite: (clienteId: number) => ipcRenderer.invoke('clienti:storico-vendite', clienteId)
  },
  vendite: {
    lista: () => ipcRenderer.invoke('vendite:lista'),
    dettaglio: (venditaId: number) => ipcRenderer.invoke('vendite:dettaglio', venditaId),
    giacenzeDisponibili: () => ipcRenderer.invoke('vendite:giacenze-disponibili'),
    registra: (dati: VenditeRegistraPayload) => ipcRenderer.invoke('vendite:registra', dati),
    clienti: () => ipcRenderer.invoke('vendite:clienti'),
    modifica: (id: number, dati: VenditeModificaPayload) =>
      ipcRenderer.invoke('vendite:modifica', id, dati),
    elimina: (id: number) => ipcRenderer.invoke('vendite:elimina', id)
  },
  dashboard: {
    dati: () => ipcRenderer.invoke('dashboard:dati')
  },
  avvisi: {
    genera: () => ipcRenderer.invoke('avvisi:genera'),
    lista: () => ipcRenderer.invoke('avvisi:lista'),
    segnaLetto: (id: number) => ipcRenderer.invoke('avvisi:segna-letto', id),
    segnaRisolto: (id: number) => ipcRenderer.invoke('avvisi:segna-risolto', id)
  },
  report: {
    produzione: (da: string, a: string) => ipcRenderer.invoke('report:produzione', { da, a } as ReportPeriodo),
    venditePerCliente: (da: string, a: string) => ipcRenderer.invoke('report:vendite-per-cliente', { da, a } as ReportPeriodo),
    venditePerId: (da: string, a: string) => ipcRenderer.invoke('report:vendite-per-birra', { da, a } as ReportPeriodo),
    trendMensile: (da: string, a: string) => ipcRenderer.invoke('report:trend-mensile', { da, a } as ReportPeriodo),
    omaggi: (da: string | null, a: string | null) =>
      ipcRenderer.invoke('report:omaggi', { da, a } as ReportOmaggiPeriodo)
  },
  impostazioni: {
    lista: () => ipcRenderer.invoke('impostazioni:lista'),
    aggiorna: (chiave: string, valore: string) => ipcRenderer.invoke('impostazioni:aggiorna', { chiave, valore }),
    birre: () => ipcRenderer.invoke('impostazioni:birre'),
    aggiornaBirra: (id: number, dati: ImpostazioniBirraPayload) =>
      ipcRenderer.invoke('impostazioni:aggiorna-birra', id, dati),
    creaBirra: (dati: ImpostazioniCreaBirraPayload) => ipcRenderer.invoke('impostazioni:crea-birra', dati),
    ricetta: (birraId: number) => ipcRenderer.invoke('impostazioni:ricetta', birraId),
    salvaRicetta: (dati: SalvaRicettaPayload) => ipcRenderer.invoke('impostazioni:salva-ricetta', dati),
    cambiaPassword: (dati: CambiaPasswordPayload) => ipcRenderer.invoke('impostazioni:cambia-password', dati),
    valoreDi: (chiave: string) => ipcRenderer.invoke('impostazioni:valore-di', chiave)
  },
  backup: {
    esegui: (tipo: 'manuale' | 'automatico') => ipcRenderer.invoke('backup:esegui', { tipo }),
    selezionaCartella: () => ipcRenderer.invoke('backup:seleziona-cartella'),
    selezionaFileRipristino: () => ipcRenderer.invoke('backup:seleziona-file-ripristino'),
    configuraPercorso: (percorso: string) => ipcRenderer.invoke('backup:configura-percorso', { percorso }),
    lista: () => ipcRenderer.invoke('backup:lista'),
    ripristina: (percorsoFile: string) => ipcRenderer.invoke('backup:ripristina', { percorso_file: percorsoFile })
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
