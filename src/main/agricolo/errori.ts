/**
 * Errore causato da un dato inserito dall'utente (non un guasto): il messaggio
 * è in italiano semplice e viene mostrato così com'è nella finestra.
 */
export class ErroreUtente extends Error {
  constructor(messaggio: string) {
    super(messaggio)
    this.name = 'ErroreUtente'
  }
}
