import { ETICHETTE_NODO, type NodoTraccia } from '../../shared/agricolo'

/**
 * Albero di tracciabilità → CSV per Excel italiano: BOM UTF-8, separatore
 * punto e virgola, a capo CRLF. Una riga per nodo, rientro per livello.
 */
export function alberoACsv(radici: NodoTraccia[]): string {
  const righe: string[] = ['Livello;Tipo;Elemento;Dettagli']
  const visita = (nodo: NodoTraccia, livello: number): void => {
    const elemento =
      '    '.repeat(livello - 1) + nodo.titolo + (nodo.sottotitolo ? ` — ${nodo.sottotitolo}` : '')
    const dettagli = nodo.dettagli.map((d) => `${d.etichetta}: ${d.valore}`).join(' | ')
    righe.push(
      [String(livello), ETICHETTE_NODO[nodo.tipo], elemento, dettagli].map(cella).join(';')
    )
    for (const figlio of nodo.figli) visita(figlio, livello + 1)
  }
  for (const r of radici) visita(r, 1)
  return '\uFEFF' + righe.join('\r\n')
}

function cella(valore: string): string {
  return /[";\r\n]/.test(valore) ? `"${valore.replace(/"/g, '""')}"` : valore
}
