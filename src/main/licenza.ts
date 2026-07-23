import { createVerify } from 'node:crypto'
import type BetterSqlite3 from 'better-sqlite3'
import { estraiBase64url, base64urlToBuffer } from './chiave'
import { codiceMacchina } from './impronta'

// Chiave pubblica di PRODUZIONE — NON sostituire. La privata corrispondente e' in ~/.fermento-licensing/private.pem
export const CHIAVE_PUBBLICA_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAslMzyjVod9lxuAYee3tw
LHW6j/fdNsj8CPGQgTghx30CyAObv1eYKc8MXO4P66Lqt08jsd40k9T7mafCGAd2
vjS8ExjG5CUj4xgVw5Q2sOkp/0diefWH3wRCmgbneCMEyjgtDJcGa7VjhjmgghXW
PsKpFiayhAYYpogC7a76uCzLnz//kMdrV+0AW/7DaITZ3BKc2Sz+rkLD5kqHTPRE
L26dfM2sXPhYApBaI0oQnNflTplNnPNCSmSu/27szsuLlIyrytGOzgHwjR+Up7ej
PrPfsFSsNdauM6QBcGZRyXuixZ9RjKWKNVi3yfofKQZpc2khpFTlyvxw829H65sM
QwIDAQAB
-----END PUBLIC KEY-----`

type LicenzaPayload = {
  intestatario: string
  scadenza: string | null
  emessa_il: string
  id: string
  macchina?: string
}

type VerificaResult =
  | { valida: true; payload: LicenzaPayload }
  | { valida: false; errore: string }

type StatoLicenza = {
  valida: boolean
  intestatario?: string
  scadenza?: string | null
  errore?: string
}

// Segnaposto speciale per il cliente fondatore Luca (Birrificio Lookdown).
// Non richiede verifica firma: accesso perpetuo garantito contrattualmente.
const FONDATORE_STRINGA = 'FONDATORE-LUCA-LOOKDOWN'

export function verificaLicenza(
  stringaLicenza: string,
  improntaCorrente?: string,
  chiavePubblica: string = CHIAVE_PUBBLICA_PEM
): VerificaResult {
  // Caso speciale fondatore: bypass verifica firma (rimosso in versione futura)
  if (stringaLicenza === FONDATORE_STRINGA) {
    return {
      valida: true,
      payload: {
        intestatario: 'Birrificio Lookdown',
        scadenza: null,
        emessa_il: '2026-04-01T00:00:00Z',
        id: 'fondatore'
      }
    }
  }

  if (!chiavePubblica) {
    return { valida: false, errore: 'Chiave pubblica non configurata' }
  }

  try {
    const raw = base64urlToBuffer(estraiBase64url(stringaLicenza)).toString('utf-8')
    const { payload: payloadStr, firma } = JSON.parse(raw) as { payload: string; firma: string }

    const verify = createVerify('RSA-SHA256')
    verify.update(payloadStr)
    const firmaValida = verify.verify(chiavePubblica, firma, 'base64')

    if (!firmaValida) {
      return { valida: false, errore: 'Firma non valida' }
    }

    const payload = JSON.parse(payloadStr) as LicenzaPayload

    if (payload.scadenza !== null && payload.scadenza < new Date().toISOString().split('T')[0]) {
      return { valida: false, errore: 'Licenza scaduta' }
    }

    // Machine binding: se la licenza porta un codice macchina, deve combaciare col PC.
    // Se assente → salta il controllo (retrocompatibilità, rete di sicurezza).
    if (payload.macchina) {
      const impronta = improntaCorrente ?? codiceMacchina()
      if (payload.macchina !== impronta) {
        return { valida: false, errore: 'Licenza legata a un altro computer' }
      }
    }

    return { valida: true, payload }
  } catch {
    return { valida: false, errore: 'Chiave licenza non valida' }
  }
}

export function licenzaSalvataValida(database: BetterSqlite3.Database): StatoLicenza {
  const riga = database
    .prepare(`SELECT stringa, intestatario, scadenza FROM licenza WHERE id = 1`)
    .get() as { stringa: string; intestatario: string; scadenza: string | null } | undefined

  if (!riga) {
    return { valida: false, errore: 'Licenza mancante' }
  }

  const risultato = verificaLicenza(riga.stringa)
  if (!risultato.valida) {
    return { valida: false, errore: risultato.errore }
  }

  return {
    valida: true,
    intestatario: risultato.payload.intestatario,
    scadenza: risultato.payload.scadenza
  }
}

export function salvaLicenza(database: BetterSqlite3.Database, stringaLicenza: string): void {
  const risultato = verificaLicenza(stringaLicenza)
  if (!risultato.valida) {
    throw new Error(risultato.errore)
  }

  database
    .prepare(
      `INSERT INTO licenza (id, stringa, intestatario, scadenza, emessa_il)
       VALUES (1, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         stringa = excluded.stringa,
         intestatario = excluded.intestatario,
         scadenza = excluded.scadenza,
         emessa_il = excluded.emessa_il,
         attivata_il = CURRENT_TIMESTAMP`
    )
    .run(
      stringaLicenza,
      risultato.payload.intestatario,
      risultato.payload.scadenza,
      risultato.payload.emessa_il
    )
}
