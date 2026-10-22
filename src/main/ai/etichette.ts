/** Nomi degli strumenti di Bira in parole semplici, per la chat. */
const ETICHETTE: Record<string, string> = {
  riassunto_dashboard: 'situazione generale',
  lista_birre: 'elenco birre',
  materie_prime_in_scadenza: 'scadenze materie prime',
  materie_prime_sotto_soglia: 'materie prime da riordinare',
  confezionamento_sotto_soglia: 'confezionamento da riordinare',
  cotte_attive: 'cotte in corso',
  giacenza_prodotto_finito: 'prodotto finito',
  cotte_producibili: 'cotte possibili',
  clienti_inattivi: 'clienti inattivi',
  top_clienti: 'clienti migliori',
  vendite_per_birra: 'vendite per birra',
  trend_vendite_mensile: 'andamento vendite',
  fusti_a_rendere: 'fusti in giro',
  altri_prodotti: 'altri prodotti',
  omaggi: 'omaggi',
  avvisi_attivi: 'avvisi',
  configurazione: 'impostazioni',
  cerca_documentazione: 'guida di Fermento',
  naviga_a_schermata: 'schermata da aprire',
  giacenze_materie_prime: 'magazzino materie prime',
  ricetta_birra: 'ricetta',
  storico_cotte: 'storico cotte',
  dettaglio_cotta: 'dettaglio cotta',
  vendite_cliente: 'vendite del cliente',
  agri_campi_semine: 'campi e semine',
  agri_operazioni: 'operazioni di campo',
  agri_lavorazioni: 'raccolte, calibrature e maltazioni',
  agri_magazzino_input: 'magazzino agricolo',
  tracciabilita: 'tracciabilità'
}

export function etichettaStrumento(nome: string): string {
  return ETICHETTE[nome] ?? nome.replace(/_/g, ' ')
}
