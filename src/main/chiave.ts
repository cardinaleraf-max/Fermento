// Codifica/decodifica del formato chiave FRMTO-XXXXX-XXXXX-...
// Helper puri, nessuna dipendenza. Usati sia dal generatore sia dalla verifica,
// così generazione e verifica sono inverse esatte (evita il baco dei trattini:
// il '-' e' sia separatore sia carattere base64url del '+', quindi i separatori
// vanno tolti PER POSIZIONE, non per carattere).

export function bufferToBase64url(buf: Buffer): string {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export function base64urlToBuffer(b64url: string): Buffer {
  const base64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  const pad = (4 - (base64.length % 4)) % 4
  return Buffer.from(base64 + '='.repeat(pad), 'base64')
}

const DIM_GRUPPO = 5

export function formattaChiave(base64url: string): string {
  const chars = base64url.replace(/[^A-Za-z0-9_-]/g, '')
  const gruppi: string[] = []
  for (let i = 0; i < chars.length; i += DIM_GRUPPO) {
    gruppi.push(chars.slice(i, i + DIM_GRUPPO))
  }
  return 'FRMTO-' + gruppi.join('-')
}

export function estraiBase64url(chiave: string): string {
  const body = chiave.replace(/^FRMTO-/, '')
  // Ogni blocco e' DIM_GRUPPO char di contenuto + 1 separatore '-'.
  // Prendo i primi DIM_GRUPPO di ogni blocco da (DIM_GRUPPO+1) e salto il separatore,
  // così un '-' che fa parte del contenuto non viene mai scambiato per separatore.
  let content = ''
  for (let i = 0; i < body.length; i += DIM_GRUPPO + 1) {
    content += body.slice(i, i + DIM_GRUPPO)
  }
  return content
}
