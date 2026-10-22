/**
 * Scheda «Parametri» delle Impostazioni: cosa vede il cliente e con che titoli.
 * Restano fuori le impostazioni interne (sistema), i doppioni di altre schede
 * (identità, backup) e quelle gestite da schermate dedicate (Bira, moduli).
 */

const NASCOSTE = new Set(['sistema', 'generale', 'backup', 'assistente_ai', 'moduli', 'agricolo'])

const TITOLI: Record<string, string> = {
  produzione: 'Produzione',
  magazzino: 'Magazzino confezionamento',
  avvisi: 'Avvisi',
  vendite: 'Vendite e report'
}

const ORDINE = ['produzione', 'magazzino', 'avvisi', 'vendite']

export function categoriaVisibile(categoria: string): boolean {
  return !NASCOSTE.has(categoria)
}

export function titoloCategoria(categoria: string): string {
  return TITOLI[categoria] ?? categoria.charAt(0).toUpperCase() + categoria.slice(1)
}

export function ordinaCategorie(categorie: string[]): string[] {
  const pos = (c: string): number => {
    const i = ORDINE.indexOf(c)
    return i === -1 ? ORDINE.length : i
  }
  return [...categorie].sort((a, b) => pos(a) - pos(b) || a.localeCompare(b))
}
