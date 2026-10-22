/**
 * Lettura del markdown semplice che scrive Bira (grassetti, elenchi,
 * tabelle…) in blocchi da mostrare con elementi React. Niente HTML: tutto ciò
 * che non è riconosciuto resta testo.
 */

export type Inline = { tipo: 'testo' | 'grassetto' | 'corsivo' | 'codice'; testo: string }

export type Blocco =
  | { tipo: 'titolo'; livello: 1 | 2 | 3; contenuto: Inline[] }
  | { tipo: 'paragrafo'; righe: Inline[][] }
  | { tipo: 'elenco'; ordinato: boolean; voci: Inline[][] }
  | { tipo: 'tabella'; intestazioni: Inline[][]; righe: Inline[][][] }
  | { tipo: 'separatore' }

const INLINE = /\*\*([^*\n]+?)\*\*|`([^`\n]+)`|\*([^*\s][^*\n]*?)\*/g

export function analizzaInline(testo: string): Inline[] {
  const out: Inline[] = []
  let ultimo = 0
  const aggiungiTesto = (t: string): void => {
    if (!t) return
    const prec = out[out.length - 1]
    if (prec && prec.tipo === 'testo') prec.testo += t
    else out.push({ tipo: 'testo', testo: t })
  }
  for (const m of testo.matchAll(INLINE)) {
    aggiungiTesto(testo.slice(ultimo, m.index))
    if (m[1] !== undefined) out.push({ tipo: 'grassetto', testo: m[1] })
    else if (m[2] !== undefined) out.push({ tipo: 'codice', testo: m[2] })
    else out.push({ tipo: 'corsivo', testo: m[3] })
    ultimo = (m.index ?? 0) + m[0].length
  }
  aggiungiTesto(testo.slice(ultimo))
  return out
}

const TITOLO = /^(#{1,6})\s+(.*)$/
const SEPARATORE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/
const PUNTO = /^\s*[-*•]\s+(.*)$/
const NUMERO = /^\s*\d+[.)]\s+(.*)$/
const RIGA_SEPARAZIONE_TABELLA = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/

function celle(riga: string): Inline[][] {
  let r = riga.trim()
  if (r.startsWith('|')) r = r.slice(1)
  if (r.endsWith('|')) r = r.slice(0, -1)
  return r.split('|').map((c) => analizzaInline(c.trim()))
}

export function analizzaMarkdown(testo: string): Blocco[] {
  const righe = (testo ?? '').replace(/\r\n?/g, '\n').split('\n')
  const blocchi: Blocco[] = []
  let paragrafo: Inline[][] | null = null
  let elenco: { ordinato: boolean; voci: Inline[][] } | null = null

  const chiudi = (): void => {
    if (paragrafo) blocchi.push({ tipo: 'paragrafo', righe: paragrafo })
    if (elenco) blocchi.push({ tipo: 'elenco', ordinato: elenco.ordinato, voci: elenco.voci })
    paragrafo = null
    elenco = null
  }

  for (let i = 0; i < righe.length; i++) {
    // Le citazioni «> testo» si mostrano come testo normale.
    const riga = righe[i].replace(/^\s*>\s?/, '')
    if (riga.trim() === '') {
      chiudi()
      continue
    }
    const titolo = riga.match(TITOLO)
    if (titolo) {
      chiudi()
      const livello = Math.min(titolo[1].length, 3) as 1 | 2 | 3
      blocchi.push({ tipo: 'titolo', livello, contenuto: analizzaInline(titolo[2].trim()) })
      continue
    }
    if (SEPARATORE.test(riga)) {
      chiudi()
      blocchi.push({ tipo: 'separatore' })
      continue
    }
    if (riga.trim().startsWith('|') && RIGA_SEPARAZIONE_TABELLA.test(righe[i + 1] ?? '')) {
      chiudi()
      const intestazioni = celle(riga)
      const corpo: Inline[][][] = []
      i += 2
      while (i < righe.length && righe[i].trim().startsWith('|')) {
        corpo.push(celle(righe[i]))
        i++
      }
      i--
      blocchi.push({ tipo: 'tabella', intestazioni, righe: corpo })
      continue
    }
    const punto = riga.match(PUNTO)
    const numero = punto ? null : riga.match(NUMERO)
    if (punto || numero) {
      const ordinato = !!numero
      if (paragrafo || (elenco && elenco.ordinato !== ordinato)) chiudi()
      if (!elenco) elenco = { ordinato, voci: [] }
      elenco.voci.push(analizzaInline(((punto ?? numero) as RegExpMatchArray)[1].trim()))
      continue
    }
    if (elenco && /^\s+/.test(riga)) {
      // continuazione rientrata dell'ultima voce
      const ultima = elenco.voci[elenco.voci.length - 1]
      ultima.push({ tipo: 'testo', testo: ' ' }, ...analizzaInline(riga.trim()))
      continue
    }
    if (elenco) chiudi()
    if (!paragrafo) paragrafo = []
    paragrafo.push(analizzaInline(riga.trim()))
  }
  chiudi()
  return blocchi
}
