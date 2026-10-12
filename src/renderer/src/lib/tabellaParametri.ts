import type { Parametro } from '../../../shared/agricolo'

export type TabellaParametri = {
  /** `unita` è quella comune a tutta la colonna, altrimenti null (allora la mostra ogni cella). */
  colonne: Array<{ nome: string; unita: string | null }>
  /** Celle nell'ordine delle colonne. */
  righe: Array<{ nome: string; celle: Parametro[] }>
}

/** «Curva 2 – Durata» (o «Curva 2 - Durata»): riga prima del trattino, colonna dopo. */
const RIGA_COLONNA = /^(.+?)\s+[–-]\s+(.+)$/

/**
 * Se tutti i parametri di un gruppo sono numeri chiamati «Riga – Colonna» e
 * formano una griglia completa (almeno 2 righe e 2 colonne, stesse colonne
 * nello stesso ordine in ogni riga), li dispone come tabella; altrimenti null.
 */
export function comeTabella(parametri: Parametro[]): TabellaParametri | null {
  const righe = new Map<string, Array<{ colonna: string; p: Parametro }>>()
  for (const p of parametri) {
    const m = RIGA_COLONNA.exec(p.nome.trim())
    if (!m || p.tipo !== 'numero') return null
    const [, riga, colonna] = m
    const celle = righe.get(riga) ?? []
    celle.push({ colonna, p })
    righe.set(riga, celle)
  }
  const elenco = [...righe]
  if (elenco.length < 2) return null

  const nomiColonne = elenco[0][1].map((c) => c.colonna)
  if (nomiColonne.length < 2 || new Set(nomiColonne).size !== nomiColonne.length) return null
  for (const [, celle] of elenco) {
    if (celle.length !== nomiColonne.length || celle.some((c, i) => c.colonna !== nomiColonne[i]))
      return null
  }

  return {
    colonne: nomiColonne.map((nome, i) => {
      const unita = elenco.map(([, celle]) => celle[i].p.unita)
      return { nome, unita: unita.every((u) => u === unita[0]) ? unita[0] : null }
    }),
    righe: elenco.map(([nome, celle]) => ({ nome, celle: celle.map((c) => c.p) }))
  }
}
