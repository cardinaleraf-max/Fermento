import fs from 'node:fs'
import path from 'node:path'
import { app, dialog, shell, BrowserWindow, ipcMain } from 'electron'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { autoUpdater } from 'electron-updater'
import bcrypt from 'bcryptjs'
import icon from '../../resources/icon.png?asset'
import { closeDatabaseConnection, db, getDatabaseFilePath, initDatabase, reopenDatabaseConnection } from './database'
import { ensureAiConfigRows, registerAiIpcHandlers } from './ai/agent'

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
  bottiglie: number | null
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

if (process.env.ELECTRON_RUN_AS_NODE) {
  console.warn(
    `[startup] ATTENZIONE: ELECTRON_RUN_AS_NODE="${process.env.ELECTRON_RUN_AS_NODE}". ` +
      'Questo puo impedire l\'avvio corretto di Electron.'
  )
}

function registerMpIpcHandlers(): void {
  ipcMain.removeHandler('mp:lista')
  ipcMain.handle('mp:lista', () => {
    try {
      return db
        .prepare(
          `SELECT mp.*, COALESCE(SUM(l.quantita_residua), 0) as giacenza_totale
           FROM materie_prime mp
           LEFT JOIN lotti_materie_prime l ON l.materia_prima_id = mp.id AND l.quantita_residua > 0
           GROUP BY mp.id
           ORDER BY mp.categoria, mp.nome`
        )
        .all()
    } catch (error) {
      console.error('[IPC mp:lista] errore:', error)
      throw error
    }
  })

  ipcMain.removeHandler('mp:crea')
  ipcMain.handle('mp:crea', (_event, dati: MateriaPrimaPayload) => {
    try {
      const result = db
        .prepare(
          `INSERT INTO materie_prime
           (nome, categoria, unita_misura, soglia_riordino_fissa, soglia_riordino_dinamica_cotte, fornitore_preferito, note)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          dati.nome,
          dati.categoria,
          dati.unita_misura,
          dati.soglia_riordino_fissa ?? null,
          dati.soglia_riordino_dinamica_cotte ?? null,
          dati.fornitore_preferito ?? null,
          dati.note ?? null
        )

      return { ok: true, id: Number(result.lastInsertRowid) }
    } catch (error) {
      console.error('[IPC mp:crea] errore:', error)
      throw error
    }
  })

  ipcMain.removeHandler('mp:aggiorna')
  ipcMain.handle('mp:aggiorna', (_event, id: number, dati: MateriaPrimaPayload) => {
    try {
      db.prepare(
        `UPDATE materie_prime
         SET nome = ?,
             categoria = ?,
             unita_misura = ?,
             soglia_riordino_fissa = ?,
             soglia_riordino_dinamica_cotte = ?,
             fornitore_preferito = ?,
             note = ?,
             aggiornato_il = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).run(
        dati.nome,
        dati.categoria,
        dati.unita_misura,
        dati.soglia_riordino_fissa ?? null,
        dati.soglia_riordino_dinamica_cotte ?? null,
        dati.fornitore_preferito ?? null,
        dati.note ?? null,
        id
      )

      return { ok: true }
    } catch (error) {
      console.error('[IPC mp:aggiorna] errore:', error)
      throw error
    }
  })

  ipcMain.removeHandler('mp:lotti')
  ipcMain.handle('mp:lotti', (_event, materia_prima_id: number) => {
    try {
      return db
        .prepare(
          `SELECT l.*, f.nome as fornitore_nome FROM lotti_materie_prime l
           LEFT JOIN fornitori f ON f.id = l.fornitore_id
           WHERE l.materia_prima_id = ?
           ORDER BY l.data_scadenza ASC`
        )
        .all(materia_prima_id)
    } catch (error) {
      console.error('[IPC mp:lotti] errore:', error)
      throw error
    }
  })

  ipcMain.removeHandler('mp:carico')
  ipcMain.handle('mp:carico', (_event, dati: CaricoPayload) => {
    try {
      const result = db
        .prepare(
          `INSERT INTO lotti_materie_prime
           (materia_prima_id, fornitore_id, lotto_fornitore, data_carico, data_scadenza, quantita_iniziale, quantita_residua, note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          dati.materia_prima_id,
          dati.fornitore_id ?? null,
          dati.lotto_fornitore,
          dati.data_carico,
          dati.data_scadenza,
          dati.quantita_iniziale,
          dati.quantita_iniziale,
          dati.note ?? null
        )

      return { ok: true, id: Number(result.lastInsertRowid) }
    } catch (error) {
      console.error('[IPC mp:carico] errore:', error)
      throw error
    }
  })

  ipcMain.removeHandler('mp:fornitori')
  ipcMain.handle('mp:fornitori', () => {
    try {
      return db.prepare(`SELECT id, nome FROM fornitori WHERE attivo = 1 ORDER BY nome`).all()
    } catch (error) {
      console.error('[IPC mp:fornitori] errore:', error)
      throw error
    }
  })

  ipcMain.removeHandler('mp:modifica-lotto')
  ipcMain.handle('mp:modifica-lotto', (_event, id: number, dati: ModificaLottoPayload) => {
    try {
      const lotto = db
        .prepare(`SELECT id FROM lotti_materie_prime WHERE id = ?`)
        .get(id) as { id: number } | undefined
      if (!lotto) {
        return { ok: false as const, errore: 'Lotto non trovato' }
      }

      db.prepare(
        `UPDATE lotti_materie_prime
         SET data_scadenza = ?,
             quantita_residua = ?,
             lotto_fornitore = ?,
             note = ?,
             aggiornato_il = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).run(
        dati.data_scadenza,
        dati.quantita_residua,
        dati.lotto_fornitore,
        dati.note ?? null,
        id
      )

      return { ok: true as const }
    } catch (error) {
      console.error('[IPC mp:modifica-lotto]', error)
      throw error
    }
  })

  ipcMain.removeHandler('mp:elimina-lotto')
  ipcMain.handle('mp:elimina-lotto', (_event, id: number) => {
    try {
      const lotto = db
        .prepare(
          `SELECT id, quantita_iniziale, quantita_residua FROM lotti_materie_prime WHERE id = ?`
        )
        .get(id) as
        | { id: number; quantita_iniziale: number; quantita_residua: number }
        | undefined
      if (!lotto) {
        return { ok: false as const, errore: 'Lotto non trovato' }
      }

      const usato = db
        .prepare(`SELECT COUNT(*) as c FROM cotta_materie_prime WHERE lotto_materia_prima_id = ?`)
        .get(id) as { c: number }
      const maiUsato =
        (usato?.c ?? 0) === 0 && lotto.quantita_residua === lotto.quantita_iniziale

      if (!maiUsato) {
        return {
          ok: false as const,
          errore: 'Lotto gia utilizzato in produzione, non eliminabile.'
        }
      }

      db.prepare(`DELETE FROM lotti_materie_prime WHERE id = ?`).run(id)
      return { ok: true as const }
    } catch (error) {
      console.error('[IPC mp:elimina-lotto]', error)
      throw error
    }
  })

  console.log('[startup] IPC handlers registrati: mp:*')
}

function registerConfIpcHandlers(): void {
  ipcMain.removeHandler('conf:lista')
  ipcMain.handle('conf:lista', () => {
    try {
      return db
        .prepare(
          `SELECT mc.*, COALESCE(gc.quantita, 0) as giacenza, b.nome as birra_nome
           FROM materiali_confezionamento mc
           LEFT JOIN giacenza_confezionamento gc ON gc.materiale_id = mc.id
           LEFT JOIN birre b ON b.id = mc.birra_id
           WHERE mc.attivo = 1
           ORDER BY mc.categoria, mc.nome`
        )
        .all()
    } catch (error) {
      console.error('[IPC conf:lista] errore:', error)
      throw error
    }
  })

  ipcMain.removeHandler('conf:crea-materiale')
  ipcMain.handle('conf:crea-materiale', (_event, dati: ConfCreaMaterialePayload) => {
    try {
      const transaction = db.transaction(() => {
        const result = db
          .prepare(
            `INSERT INTO materiali_confezionamento
             (nome, categoria, birra_id, capacita_cl, capacita_litri, soglia_riordino, attivo)
             VALUES (?, ?, ?, ?, ?, ?, 1)`
          )
          .run(
            dati.nome,
            dati.categoria,
            dati.birra_id ?? null,
            dati.capacita_cl ?? null,
            dati.capacita_litri ?? null,
            dati.soglia_riordino
          )
        const materialeId = Number(result.lastInsertRowid)

        db.prepare(
          `INSERT INTO giacenza_confezionamento (materiale_id, quantita, ultimo_aggiornamento)
           VALUES (?, 0, CURRENT_TIMESTAMP)
           ON CONFLICT(materiale_id) DO NOTHING`
        ).run(materialeId)

        return materialeId
      })

      const id = transaction()
      return { ok: true, id }
    } catch (error) {
      console.error('[IPC conf:crea-materiale] errore:', error)
      throw error
    }
  })

  ipcMain.removeHandler('conf:carico')
  ipcMain.handle('conf:carico', (_event, dati: ConfCaricoPayload) => {
    try {
      const transaction = db.transaction(() => {
        db.prepare(
          `INSERT INTO movimenti_confezionamento (materiale_id, tipo_movimento, quantita, causale, note)
           VALUES (?, 'carico', ?, 'acquisto', ?)`
        ).run(dati.materiale_id, dati.quantita, dati.note ?? null)

        db.prepare(
          `INSERT INTO giacenza_confezionamento (materiale_id, quantita, ultimo_aggiornamento)
           VALUES (?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(materiale_id) DO UPDATE SET
             quantita = giacenza_confezionamento.quantita + excluded.quantita,
             ultimo_aggiornamento = CURRENT_TIMESTAMP`
        ).run(dati.materiale_id, dati.quantita)
      })

      transaction()
      return { ok: true }
    } catch (error) {
      console.error('[IPC conf:carico] errore:', error)
      throw error
    }
  })

  ipcMain.removeHandler('conf:movimenti')
  ipcMain.handle('conf:movimenti', (_event, materiale_id: number) => {
    try {
      return db
        .prepare(`SELECT * FROM movimenti_confezionamento WHERE materiale_id = ? ORDER BY data DESC LIMIT 50`)
        .all(materiale_id)
    } catch (error) {
      console.error('[IPC conf:movimenti] errore:', error)
      throw error
    }
  })

  ipcMain.removeHandler('conf:aggiorna-soglia')
  ipcMain.handle('conf:aggiorna-soglia', (_event, dati: ConfAggiornaSogliaPayload) => {
    try {
      db.prepare(`UPDATE materiali_confezionamento SET soglia_riordino = ?, aggiornato_il = CURRENT_TIMESTAMP WHERE id = ?`).run(
        dati.soglia_riordino,
        dati.materiale_id
      )
      return { ok: true }
    } catch (error) {
      console.error('[IPC conf:aggiorna-soglia] errore:', error)
      throw error
    }
  })

  ipcMain.removeHandler('conf:modifica-movimento')
  ipcMain.handle(
    'conf:modifica-movimento',
    (_event, id: number, dati: ModificaMovimentoConfPayload) => {
      try {
        const movimento = db
          .prepare(
            `SELECT id, materiale_id, tipo_movimento, quantita FROM movimenti_confezionamento WHERE id = ?`
          )
          .get(id) as
          | { id: number; materiale_id: number; tipo_movimento: string; quantita: number }
          | undefined
        if (!movimento) {
          return { ok: false as const, errore: 'Movimento non trovato' }
        }
        if (movimento.tipo_movimento !== 'carico') {
          return {
            ok: false as const,
            errore: 'Solo i movimenti di carico sono modificabili'
          }
        }
        if (!Number.isFinite(dati.quantita) || dati.quantita <= 0) {
          return { ok: false as const, errore: 'Quantita non valida' }
        }

        const delta = dati.quantita - movimento.quantita

        const transaction = db.transaction(() => {
          db.prepare(
            `UPDATE movimenti_confezionamento SET quantita = ?, note = ? WHERE id = ?`
          ).run(dati.quantita, dati.note ?? null, id)

          if (delta !== 0) {
            db.prepare(
              `INSERT INTO giacenza_confezionamento (materiale_id, quantita, ultimo_aggiornamento)
               VALUES (?, 0, CURRENT_TIMESTAMP)
               ON CONFLICT(materiale_id) DO NOTHING`
            ).run(movimento.materiale_id)
            db.prepare(
              `UPDATE giacenza_confezionamento
               SET quantita = quantita + ?, ultimo_aggiornamento = CURRENT_TIMESTAMP
               WHERE materiale_id = ?`
            ).run(delta, movimento.materiale_id)
          }
        })

        transaction()
        return { ok: true as const }
      } catch (error) {
        console.error('[IPC conf:modifica-movimento]', error)
        throw error
      }
    }
  )

  ipcMain.removeHandler('conf:elimina-movimento')
  ipcMain.handle('conf:elimina-movimento', (_event, id: number) => {
    try {
      const movimento = db
        .prepare(
          `SELECT id, materiale_id, tipo_movimento, quantita FROM movimenti_confezionamento WHERE id = ?`
        )
        .get(id) as
        | { id: number; materiale_id: number; tipo_movimento: string; quantita: number }
        | undefined
      if (!movimento) {
        return { ok: false as const, errore: 'Movimento non trovato' }
      }
      if (movimento.tipo_movimento !== 'carico') {
        return {
          ok: false as const,
          errore: 'Solo i movimenti di carico sono eliminabili'
        }
      }

      const transaction = db.transaction(() => {
        db.prepare(
          `UPDATE giacenza_confezionamento
           SET quantita = quantita - ?, ultimo_aggiornamento = CURRENT_TIMESTAMP
           WHERE materiale_id = ?`
        ).run(movimento.quantita, movimento.materiale_id)

        db.prepare(`DELETE FROM movimenti_confezionamento WHERE id = ?`).run(id)
      })

      transaction()
      return { ok: true as const }
    } catch (error) {
      console.error('[IPC conf:elimina-movimento]', error)
      throw error
    }
  })

  console.log('[startup] IPC handlers registrati: conf:*')
}

function registerProduzioneIpcHandlers(): void {
  ipcMain.removeHandler('prod:lista-cotte')
  ipcMain.handle('prod:lista-cotte', () => {
    try {
      return db
        .prepare(
          `SELECT c.*, b.nome as birra_nome, b.stile as birra_stile,
                  conf.bottiglie_prodotte, conf.data_scadenza
           FROM cotte c
           JOIN birre b ON b.id = c.birra_id
           LEFT JOIN confezionamento conf ON conf.cotta_id = c.id
           ORDER BY c.data_inizio DESC`
        )
        .all()
    } catch (error) {
      console.error('[IPC prod:lista-cotte] errore:', error)
      throw error
    }
  })

  ipcMain.removeHandler('prod:birre-attive')
  ipcMain.handle('prod:birre-attive', () => {
    try {
      return db
        .prepare(
          `SELECT b.*, r.id as ricetta_id, r.versione, r.cotta_litri_riferimento
           FROM birre b
           JOIN ricette r ON r.birra_id = b.id AND r.attiva = 1
           WHERE b.attiva = 1`
        )
        .all()
    } catch (error) {
      console.error('[IPC prod:birre-attive] errore:', error)
      throw error
    }
  })

  ipcMain.removeHandler('prod:ingredienti-ricetta')
  ipcMain.handle('prod:ingredienti-ricetta', (_event, ricetta_id: number) => {
    try {
      return db
        .prepare(
          `SELECT ri.*, mp.nome as mp_nome, mp.unita_misura,
                  COALESCE(SUM(l.quantita_residua), 0) as giacenza_totale
           FROM ricetta_ingredienti ri
           JOIN materie_prime mp ON mp.id = ri.materia_prima_id
           LEFT JOIN lotti_materie_prime l ON l.materia_prima_id = ri.materia_prima_id AND l.quantita_residua > 0
           WHERE ri.ricetta_id = ?
           GROUP BY ri.id
           ORDER BY mp.categoria, mp.nome`
        )
        .all(ricetta_id)
    } catch (error) {
      console.error('[IPC prod:ingredienti-ricetta] errore:', error)
      throw error
    }
  })

  ipcMain.removeHandler('prod:avvia-cotta')
  ipcMain.handle('prod:avvia-cotta', (_event, dati: AvviaCottaPayload) => {
    try {
      const esistente = db
        .prepare(`SELECT id FROM cotte WHERE numero_lotto = ?`)
        .get(dati.numero_lotto) as { id: number } | undefined
      if (esistente) {
        return { ok: false, errore: `Numero lotto "${dati.numero_lotto}" gia esistente` }
      }

      const avvisi: string[] = []
      let cottaId = 0

      const transaction = db.transaction(() => {
        const insertCotta = db
          .prepare(
            `INSERT INTO cotte (numero_lotto, birra_id, ricetta_id, data_inizio, litri_teorici, stato)
             VALUES (?, ?, ?, ?, ?, 'in_corso')`
          )
          .run(dati.numero_lotto, dati.birra_id, dati.ricetta_id, dati.data_inizio, dati.litri_teorici)
        cottaId = Number(insertCotta.lastInsertRowid)

        const ingredienti = db
          .prepare(`SELECT id, materia_prima_id, quantita FROM ricetta_ingredienti WHERE ricetta_id = ?`)
          .all(dati.ricetta_id) as Array<{ id: number; materia_prima_id: number; quantita: number }>

        const getMpNome = db.prepare(`SELECT nome FROM materie_prime WHERE id = ?`)
        const getLottiDisponibili = db.prepare(
          `SELECT id, quantita_residua FROM lotti_materie_prime
           WHERE materia_prima_id = ? AND quantita_residua > 0
           ORDER BY data_scadenza ASC, id ASC`
        )
        const scaricaLotto = db.prepare(`UPDATE lotti_materie_prime SET quantita_residua = ? WHERE id = ?`)
        const insertCottaMp = db.prepare(
          `INSERT INTO cotta_materie_prime (cotta_id, lotto_materia_prima_id, materia_prima_id, quantita_usata)
           VALUES (?, ?, ?, ?)`
        )

        for (const ingrediente of ingredienti) {
          let rimanente = ingrediente.quantita
          const lotti = getLottiDisponibili.all(ingrediente.materia_prima_id) as Array<{
            id: number
            quantita_residua: number
          }>

          for (const lotto of lotti) {
            if (rimanente <= 0) break
            const usato = Math.min(lotto.quantita_residua, rimanente)
            scaricaLotto.run(lotto.quantita_residua - usato, lotto.id)
            insertCottaMp.run(cottaId, lotto.id, ingrediente.materia_prima_id, usato)
            rimanente -= usato
          }

          if (rimanente > 0) {
            const mp = getMpNome.get(ingrediente.materia_prima_id) as { nome: string } | undefined
            avvisi.push(
              `Giacenza insufficiente per ${mp?.nome ?? 'MP #' + ingrediente.materia_prima_id}: mancano ${rimanente}`
            )
          }
        }
      })

      transaction()
      return { ok: true, cotta_id: cottaId, avvisi }
    } catch (error) {
      console.error('[IPC prod:avvia-cotta] errore:', error)
      throw error
    }
  })

  ipcMain.removeHandler('prod:dettaglio-cotta')
  ipcMain.handle('prod:dettaglio-cotta', (_event, cotta_id: number) => {
    try {
      return db
        .prepare(
          `SELECT c.*, b.nome as birra_nome,
                  conf.bottiglie_prodotte, conf.scarto_litri,
                  conf.data_scadenza as confezionamento_data_scadenza
           FROM cotte c
           JOIN birre b ON b.id = c.birra_id
           LEFT JOIN confezionamento conf ON conf.cotta_id = c.id
           WHERE c.id = ?`
        )
        .get(cotta_id)
    } catch (error) {
      console.error('[IPC prod:dettaglio-cotta] errore:', error)
      throw error
    }
  })

  ipcMain.removeHandler('prod:materiali-cotta')
  ipcMain.handle('prod:materiali-cotta', (_event, cotta_id: number) => {
    try {
      return db
        .prepare(
          `SELECT cmp.*, mp.nome as mp_nome, mp.unita_misura, l.lotto_fornitore, l.data_scadenza
           FROM cotta_materie_prime cmp
           JOIN materie_prime mp ON mp.id = cmp.materia_prima_id
           JOIN lotti_materie_prime l ON l.id = cmp.lotto_materia_prima_id
           WHERE cmp.cotta_id = ?`
        )
        .all(cotta_id)
    } catch (error) {
      console.error('[IPC prod:materiali-cotta] errore:', error)
      throw error
    }
  })

  ipcMain.removeHandler('prod:confezionamento-fusti')
  ipcMain.handle('prod:confezionamento-fusti', (_event, cotta_id: number) => {
    try {
      return db
        .prepare(
          `SELECT cf.id, cf.confezionamento_id, cf.materiale_id, cf.quantita,
                  mc.nome as formato_nome, mc.capacita_litri
           FROM confezionamento_fusti cf
           JOIN confezionamento conf ON conf.id = cf.confezionamento_id
           JOIN materiali_confezionamento mc ON mc.id = cf.materiale_id
           WHERE conf.cotta_id = ?
           ORDER BY mc.capacita_litri, mc.nome`
        )
        .all(cotta_id) as Array<{
        id: number
        confezionamento_id: number
        materiale_id: number
        quantita: number
        formato_nome: string
        capacita_litri: number | null
      }>
    } catch (error) {
      console.error('[IPC prod:confezionamento-fusti]', error)
      throw error
    }
  })

  ipcMain.removeHandler('prod:modifica-confezionamento')
  ipcMain.handle(
    'prod:modifica-confezionamento',
    (_event, cotta_id: number, dati: ModificaConfezionamentoPayload) => {
      try {
        if (!Number.isFinite(dati.bottiglie_prodotte) || dati.bottiglie_prodotte < 0) {
          return { ok: false as const, errore: 'Bottiglie prodotte non valide' }
        }
        if (!dati.data_scadenza || !dati.data_confezionamento) {
          return { ok: false as const, errore: 'Date obbligatorie mancanti' }
        }

        const cotta = db
          .prepare(`SELECT id, stato FROM cotte WHERE id = ?`)
          .get(cotta_id) as { id: number; stato: string } | undefined
        if (!cotta) {
          return { ok: false as const, errore: 'Cotta non trovata' }
        }
        if (cotta.stato !== 'confezionata') {
          return {
            ok: false as const,
            errore: 'La cotta non risulta confezionata'
          }
        }

        const confVecchio = db
          .prepare(
            `SELECT id, bottiglie_prodotte
             FROM confezionamento WHERE cotta_id = ?`
          )
          .get(cotta_id) as
          | { id: number; bottiglie_prodotte: number }
          | undefined
        if (!confVecchio) {
          return { ok: false as const, errore: 'Confezionamento non trovato' }
        }

        const fustiVecchi = db
          .prepare(
            `SELECT cf.id, cf.materiale_id, cf.quantita
             FROM confezionamento_fusti cf
             WHERE cf.confezionamento_id = ?`
          )
          .all(confVecchio.id) as Array<{ id: number; materiale_id: number; quantita: number }>

        const fustiNuoviMap = new Map<number, number>()
        for (const fusto of dati.fusti ?? []) {
          const q = Number.isFinite(fusto.quantita) ? Math.max(0, Math.floor(fusto.quantita)) : 0
          fustiNuoviMap.set(fusto.materiale_id, q)
        }

        const transaction = db.transaction(() => {
          db.prepare(
            `UPDATE confezionamento
             SET bottiglie_prodotte = ?,
                 cartoni_prodotti = 0,
                 scarto_litri = ?,
                 data_scadenza = ?
             WHERE cotta_id = ?`
          ).run(
            dati.bottiglie_prodotte,
            dati.scarto_litri ?? null,
            dati.data_scadenza,
            cotta_id
          )

          db.prepare(
            `UPDATE cotte
             SET data_confezionamento = ?, aggiornato_il = CURRENT_TIMESTAMP
             WHERE id = ?`
          ).run(dati.data_confezionamento, cotta_id)

          const updateFusto = db.prepare(
            `UPDATE confezionamento_fusti SET quantita = ? WHERE id = ?`
          )
          for (const vecchio of fustiVecchi) {
            const nuovaQuantita = fustiNuoviMap.get(vecchio.materiale_id)
            if (nuovaQuantita === undefined) continue
            if (nuovaQuantita !== vecchio.quantita) {
              updateFusto.run(nuovaQuantita, vecchio.id)
            }
          }

          const giacenzaVecchia = db
            .prepare(
              `SELECT id, bottiglie_sfuse
               FROM giacenza_prodotto_finito_cartoni WHERE cotta_id = ?`
            )
            .get(cotta_id) as
            | { id: number; bottiglie_sfuse: number }
            | undefined
          const deltaBottiglie = dati.bottiglie_prodotte - (confVecchio.bottiglie_prodotte ?? 0)
          if (giacenzaVecchia) {
            if (deltaBottiglie !== 0) {
              db.prepare(
                `UPDATE giacenza_prodotto_finito_cartoni
                 SET cartoni_disponibili = 0,
                     bottiglie_sfuse = bottiglie_sfuse + ?
                 WHERE cotta_id = ?`
              ).run(deltaBottiglie, cotta_id)
            }
          } else if (dati.bottiglie_prodotte > 0) {
            db.prepare(
              `INSERT INTO giacenza_prodotto_finito_cartoni
                 (cotta_id, cartoni_disponibili, bottiglie_sfuse)
               VALUES (?, 0, ?)`
            ).run(cotta_id, dati.bottiglie_prodotte)
          }

          for (const vecchio of fustiVecchi) {
            const nuovaQuantita = fustiNuoviMap.get(vecchio.materiale_id)
            if (nuovaQuantita === undefined) continue
            const deltaFusto = nuovaQuantita - vecchio.quantita
            if (deltaFusto === 0) continue

            const giacenzaEsiste = db
              .prepare(
                `SELECT id FROM giacenza_prodotto_finito_fusti WHERE cotta_id = ? AND materiale_id = ?`
              )
              .get(cotta_id, vecchio.materiale_id) as { id: number } | undefined
            if (giacenzaEsiste) {
              db.prepare(
                `UPDATE giacenza_prodotto_finito_fusti
                 SET quantita_disponibile = quantita_disponibile + ?
                 WHERE cotta_id = ? AND materiale_id = ?`
              ).run(deltaFusto, cotta_id, vecchio.materiale_id)
            } else if (nuovaQuantita > 0) {
              db.prepare(
                `INSERT INTO giacenza_prodotto_finito_fusti (cotta_id, materiale_id, quantita_disponibile)
                 VALUES (?, ?, ?)`
              ).run(cotta_id, vecchio.materiale_id, nuovaQuantita)
            }
          }

          const scarichiProduzione = db
            .prepare(
              `SELECT mov.id, mov.materiale_id, mov.quantita, mc.categoria
               FROM movimenti_confezionamento mov
               JOIN materiali_confezionamento mc ON mc.id = mov.materiale_id
               WHERE mov.tipo_movimento = 'scarico'
                 AND mov.causale = 'produzione'
                 AND mov.riferimento = ?`
            )
            .all(String(cotta_id)) as Array<{
            id: number
            materiale_id: number
            quantita: number
            categoria: string
          }>

          const updateMov = db.prepare(
            `UPDATE movimenti_confezionamento SET quantita = ? WHERE id = ?`
          )
          const updateGiacenzaConf = db.prepare(
            `UPDATE giacenza_confezionamento
             SET quantita = quantita + ?, ultimo_aggiornamento = CURRENT_TIMESTAMP
             WHERE materiale_id = ?`
          )

          for (const scarico of scarichiProduzione) {
            let nuovaQuantita = scarico.quantita
            if (scarico.categoria === 'fusto') {
              const q = fustiNuoviMap.get(scarico.materiale_id)
              if (q === undefined) continue
              nuovaQuantita = q
            } else {
              nuovaQuantita = dati.bottiglie_prodotte
            }

            const deltaGiacenza = scarico.quantita - nuovaQuantita
            if (nuovaQuantita !== scarico.quantita) {
              updateMov.run(nuovaQuantita, scarico.id)
            }
            if (deltaGiacenza !== 0) {
              updateGiacenzaConf.run(deltaGiacenza, scarico.materiale_id)
            }
          }
        })

        transaction()
        return { ok: true as const, bottiglie_prodotte: dati.bottiglie_prodotte }
      } catch (error) {
        console.error('[IPC prod:modifica-confezionamento]', error)
        throw error
      }
    }
  )

  ipcMain.removeHandler('prod:confeziona')
  ipcMain.handle('prod:confeziona', (_event, dati: ConfezionaPayload) => {
    try {
      const getConfig = db.prepare(`SELECT valore FROM configurazioni WHERE chiave = ?`)
      const shelfLifeRow = getConfig.get('shelf_life_mesi') as { valore: string } | undefined

      const shelfLifeMesi = Number(shelfLifeRow?.valore ?? 13)

      const oggi = new Date()
      const oggiIso = oggi.toISOString().split('T')[0]
      const dataScadenzaDate = new Date(oggi)
      dataScadenzaDate.setMonth(dataScadenzaDate.getMonth() + shelfLifeMesi)
      const dataScadenzaIso = dataScadenzaDate.toISOString().split('T')[0]

      const cotta = db
        .prepare(`SELECT c.birra_id FROM cotte c WHERE c.id = ?`)
        .get(dati.cotta_id) as { birra_id: number } | undefined
      if (!cotta) {
        return { ok: false, errore: 'Cotta non trovata' }
      }

      const transaction = db.transaction(() => {
        const insertConf = db
          .prepare(
            `INSERT INTO confezionamento (cotta_id, bottiglie_prodotte, cartoni_prodotti, scarto_litri, data_scadenza)
             VALUES (?, ?, 0, ?, ?)`
          )
          .run(dati.cotta_id, dati.bottiglie_prodotte, dati.scarto_litri ?? null, dataScadenzaIso)
        const confezionamentoId = Number(insertConf.lastInsertRowid)

        const insertConfFusti = db.prepare(
          `INSERT INTO confezionamento_fusti (confezionamento_id, materiale_id, quantita) VALUES (?, ?, ?)`
        )
        for (const fusto of dati.fusti) {
          if (fusto.quantita > 0) {
            insertConfFusti.run(confezionamentoId, fusto.materiale_id, fusto.quantita)
          }
        }

        db.prepare(
          `INSERT INTO giacenza_prodotto_finito_cartoni (cotta_id, cartoni_disponibili, bottiglie_sfuse) VALUES (?, 0, ?)`
        ).run(dati.cotta_id, dati.bottiglie_prodotte)

        const insertGiacenzaFusti = db.prepare(
          `INSERT INTO giacenza_prodotto_finito_fusti (cotta_id, materiale_id, quantita_disponibile) VALUES (?, ?, ?)`
        )
        for (const fusto of dati.fusti) {
          if (fusto.quantita > 0) {
            insertGiacenzaFusti.run(dati.cotta_id, fusto.materiale_id, fusto.quantita)
          }
        }

        db.prepare(
          `UPDATE cotte SET stato = 'confezionata', data_confezionamento = ?, aggiornato_il = CURRENT_TIMESTAMP WHERE id = ?`
        ).run(oggiIso, dati.cotta_id)

        const scaricaGiacenza = (materialeId: number, quantita: number, causale: string): void => {
          db.prepare(
            `INSERT INTO giacenza_confezionamento (materiale_id, quantita, ultimo_aggiornamento)
             VALUES (?, 0, CURRENT_TIMESTAMP)
             ON CONFLICT(materiale_id) DO NOTHING`
          ).run(materialeId)
          db.prepare(
            `UPDATE giacenza_confezionamento SET quantita = quantita - ?, ultimo_aggiornamento = CURRENT_TIMESTAMP WHERE materiale_id = ?`
          ).run(quantita, materialeId)
          db.prepare(
            `INSERT INTO movimenti_confezionamento (materiale_id, tipo_movimento, quantita, causale, riferimento)
             VALUES (?, 'scarico', ?, ?, ?)`
          ).run(materialeId, quantita, causale, String(dati.cotta_id))
        }

        if (dati.bottiglie_prodotte > 0) {
          const bottiglia = db
            .prepare(`SELECT id FROM materiali_confezionamento WHERE categoria = 'bottiglia' AND attivo = 1 LIMIT 1`)
            .get() as { id: number } | undefined
          if (bottiglia) scaricaGiacenza(bottiglia.id, dati.bottiglie_prodotte, 'produzione')

          const tappo = db
            .prepare(`SELECT id FROM materiali_confezionamento WHERE categoria = 'tappo' AND attivo = 1 LIMIT 1`)
            .get() as { id: number } | undefined
          if (tappo) scaricaGiacenza(tappo.id, dati.bottiglie_prodotte, 'produzione')

          const etichetta = db
            .prepare(
              `SELECT id FROM materiali_confezionamento WHERE categoria = 'etichetta' AND birra_id = ? AND attivo = 1 LIMIT 1`
            )
            .get(cotta.birra_id) as { id: number } | undefined
          if (etichetta) scaricaGiacenza(etichetta.id, dati.bottiglie_prodotte, 'produzione')
        }

        for (const fusto of dati.fusti) {
          if (fusto.quantita > 0) {
            scaricaGiacenza(fusto.materiale_id, fusto.quantita, 'produzione')
          }
        }
      })

      transaction()
      return { ok: true }
    } catch (error) {
      console.error('[IPC prod:confeziona] errore:', error)
      throw error
    }
  })

  console.log('[startup] IPC handlers registrati: prod:*')
}

function registerProdottoFinitoIpcHandlers(): void {
  ipcMain.removeHandler('pf:giacenze')
  ipcMain.handle('pf:giacenze', () => {
    try {
      return db
        .prepare(
          `SELECT
             c.id as cotta_id,
             c.numero_lotto,
             b.nome as birra_nome,
             b.stile,
             conf.data_scadenza,
             conf.bottiglie_prodotte,
             COALESCE(gpc.bottiglie_sfuse, 0) as bottiglie_disponibili,
             c.data_confezionamento,
             (
               SELECT COALESCE(SUM(gpf.quantita_disponibile), 0)
               FROM giacenza_prodotto_finito_fusti gpf
               WHERE gpf.cotta_id = c.id
             ) as fusti_disponibili
           FROM cotte c
           JOIN birre b ON b.id = c.birra_id
           JOIN confezionamento conf ON conf.cotta_id = c.id
           LEFT JOIN giacenza_prodotto_finito_cartoni gpc ON gpc.cotta_id = c.id
           WHERE c.stato = 'confezionata'
             AND (
               COALESCE(gpc.bottiglie_sfuse, 0) > 0
               OR (
                 SELECT COALESCE(SUM(gpf.quantita_disponibile), 0)
                 FROM giacenza_prodotto_finito_fusti gpf
                 WHERE gpf.cotta_id = c.id
               ) > 0
             )
           ORDER BY conf.data_scadenza ASC`
        )
        .all()
    } catch (error) {
      console.error('[IPC pf:giacenze] errore:', error)
      throw error
    }
  })

  ipcMain.removeHandler('pf:fusti-attivi')
  ipcMain.handle('pf:fusti-attivi', () => {
    try {
      return db
        .prepare(
          `SELECT id, nome, capacita_litri
           FROM materiali_confezionamento
           WHERE categoria = 'fusto' AND attivo = 1
           ORDER BY capacita_litri, nome`
        )
        .all() as Array<{ id: number; nome: string; capacita_litri: number | null }>
    } catch (error) {
      console.error('[IPC pf:fusti-attivi]', error)
      throw error
    }
  })

  ipcMain.removeHandler('pf:carico-iniziale')
  ipcMain.handle('pf:carico-iniziale', (_event, dati: CaricoInizialePayload) => {
    try {
      const numeroLottoInput = (dati.numero_lotto ?? '').trim()
      if (!numeroLottoInput) {
        return { ok: false as const, errore: 'Numero lotto obbligatorio' }
      }
      if (!dati.birra_id) {
        return { ok: false as const, errore: 'Birra obbligatoria' }
      }
      if (!dati.data_scadenza) {
        return { ok: false as const, errore: 'Data scadenza obbligatoria' }
      }
      const esistente = db
        .prepare(`SELECT id FROM cotte WHERE numero_lotto = ?`)
        .get(numeroLottoInput) as { id: number } | undefined
      if (esistente) {
        return {
          ok: false as const,
          errore: `Numero lotto "${numeroLottoInput}" gia esistente`
        }
      }
      const bottiglieNum =
        dati.bottiglie != null && Number.isFinite(dati.bottiglie) && dati.bottiglie > 0
          ? Math.floor(dati.bottiglie)
          : 0
      const fustiValidi = (dati.fusti ?? []).filter(
        (fusto) => Number.isFinite(fusto.quantita) && fusto.quantita > 0
      )
      if (bottiglieNum === 0 && fustiValidi.length === 0) {
        return {
          ok: false as const,
          errore: 'Inserisci almeno un quantitativo (bottiglie o fusti)'
        }
      }

      const ricetta = db
        .prepare(`SELECT id FROM ricette WHERE birra_id = ? AND attiva = 1 LIMIT 1`)
        .get(dati.birra_id) as { id: number } | undefined
      if (!ricetta) {
        return { ok: false as const, errore: 'Nessuna ricetta attiva per la birra selezionata' }
      }

      const numeroLotto = numeroLottoInput
      const oggiIso = new Date().toISOString().split('T')[0]
      const noteFinali = `Carico iniziale — ${(dati.note ?? '').trim()}`

      let cottaId = 0

      const transaction = db.transaction(() => {
        const insCotta = db
          .prepare(
            `INSERT INTO cotte
               (numero_lotto, birra_id, ricetta_id, data_inizio, data_confezionamento,
                litri_teorici, stato, note)
             VALUES (?, ?, ?, ?, ?, 0, 'confezionata', ?)`
          )
          .run(numeroLotto, dati.birra_id, ricetta.id, oggiIso, oggiIso, noteFinali)
        cottaId = Number(insCotta.lastInsertRowid)

        const insConf = db
          .prepare(
            `INSERT INTO confezionamento
               (cotta_id, bottiglie_prodotte, cartoni_prodotti, scarto_litri, data_scadenza)
             VALUES (?, ?, 0, 0, ?)`
          )
          .run(cottaId, bottiglieNum, dati.data_scadenza)
        const confezionamentoId = Number(insConf.lastInsertRowid)

        const insFusto = db.prepare(
          `INSERT INTO confezionamento_fusti (confezionamento_id, materiale_id, quantita)
           VALUES (?, ?, ?)`
        )
        for (const fusto of fustiValidi) {
          insFusto.run(confezionamentoId, fusto.materiale_id, fusto.quantita)
        }

        if (bottiglieNum > 0) {
          db.prepare(
            `INSERT INTO giacenza_prodotto_finito_cartoni (cotta_id, cartoni_disponibili, bottiglie_sfuse)
             VALUES (?, 0, ?)`
          ).run(cottaId, bottiglieNum)
        }

        const insGiacenzaFusto = db.prepare(
          `INSERT INTO giacenza_prodotto_finito_fusti (cotta_id, materiale_id, quantita_disponibile)
           VALUES (?, ?, ?)`
        )
        for (const fusto of fustiValidi) {
          insGiacenzaFusto.run(cottaId, fusto.materiale_id, fusto.quantita)
        }
      })

      transaction()
      return { ok: true as const, cotta_id: cottaId, numero_lotto: numeroLotto }
    } catch (error) {
      console.error('[IPC pf:carico-iniziale]', error)
      throw error
    }
  })

  ipcMain.removeHandler('pf:giacenze-fusti')
  ipcMain.handle('pf:giacenze-fusti', () => {
    try {
      return db
        .prepare(
          `SELECT
             gpf.cotta_id,
             gpf.materiale_id,
             gpf.quantita_disponibile,
             mc.nome as formato_nome,
             mc.capacita_litri,
             c.numero_lotto,
             b.nome as birra_nome,
             conf.data_scadenza
           FROM giacenza_prodotto_finito_fusti gpf
           JOIN materiali_confezionamento mc ON mc.id = gpf.materiale_id
           JOIN cotte c ON c.id = gpf.cotta_id
           JOIN birre b ON b.id = c.birra_id
           JOIN confezionamento conf ON conf.cotta_id = gpf.cotta_id
           WHERE gpf.quantita_disponibile > 0
           ORDER BY conf.data_scadenza ASC`
        )
        .all()
    } catch (error) {
      console.error('[IPC pf:giacenze-fusti] errore:', error)
      throw error
    }
  })

  ipcMain.removeHandler('pf:suggerisci-lotto-bottiglie')
  ipcMain.handle('pf:suggerisci-lotto-bottiglie', (_event, birra_id: number) => {
    try {
      if (!birra_id || !Number.isFinite(birra_id)) {
        return []
      }

      return db
        .prepare(
          `SELECT
             c.id as cotta_id,
             c.numero_lotto,
             conf.data_scadenza,
             COALESCE(gpc.bottiglie_sfuse, 0) as bottiglie_disponibili
           FROM cotte c
           JOIN confezionamento conf ON conf.cotta_id = c.id
           LEFT JOIN giacenza_prodotto_finito_cartoni gpc ON gpc.cotta_id = c.id
           WHERE c.birra_id = ?
             AND c.stato = 'confezionata'
             AND COALESCE(gpc.bottiglie_sfuse, 0) > 0
           ORDER BY COALESCE(gpc.bottiglie_sfuse, 0) DESC, conf.data_scadenza ASC`
        )
        .all(birra_id)
    } catch (error) {
      console.error('[IPC pf:suggerisci-lotto-bottiglie] errore:', error)
      throw error
    }
  })

  ipcMain.removeHandler('pf:togli-bottiglie')
  ipcMain.handle(
    'pf:togli-bottiglie',
    (_event, dati: { cotta_id: number; quantita: number; causale?: string | null }) => {
      try {
        if (!dati?.cotta_id || !Number.isFinite(dati.cotta_id)) {
          return { ok: false as const, errore: 'Lotto non valido' }
        }
        if (!Number.isFinite(dati.quantita) || dati.quantita <= 0) {
          return { ok: false as const, errore: 'Quantita non valida' }
        }
        const quantita = Math.floor(dati.quantita)

        const esegui = db.transaction(() => {
          const scarico = scaricaBottiglieDaLotto(dati.cotta_id, quantita)
          if (!scarico.ok) {
            throw new Error(scarico.errore)
          }
          aggiornaStatoCotta(dati.cotta_id)
        })
        esegui()
        return { ok: true as const }
      } catch (error) {
        console.error('[IPC pf:togli-bottiglie] errore:', error)
        const msg = error instanceof Error ? error.message : 'Errore durante lo scarico'
        return { ok: false as const, errore: msg }
      }
    }
  )

  console.log('[startup] IPC handlers registrati: pf:*')
}

/**
 * Scarica `quantita` bottiglie dalla giacenza (campo bottiglie_sfuse).
 * La gestione e' solo in bottiglie singole: niente piu' cartoni.
 */
function scaricaBottiglieDaLotto(
  cotta_id: number,
  quantita: number
): { ok: true } | { ok: false; errore: string } {
  const giacenza = db
    .prepare(
      `SELECT id, bottiglie_sfuse
       FROM giacenza_prodotto_finito_cartoni WHERE cotta_id = ?`
    )
    .get(cotta_id) as { id: number; bottiglie_sfuse: number } | undefined
  if (!giacenza) {
    return { ok: false, errore: 'Nessuna giacenza bottiglie per questo lotto' }
  }
  if (giacenza.bottiglie_sfuse < quantita) {
    return {
      ok: false,
      errore: `Giacenza insufficiente (disponibili: ${giacenza.bottiglie_sfuse}, richieste: ${quantita})`
    }
  }

  db.prepare(
    `UPDATE giacenza_prodotto_finito_cartoni
     SET bottiglie_sfuse = bottiglie_sfuse - ?
     WHERE id = ?`
  ).run(quantita, giacenza.id)
  return { ok: true }
}

/** Ripristina bottiglie in un lotto (operazione inversa di scarico). */
function rimettiBottiglieInLotto(cotta_id: number, quantita: number): void {
  if (quantita <= 0) return
  const esiste = db
    .prepare(`SELECT id FROM giacenza_prodotto_finito_cartoni WHERE cotta_id = ?`)
    .get(cotta_id) as { id: number } | undefined
  if (esiste) {
    db.prepare(
      `UPDATE giacenza_prodotto_finito_cartoni
       SET bottiglie_sfuse = bottiglie_sfuse + ?
       WHERE cotta_id = ?`
    ).run(quantita, cotta_id)
  } else {
    db.prepare(
      `INSERT INTO giacenza_prodotto_finito_cartoni (cotta_id, cartoni_disponibili, bottiglie_sfuse)
       VALUES (?, 0, ?)`
    ).run(cotta_id, quantita)
  }
}

function aggiornaStatoCotta(cotta_id: number): void {
  const gpc = db
    .prepare(
      `SELECT COALESCE(bottiglie_sfuse, 0) as b
       FROM giacenza_prodotto_finito_cartoni WHERE cotta_id = ?`
    )
    .get(cotta_id) as { b: number } | undefined
  const sumF = db
    .prepare(
      `SELECT COALESCE(SUM(quantita_disponibile), 0) as s
       FROM giacenza_prodotto_finito_fusti WHERE cotta_id = ?`
    )
    .get(cotta_id) as { s: number }
  const totaleProdotti = (gpc?.b ?? 0) + (sumF?.s ?? 0)
  const stato = db.prepare(`SELECT stato FROM cotte WHERE id = ?`).get(cotta_id) as
    | { stato: string }
    | undefined
  if (totaleProdotti === 0 && stato?.stato !== 'esaurita') {
    db.prepare(
      `UPDATE cotte SET stato = 'esaurita', aggiornato_il = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(cotta_id)
  } else if (totaleProdotti > 0 && stato?.stato === 'esaurita') {
    db.prepare(
      `UPDATE cotte SET stato = 'confezionata', aggiornato_il = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(cotta_id)
  }
}

function registerClientiIpcHandlers(): void {
  ipcMain.removeHandler('clienti:lista')
  ipcMain.handle('clienti:lista', () => {
    try {
      return db
        .prepare(
          `SELECT cl.*,
              MAX(v.data) as ultima_vendita,
              COUNT(v.id) as totale_vendite
            FROM clienti cl
            LEFT JOIN vendite v ON v.cliente_id = cl.id
            WHERE cl.attivo = 1
            GROUP BY cl.id
            ORDER BY cl.nome`
        )
        .all()
    } catch (error) {
      console.error('[IPC clienti:lista] errore:', error)
      throw error
    }
  })

  ipcMain.removeHandler('clienti:crea')
  ipcMain.handle('clienti:crea', (_event, dati: ClientePayload) => {
    try {
      const result = db
        .prepare(
          `INSERT INTO clienti
           (nome, partita_iva, indirizzo, telefono, email, tipo_cliente, note, attivo)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1)`
        )
        .run(
          dati.nome,
          dati.partita_iva?.trim() || null,
          dati.indirizzo?.trim() || null,
          dati.telefono?.trim() || null,
          dati.email?.trim() || null,
          dati.tipo_cliente,
          dati.note?.trim() || null
        )
      return { ok: true, id: Number(result.lastInsertRowid) }
    } catch (error) {
      console.error('[IPC clienti:crea] errore:', error)
      throw error
    }
  })

  ipcMain.removeHandler('clienti:aggiorna')
  ipcMain.handle('clienti:aggiorna', (_event, id: number, dati: ClientePayload) => {
    try {
      db.prepare(
        `UPDATE clienti SET
            nome = ?,
            partita_iva = ?,
            indirizzo = ?,
            telefono = ?,
            email = ?,
            tipo_cliente = ?,
            note = ?,
            aggiornato_il = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).run(
        dati.nome,
        dati.partita_iva?.trim() || null,
        dati.indirizzo?.trim() || null,
        dati.telefono?.trim() || null,
        dati.email?.trim() || null,
        dati.tipo_cliente,
        dati.note?.trim() || null,
        id
      )
      return { ok: true }
    } catch (error) {
      console.error('[IPC clienti:aggiorna] errore:', error)
      throw error
    }
  })

  ipcMain.removeHandler('clienti:disattiva')
  ipcMain.handle('clienti:disattiva', (_event, id: number) => {
    try {
      db.prepare(`UPDATE clienti SET attivo = 0, aggiornato_il = CURRENT_TIMESTAMP WHERE id = ?`).run(
        id
      )
      return { ok: true }
    } catch (error) {
      console.error('[IPC clienti:disattiva] errore:', error)
      throw error
    }
  })

  ipcMain.removeHandler('clienti:storico-vendite')
  ipcMain.handle('clienti:storico-vendite', (_event, clienteId: number) => {
    try {
      return db
        .prepare(
          `SELECT
             v.id,
             v.data,
             v.note,
             v.omaggio,
             v.occasione,
             COALESCE(SUM(CASE WHEN vd.tipo_prodotto = 'fusto' THEN vd.quantita ELSE 0 END), 0) as totale_fusti,
             COALESCE(SUM(CASE WHEN vd.tipo_prodotto = 'bottiglia' THEN vd.quantita ELSE 0 END), 0) as totale_bottiglie
           FROM vendite v
           JOIN vendita_dettaglio vd ON vd.vendita_id = v.id
           WHERE v.cliente_id = ?
           GROUP BY v.id
           ORDER BY v.data DESC
           LIMIT 20`
        )
        .all(clienteId)
    } catch (error) {
      console.error('[IPC clienti:storico-vendite] errore:', error)
      throw error
    }
  })

  console.log('[startup] IPC handlers registrati: clienti:*')
}

function registerVenditeIpcHandlers(): void {
  ipcMain.removeHandler('vendite:lista')
  ipcMain.handle('vendite:lista', () => {
    try {
      return db
        .prepare(
          `SELECT v.*, cl.nome as cliente_nome,
            COALESCE(SUM(CASE WHEN vd.tipo_prodotto = 'fusto' THEN vd.quantita ELSE 0 END), 0) as totale_fusti,
            COALESCE(SUM(CASE WHEN vd.tipo_prodotto = 'bottiglia' THEN vd.quantita ELSE 0 END), 0) as totale_bottiglie
          FROM vendite v
          LEFT JOIN clienti cl ON cl.id = v.cliente_id
          JOIN vendita_dettaglio vd ON vd.vendita_id = v.id
          GROUP BY v.id
          ORDER BY v.data DESC`
        )
        .all()
    } catch (error) {
      console.error('[IPC vendite:lista] errore:', error)
      throw error
    }
  })

  ipcMain.removeHandler('vendite:dettaglio')
  ipcMain.handle('vendite:dettaglio', (_event, venditaId: number) => {
    try {
      return db
        .prepare(
          `SELECT vd.*, b.nome as birra_nome, c.numero_lotto,
            mc.nome as formato_nome
            FROM vendita_dettaglio vd
            JOIN cotte c ON c.id = vd.cotta_id
            JOIN birre b ON b.id = c.birra_id
            LEFT JOIN materiali_confezionamento mc ON mc.id = vd.materiale_id
            WHERE vd.vendita_id = ?`
        )
        .all(venditaId)
    } catch (error) {
      console.error('[IPC vendite:dettaglio] errore:', error)
      throw error
    }
  })

  ipcMain.removeHandler('vendite:giacenze-disponibili')
  ipcMain.handle('vendite:giacenze-disponibili', () => {
    try {
      return db
        .prepare(
          `SELECT 'bottiglia' as tipo, c.id as cotta_id, c.numero_lotto,
            b.nome as birra_nome, gpc.bottiglie_sfuse as quantita_disponibile,
            conf.data_scadenza, NULL as materiale_id, NULL as formato_nome
          FROM giacenza_prodotto_finito_cartoni gpc
          JOIN cotte c ON c.id = gpc.cotta_id
          JOIN birre b ON b.id = c.birra_id
          JOIN confezionamento conf ON conf.cotta_id = c.id
          WHERE gpc.bottiglie_sfuse > 0
          UNION ALL
          SELECT 'fusto' as tipo, c.id as cotta_id, c.numero_lotto,
            b.nome as birra_nome, gpf.quantita_disponibile,
            conf.data_scadenza, gpf.materiale_id, mc.nome as formato_nome
          FROM giacenza_prodotto_finito_fusti gpf
          JOIN cotte c ON c.id = gpf.cotta_id
          JOIN birre b ON b.id = c.birra_id
          JOIN confezionamento conf ON conf.cotta_id = c.id
          JOIN materiali_confezionamento mc ON mc.id = gpf.materiale_id
          WHERE gpf.quantita_disponibile > 0
          ORDER BY birra_nome, tipo`
        )
        .all()
    } catch (error) {
      console.error('[IPC vendite:giacenze-disponibili] errore:', error)
      throw error
    }
  })

  ipcMain.removeHandler('vendite:registra')
  ipcMain.handle('vendite:registra', (_event, dati: VenditeRegistraPayload) => {
    try {
      if (dati.righe.length === 0) {
        return { ok: false, errore: 'Aggiungi almeno un prodotto' }
      }
      const omaggio = dati.omaggio === true
      if (!omaggio && (dati.cliente_id == null || !Number.isFinite(dati.cliente_id))) {
        return { ok: false, errore: 'Cliente obbligatorio per una vendita non omaggio' }
      }
      const clienteId = omaggio ? (dati.cliente_id ?? null) : Number(dati.cliente_id)
      const occasione = omaggio ? (dati.occasione?.trim() || null) : null
      for (const r of dati.righe) {
        if (!Number.isFinite(r.quantita) || r.quantita <= 0) {
          return { ok: false, errore: 'Ogni quantita deve essere maggiore di zero' }
        }
        if (r.tipo_prodotto === 'fusto' && (r.materiale_id == null || r.materiale_id === undefined)) {
          return { ok: false, errore: 'I fusti richiedono il formato' }
        }
        if (r.tipo_prodotto !== 'fusto' && r.tipo_prodotto !== 'bottiglia') {
          return { ok: false, errore: 'Tipo prodotto non valido' }
        }
      }

      const esegui = db.transaction((): number => {
        const insVendita = db
          .prepare(
            `INSERT INTO vendite (cliente_id, data, note, omaggio, occasione)
             VALUES (?, ?, ?, ?, ?)`
          )
          .run(
            clienteId,
            dati.data,
            dati.note?.trim() || null,
            omaggio ? 1 : 0,
            occasione
          )
        const venditaId = Number(insVendita.lastInsertRowid)

        const insRiga = db
          .prepare(
            `INSERT INTO vendita_dettaglio (vendita_id, cotta_id, tipo_prodotto, materiale_id, quantita)
             VALUES (?, ?, ?, ?, ?)`
          )
        const upFust = db
          .prepare(
            `UPDATE giacenza_prodotto_finito_fusti
             SET quantita_disponibile = quantita_disponibile - ?
             WHERE cotta_id = ? AND materiale_id = ? AND quantita_disponibile >= ?`
          )

        for (const r of dati.righe) {
          insRiga.run(
            venditaId,
            r.cotta_id,
            r.tipo_prodotto,
            r.tipo_prodotto === 'fusto' ? r.materiale_id : null,
            r.quantita
          )
          if (r.tipo_prodotto === 'fusto') {
            const res = upFust.run(
              r.quantita,
              r.cotta_id,
              r.materiale_id as number,
              r.quantita
            )
            if (res.changes === 0) {
              throw new Error(`Giacenza fusti insufficiente o formato errato per la cotta selezionata`)
            }
          } else {
            const esito = scaricaBottiglieDaLotto(r.cotta_id, r.quantita)
            if (!esito.ok) {
              throw new Error(esito.errore)
            }
          }
        }

        const cottaIds = [...new Set(dati.righe.map((x) => x.cotta_id))]
        for (const cid of cottaIds) {
          aggiornaStatoCotta(cid)
        }
        return venditaId
      })
      const venditaId = esegui()
      return { ok: true, vendita_id: venditaId }
    } catch (error) {
      console.error('[IPC vendite:registra] errore:', error)
      const msg = error instanceof Error ? error.message : 'Errore durante la vendita'
      return { ok: false, errore: msg }
    }
  })

  ipcMain.removeHandler('vendite:clienti')
  ipcMain.handle('vendite:clienti', () => {
    try {
      return db
        .prepare(`SELECT id, nome FROM clienti WHERE attivo = 1 ORDER BY nome`)
        .all()
    } catch (error) {
      console.error('[IPC vendite:clienti] errore:', error)
      throw error
    }
  })

  ipcMain.removeHandler('vendite:modifica')
  ipcMain.handle('vendite:modifica', (_event, id: number, dati: VenditeModificaPayload) => {
    try {
      if (!id || !Number.isFinite(id)) {
        return { ok: false as const, errore: 'Vendita non valida' }
      }
      const omaggio = dati?.omaggio === true
      if (!omaggio && (dati?.cliente_id == null || !Number.isFinite(dati.cliente_id))) {
        return { ok: false as const, errore: 'Cliente obbligatorio per una vendita non omaggio' }
      }
      const clienteId = omaggio ? (dati?.cliente_id ?? null) : Number(dati.cliente_id)
      const occasione = omaggio ? (dati.occasione?.trim() || null) : null
      if (!dati.data) {
        return { ok: false as const, errore: 'Data obbligatoria' }
      }
      if (!Array.isArray(dati.righe) || dati.righe.length === 0) {
        return { ok: false as const, errore: 'Aggiungi almeno un prodotto' }
      }
      for (const r of dati.righe) {
        if (!Number.isFinite(r.quantita) || r.quantita <= 0) {
          return { ok: false as const, errore: 'Ogni quantita deve essere maggiore di zero' }
        }
        if (r.tipo_prodotto === 'fusto' && (r.materiale_id == null)) {
          return { ok: false as const, errore: 'I fusti richiedono il formato' }
        }
        if (r.tipo_prodotto !== 'fusto' && r.tipo_prodotto !== 'bottiglia') {
          return { ok: false as const, errore: 'Tipo prodotto non valido' }
        }
      }

      const venditaEsistente = db
        .prepare(`SELECT id FROM vendite WHERE id = ?`)
        .get(id) as { id: number } | undefined
      if (!venditaEsistente) {
        return { ok: false as const, errore: 'Vendita non trovata' }
      }

      const esegui = db.transaction(() => {
        type RigaEsistente = {
          id: number
          cotta_id: number
          tipo_prodotto: 'bottiglia' | 'fusto'
          materiale_id: number | null
          quantita: number
        }
        const righeEsistenti = db
          .prepare(
            `SELECT id, cotta_id, tipo_prodotto, materiale_id, quantita
             FROM vendita_dettaglio WHERE vendita_id = ?`
          )
          .all(id) as RigaEsistente[]
        const esistentiById = new Map<number, RigaEsistente>()
        for (const r of righeEsistenti) {
          esistentiById.set(r.id, r)
        }

        const cottaIdsCoinvolte = new Set<number>(righeEsistenti.map((r) => r.cotta_id))

        db.prepare(
          `UPDATE vendite
             SET cliente_id = ?, data = ?, note = ?, omaggio = ?, occasione = ?
           WHERE id = ?`
        ).run(
          clienteId,
          dati.data,
          dati.note?.trim() || null,
          omaggio ? 1 : 0,
          occasione,
          id
        )

        const selFusto = db.prepare(
          `SELECT id, quantita_disponibile FROM giacenza_prodotto_finito_fusti
           WHERE cotta_id = ? AND materiale_id = ?`
        )
        const upFusto = db.prepare(
          `UPDATE giacenza_prodotto_finito_fusti
           SET quantita_disponibile = quantita_disponibile + ?
           WHERE id = ?`
        )
        const subFusto = db.prepare(
          `UPDATE giacenza_prodotto_finito_fusti
           SET quantita_disponibile = quantita_disponibile - ?
           WHERE cotta_id = ? AND materiale_id = ? AND quantita_disponibile >= ?`
        )
        const insFusto = db.prepare(
          `INSERT INTO giacenza_prodotto_finito_fusti (cotta_id, materiale_id, quantita_disponibile)
           VALUES (?, ?, ?)`
        )

        const addToGiacenza = (
          cotta_id: number,
          tipo: 'bottiglia' | 'fusto',
          materiale_id: number | null,
          qty: number
        ): void => {
          if (qty <= 0) return
          if (tipo === 'bottiglia') {
            rimettiBottiglieInLotto(cotta_id, qty)
          } else {
            const riga = selFusto.get(cotta_id, materiale_id) as
              | { id: number; quantita_disponibile: number }
              | undefined
            if (riga) {
              upFusto.run(qty, riga.id)
            } else {
              insFusto.run(cotta_id, materiale_id, qty)
            }
          }
        }

        const subFromGiacenza = (
          cotta_id: number,
          tipo: 'bottiglia' | 'fusto',
          materiale_id: number | null,
          qty: number
        ): void => {
          if (qty <= 0) return
          if (tipo === 'bottiglia') {
            const esito = scaricaBottiglieDaLotto(cotta_id, qty)
            if (!esito.ok) {
              throw new Error(esito.errore)
            }
          } else {
            const res = subFusto.run(qty, cotta_id, materiale_id as number, qty)
            if (res.changes === 0) {
              throw new Error(
                'Giacenza fusti insufficiente per la modifica (formato non disponibile o quantita non sufficiente)'
              )
            }
          }
        }

        const idsPayload = new Set<number>()
        for (const r of dati.righe) {
          if (r.id != null) idsPayload.add(r.id)
        }

        for (const esistente of righeEsistenti) {
          if (!idsPayload.has(esistente.id)) {
            addToGiacenza(
              esistente.cotta_id,
              esistente.tipo_prodotto,
              esistente.materiale_id,
              esistente.quantita
            )
            db.prepare(`DELETE FROM vendita_dettaglio WHERE id = ?`).run(esistente.id)
          }
        }

        const upRiga = db.prepare(
          `UPDATE vendita_dettaglio SET quantita = ? WHERE id = ? AND vendita_id = ?`
        )
        const insRiga = db.prepare(
          `INSERT INTO vendita_dettaglio (vendita_id, cotta_id, tipo_prodotto, materiale_id, quantita)
           VALUES (?, ?, ?, ?, ?)`
        )

        for (const r of dati.righe) {
          cottaIdsCoinvolte.add(r.cotta_id)
          if (r.id != null) {
            const esistente = esistentiById.get(r.id)
            if (!esistente) {
              throw new Error(`Riga ${r.id} non appartiene a questa vendita`)
            }
            if (
              esistente.cotta_id !== r.cotta_id ||
              esistente.tipo_prodotto !== r.tipo_prodotto ||
              (esistente.materiale_id ?? null) !== (r.materiale_id ?? null)
            ) {
              throw new Error(
                `Il prodotto di una riga esistente non puo' essere modificato; eliminala e aggiungila di nuovo`
              )
            }
            const delta = r.quantita - esistente.quantita
            if (delta > 0) {
              subFromGiacenza(r.cotta_id, r.tipo_prodotto, r.materiale_id, delta)
            } else if (delta < 0) {
              addToGiacenza(r.cotta_id, r.tipo_prodotto, r.materiale_id, -delta)
            }
            if (delta !== 0) {
              upRiga.run(r.quantita, r.id, id)
            }
          } else {
            subFromGiacenza(r.cotta_id, r.tipo_prodotto, r.materiale_id, r.quantita)
            insRiga.run(
              id,
              r.cotta_id,
              r.tipo_prodotto,
              r.tipo_prodotto === 'fusto' ? r.materiale_id : null,
              r.quantita
            )
          }
        }

        for (const cid of cottaIdsCoinvolte) {
          aggiornaStatoCotta(cid)
        }
      })

      esegui()
      return { ok: true as const }
    } catch (error) {
      console.error('[IPC vendite:modifica]', error)
      const msg = error instanceof Error ? error.message : 'Errore durante la modifica'
      return { ok: false as const, errore: msg }
    }
  })

  ipcMain.removeHandler('vendite:elimina')
  ipcMain.handle('vendite:elimina', (_event, id: number) => {
    try {
      if (!id || !Number.isFinite(id)) {
        return { ok: false as const, errore: 'Vendita non valida' }
      }
      const venditaEsistente = db
        .prepare(`SELECT id FROM vendite WHERE id = ?`)
        .get(id) as { id: number } | undefined
      if (!venditaEsistente) {
        return { ok: false as const, errore: 'Vendita non trovata' }
      }

      const esegui = db.transaction(() => {
        type RigaEsistente = {
          id: number
          cotta_id: number
          tipo_prodotto: 'bottiglia' | 'fusto'
          materiale_id: number | null
          quantita: number
        }
        const righeEsistenti = db
          .prepare(
            `SELECT id, cotta_id, tipo_prodotto, materiale_id, quantita
             FROM vendita_dettaglio WHERE vendita_id = ?`
          )
          .all(id) as RigaEsistente[]

        const cottaIds = new Set<number>(righeEsistenti.map((r) => r.cotta_id))

        const selFusto = db.prepare(
          `SELECT id FROM giacenza_prodotto_finito_fusti
           WHERE cotta_id = ? AND materiale_id = ?`
        )
        const upFusto = db.prepare(
          `UPDATE giacenza_prodotto_finito_fusti
           SET quantita_disponibile = quantita_disponibile + ?
           WHERE id = ?`
        )
        const insFusto = db.prepare(
          `INSERT INTO giacenza_prodotto_finito_fusti (cotta_id, materiale_id, quantita_disponibile)
           VALUES (?, ?, ?)`
        )

        for (const r of righeEsistenti) {
          if (r.tipo_prodotto === 'bottiglia') {
            rimettiBottiglieInLotto(r.cotta_id, r.quantita)
          } else {
            const riga = selFusto.get(r.cotta_id, r.materiale_id) as
              | { id: number }
              | undefined
            if (riga) {
              upFusto.run(r.quantita, riga.id)
            } else {
              insFusto.run(r.cotta_id, r.materiale_id, r.quantita)
            }
          }
        }

        db.prepare(`DELETE FROM vendita_dettaglio WHERE vendita_id = ?`).run(id)
        db.prepare(`DELETE FROM vendite WHERE id = ?`).run(id)

        for (const cid of cottaIds) {
          aggiornaStatoCotta(cid)
        }
      })

      esegui()
      return { ok: true as const }
    } catch (error) {
      console.error('[IPC vendite:elimina]', error)
      const msg = error instanceof Error ? error.message : 'Errore durante la cancellazione'
      return { ok: false as const, errore: msg }
    }
  })

  console.log('[startup] IPC handlers registrati: vendite:*')
}

function getConfigGiorni(chiave: string, def: number): number {
  const row = db
    .prepare(`SELECT valore FROM configurazioni WHERE chiave = ?`)
    .get(chiave) as { valore: string } | undefined
  const n = row ? parseInt(String(row.valore), 10) : NaN
  return Number.isFinite(n) ? n : def
}

function registerDashboardIpcHandlers(): void {
  ipcMain.removeHandler('dashboard:dati')
  ipcMain.handle('dashboard:dati', () => {
    try {
      const avvisiR = db
        .prepare(`SELECT COUNT(*) as count FROM avvisi WHERE risolto = 0`)
        .get() as { count: number }
      const avvisiAttivi = Number(avvisiR.count) || 0

      const cInCor = db
        .prepare(`SELECT COUNT(*) as count FROM cotte WHERE stato = 'in_corso'`)
        .get() as { count: number }
      const cotteInCorso = Number(cInCor.count) || 0

      const giov = getConfigGiorni('anticipo_avviso_scadenza_giorni', 60)
      const lottiScad = db
        .prepare(
          `SELECT COUNT(*) as count FROM lotti_materie_prime
           WHERE quantita_residua > 0
             AND data_scadenza IS NOT NULL
             AND data_scadenza >= DATE('now')
             AND data_scadenza <= DATE('now', ?)`
        )
        .get('+' + giov + ' days') as { count: number }
      const lottiInScadenza = Number(lottiScad.count) || 0

      const cotteRows = db
        .prepare(
          `SELECT b.id, b.nome, b.stile, ri.quantita, mp.nome as mp_nome, COALESCE(g.tot, 0) as giacenza
           FROM birre b
           JOIN ricette r ON r.birra_id = b.id AND r.attiva = 1
           JOIN ricetta_ingredienti ri ON ri.ricetta_id = r.id
           JOIN materie_prime mp ON mp.id = ri.materia_prima_id
           LEFT JOIN (
             SELECT materia_prima_id, SUM(quantita_residua) as tot
             FROM lotti_materie_prime
             WHERE quantita_residua > 0
             GROUP BY materia_prima_id
           ) g ON g.materia_prima_id = ri.materia_prima_id`
        )
        .all() as Array<{
        id: number
        nome: string
        stile: string | null
        quantita: number
        mp_nome: string
        giacenza: number
      }>

      const perBirra = new Map<
        number,
        { nome: string; stile: string | null; minRatio: number; limitante: string }
      >()
      for (const row of cotteRows) {
        const q = row.quantita
        const ratio = q > 0 ? (Number(row.giacenza) as number) / q : 0
        const e = perBirra.get(row.id)
        if (!e) {
          perBirra.set(row.id, {
            nome: row.nome,
            stile: row.stile,
            minRatio: ratio,
            limitante: row.mp_nome
          })
        } else {
          if (ratio < e.minRatio) {
            e.minRatio = ratio
            e.limitante = row.mp_nome
          }
        }
      }

      const cotteProducibili = [...perBirra.entries()].map(([id, d]) => ({
        id,
        nome: d.nome,
        stile: d.stile,
        cotte_producibili: Math.floor(d.minRatio),
        ingrediente_limitante: d.limitante
      }))
      cotteProducibili.sort((a, b) => a.cotte_producibili - b.cotte_producibili)

      const giorniVendite = getConfigGiorni('finestra_analisi_vendite_giorni', 90)
      const suger = db
        .prepare(
          `SELECT b.nome, SUM(vd.quantita) as totale_venduto
             FROM vendita_dettaglio vd
             JOIN cotte c ON c.id = vd.cotta_id
             JOIN birre b ON b.id = c.birra_id
             JOIN vendite v ON v.id = vd.vendita_id
             WHERE v.data >= DATE('now', ?)
               AND v.omaggio = 0
               AND vd.tipo_prodotto = 'bottiglia'
             GROUP BY b.id
             ORDER BY totale_venduto DESC
             LIMIT 1`
        )
        .get(`-${giorniVendite} days`) as
        | { nome: string; totale_venduto: number }
        | undefined

      return {
        avvisi_attivi: avvisiAttivi,
        cotte_in_corso: cotteInCorso,
        lotti_in_scadenza: lottiInScadenza,
        cotte_producibili: cotteProducibili,
        suggerimento: suger
          ? { nome: suger.nome, totale_venduto: Number(suger.totale_venduto) || 0 }
          : null
      }
    } catch (error) {
      console.error('[IPC dashboard:dati] errore:', error)
      throw error
    }
  })

  console.log('[startup] IPC handlers registrati: dashboard:*')
}

function registerAvvisiIpcHandlers(): void {
  ipcMain.removeHandler('avvisi:genera')
  ipcMain.handle('avvisi:genera', () => {
    try {
      const nAnticipo = getConfigGiorni('anticipo_avviso_scadenza_giorni', 60)
      const nCliente = getConfigGiorni('cliente_inattivo_giorni', 20)
      const tx = db.transaction(() => {
        generaAvvisiPieno(nAnticipo, nCliente)
      })
      tx()
      const n = (db
        .prepare(`SELECT COUNT(*) as c FROM avvisi WHERE risolto = 0`)
        .get() as { c: number }).c
      return { ok: true, generati: n }
    } catch (error) {
      console.error('[IPC avvisi:genera] errore:', error)
      throw error
    }
  })

  ipcMain.removeHandler('avvisi:lista')
  ipcMain.handle('avvisi:lista', () => {
    try {
      return db
        .prepare(
          `SELECT * FROM avvisi WHERE risolto = 0
           ORDER BY CASE priorita
             WHEN 'alta' THEN 1
             WHEN 'media' THEN 2
             ELSE 3
           END, data_generazione DESC`
        )
        .all()
    } catch (error) {
      console.error('[IPC avvisi:lista] errore:', error)
      throw error
    }
  })

  ipcMain.removeHandler('avvisi:segna-letto')
  ipcMain.handle('avvisi:segna-letto', (_event, id: number) => {
    try {
      db.prepare(`UPDATE avvisi SET letto = 1 WHERE id = ?`).run(id)
      return { ok: true }
    } catch (error) {
      console.error('[IPC avvisi:segna-letto] errore:', error)
      throw error
    }
  })

  ipcMain.removeHandler('avvisi:segna-risolto')
  ipcMain.handle('avvisi:segna-risolto', (_event, id: number) => {
    try {
      db.prepare(`UPDATE avvisi SET risolto = 1 WHERE id = ?`).run(id)
      return { ok: true }
    } catch (error) {
      console.error('[IPC avvisi:segna-risolto] errore:', error)
      throw error
    }
  })

  console.log('[startup] IPC handlers registrati: avvisi:*')
}

/** Inserimenti (chiamata dentro transazione) */
function generaAvvisiPieno(nAnticipo: number, nCliente: number): void {
  db.prepare(`UPDATE avvisi SET risolto = 1`).run()

  db.prepare(
    `INSERT INTO avvisi (tipo, riferimento_tabella, riferimento_id, messaggio, data_generazione, letto, risolto, priorita)
     SELECT 'scorta_bassa', 'materie_prime', mp.id,
       'Materia ' || mp.nome || ' sotto soglia', CURRENT_TIMESTAMP, 0, 0, 'alta'
     FROM materie_prime mp
     LEFT JOIN (
       SELECT materia_prima_id, SUM(quantita_residua) t
       FROM lotti_materie_prime WHERE quantita_residua > 0
       GROUP BY materia_prima_id
     ) l ON l.materia_prima_id = mp.id
     WHERE mp.soglia_riordino_fissa IS NOT NULL
       AND COALESCE(l.t, 0) <= mp.soglia_riordino_fissa`
  ).run()

  db.prepare(
    `INSERT INTO avvisi (tipo, riferimento_tabella, riferimento_id, messaggio, data_generazione, letto, risolto, priorita)
     SELECT
       'scorta_bassa',
       'materiali_confezionamento',
       mc.id,
       mc.nome
         || ' sotto soglia: '
         || COALESCE(CAST(COALESCE(gc.quantita, 0) AS TEXT), '0')
         || ' disponibili (soglia: '
         || CAST(COALESCE(mc.soglia_riordino, 0) AS TEXT)
         || ')',
       CURRENT_TIMESTAMP,
       0,
       0,
       'alta'
     FROM materiali_confezionamento mc
     LEFT JOIN giacenza_confezionamento gc ON gc.materiale_id = mc.id
     WHERE mc.attivo = 1
       AND mc.soglia_riordino IS NOT NULL
       AND COALESCE(gc.quantita, 0) <= mc.soglia_riordino`
  ).run()

  const offsetScad = nAnticipo > 0 ? `+${nAnticipo} days` : '+0 days'
  db.prepare(
    `INSERT INTO avvisi (tipo, riferimento_tabella, riferimento_id, messaggio, data_generazione, letto, risolto, priorita)
     SELECT 'scadenza_vicina', 'lotti_materie_prime', l.id,
       'Lotto MP in scadenza: ' || COALESCE(l.lotto_fornitore, '') || ' (' || m.nome || ')',
       CURRENT_TIMESTAMP, 0, 0, 'alta'
     FROM lotti_materie_prime l
     JOIN materie_prime m ON m.id = l.materia_prima_id
     WHERE l.quantita_residua > 0
       AND l.data_scadenza IS NOT NULL
       AND l.data_scadenza >= date('now')
       AND l.data_scadenza <= date('now', ?)`
  ).run(offsetScad)

  db.prepare(
    `INSERT INTO avvisi (tipo, riferimento_tabella, riferimento_id, messaggio, data_generazione, letto, risolto, priorita)
     SELECT 'scadenza_prodotto_finito', 'cotte', c.id,
       'Prodotto finito in scadenza: ' || b.nome || ' (lotto ' || c.numero_lotto || ')',
       CURRENT_TIMESTAMP, 0, 0, 'media'
     FROM cotte c
     JOIN confezionamento conf ON conf.cotta_id = c.id
     JOIN birre b ON b.id = c.birra_id
     LEFT JOIN giacenza_prodotto_finito_cartoni gpc ON gpc.cotta_id = c.id
     LEFT JOIN (
       SELECT cotta_id, COALESCE(SUM(quantita_disponibile), 0) s
       FROM giacenza_prodotto_finito_fusti
       GROUP BY cotta_id
     ) gf ON gf.cotta_id = c.id
     WHERE c.stato = 'confezionata'
       AND conf.data_scadenza IS NOT NULL
       AND conf.data_scadenza >= date('now')
       AND conf.data_scadenza <= date('now', ?)
       AND (COALESCE(gpc.bottiglie_sfuse, 0) > 0 OR COALESCE(gf.s, 0) > 0)
     GROUP BY c.id`
  ).run(nAnticipo > 0 ? `+${nAnticipo} days` : '+0 days')

  if (nCliente > 0) {
    db.prepare(
      `INSERT INTO avvisi (tipo, riferimento_tabella, riferimento_id, messaggio, data_generazione, letto, risolto, priorita)
       SELECT 'cliente_inattivo', 'clienti', cl.id,
         'Cliente ' || cl.nome || ' senza vendite recenti',
         CURRENT_TIMESTAMP, 0, 0, 'bassa'
       FROM clienti cl
       WHERE cl.attivo = 1
         AND (
           (SELECT MAX(v.data) FROM vendite v WHERE v.cliente_id = cl.id) < date('now', ?)
           OR (SELECT MAX(v.data) FROM vendite v WHERE v.cliente_id = cl.id) IS NULL
         )`
    ).run(`-${nCliente} days`)
  }

  const righe = db
    .prepare(
      `SELECT b.id, b.nome, ri.quantita, COALESCE(g.tot, 0) as g
         FROM birre b
         JOIN ricette r ON r.birra_id = b.id AND r.attiva = 1
         JOIN ricetta_ingredienti ri ON ri.ricetta_id = r.id
         LEFT JOIN (
           SELECT materia_prima_id, SUM(quantita_residua) as tot
           FROM lotti_materie_prime WHERE quantita_residua > 0
           GROUP BY materia_prima_id
         ) g ON g.materia_prima_id = ri.materia_prima_id`
    )
    .all() as Array<{ id: number; nome: string; quantita: number; g: number }>
  const perBirra = new Map<number, { nome: string; minR: number }>()
  for (const row of righe) {
    const r = row.quantita > 0 ? row.g / row.quantita : 0
    const e = perBirra.get(row.id)
    if (!e) {
      perBirra.set(row.id, { nome: row.nome, minR: r })
    } else if (r < e.minR) e.minR = r
  }
  const ins = db.prepare(
    `INSERT INTO avvisi (tipo, riferimento_tabella, riferimento_id, messaggio, data_generazione, letto, risolto, priorita)
     VALUES (?, 'birre', ?, ?, CURRENT_TIMESTAMP, 0, 0, 'media')`
  )
  for (const [id, d] of perBirra) {
    if (d.minR < 1) {
      ins.run('cotta_non_producibile', id, 'Birra ' + d.nome + ' non produttiva (0 cotte) con le giacenze attuali')
    }
  }
}

type ReportPeriodo = { da: string; a: string }

function registerReportIpcHandlers(): void {
  ipcMain.removeHandler('report:produzione')
  ipcMain.handle('report:produzione', (_e, p: ReportPeriodo) => {
    try {
      return db
        .prepare(
          `SELECT
             b.nome as birra_nome,
             COUNT(c.id) as numero_cotte,
             COALESCE(SUM(c.litri_teorici), 0) as litri_totali,
             COALESCE(SUM(conf.bottiglie_prodotte), 0) as bottiglie_totali
           FROM cotte c
           JOIN birre b ON b.id = c.birra_id
           LEFT JOIN confezionamento conf ON conf.cotta_id = c.id
           WHERE c.data_inizio BETWEEN ? AND ?
           GROUP BY b.id
           ORDER BY b.nome`
        )
        .all(p.da, p.a) as Array<{
        birra_nome: string
        numero_cotte: number
        litri_totali: number
        bottiglie_totali: number
      }>
    } catch (error) {
      console.error('[IPC report:produzione] errore:', error)
      throw error
    }
  })

  ipcMain.removeHandler('report:vendite-per-cliente')
  ipcMain.handle('report:vendite-per-cliente', (_e, p: ReportPeriodo) => {
    try {
      return db
        .prepare(
          `SELECT
             cl.nome as cliente_nome,
             cl.tipo_cliente,
             COUNT(DISTINCT v.id) as numero_vendite,
             COALESCE(SUM(CASE WHEN vd.tipo_prodotto = 'bottiglia' THEN vd.quantita ELSE 0 END), 0) as bottiglie_totali,
             COALESCE(SUM(CASE WHEN vd.tipo_prodotto = 'fusto' THEN vd.quantita ELSE 0 END), 0) as fusti_totali,
             MAX(v.data) as ultima_vendita
           FROM clienti cl
           JOIN vendite v ON v.cliente_id = cl.id
           JOIN vendita_dettaglio vd ON vd.vendita_id = v.id
           WHERE v.data BETWEEN ? AND ?
             AND v.omaggio = 0
           GROUP BY cl.id
           ORDER BY bottiglie_totali DESC`
        )
        .all(p.da, p.a) as Array<{
        cliente_nome: string
        tipo_cliente: string | null
        numero_vendite: number
        bottiglie_totali: number
        fusti_totali: number
        ultima_vendita: string | null
      }>
    } catch (error) {
      console.error('[IPC report:vendite-per-cliente] errore:', error)
      throw error
    }
  })

  ipcMain.removeHandler('report:vendite-per-birra')
  ipcMain.handle('report:vendite-per-birra', (_e, p: ReportPeriodo) => {
    try {
      return db
        .prepare(
          `SELECT
             b.nome as birra_nome,
             b.stile,
             COALESCE(SUM(CASE WHEN vd.tipo_prodotto = 'bottiglia' THEN vd.quantita ELSE 0 END), 0) as bottiglie_totali,
             COALESCE(SUM(CASE WHEN vd.tipo_prodotto = 'fusto' THEN vd.quantita ELSE 0 END), 0) as fusti_totali,
             COUNT(DISTINCT v.id) as numero_vendite
           FROM birre b
           JOIN cotte c ON c.birra_id = b.id
           JOIN vendita_dettaglio vd ON vd.cotta_id = c.id
           JOIN vendite v ON v.id = vd.vendita_id
           WHERE v.data BETWEEN ? AND ?
             AND v.omaggio = 0
           GROUP BY b.id
           ORDER BY bottiglie_totali DESC`
        )
        .all(p.da, p.a) as Array<{
        birra_nome: string
        stile: string | null
        bottiglie_totali: number
        fusti_totali: number
        numero_vendite: number
      }>
    } catch (error) {
      console.error('[IPC report:vendite-per-birra] errore:', error)
      throw error
    }
  })

  ipcMain.removeHandler('report:trend-mensile')
  ipcMain.handle('report:trend-mensile', (_e, p: ReportPeriodo) => {
    try {
      return db
        .prepare(
          `SELECT
             strftime('%Y-%m', v.data) as mese,
             COALESCE(SUM(CASE WHEN vd.tipo_prodotto = 'bottiglia' THEN vd.quantita ELSE 0 END), 0) as bottiglie,
             COALESCE(SUM(CASE WHEN vd.tipo_prodotto = 'fusto' THEN vd.quantita ELSE 0 END), 0) as fusti
           FROM vendite v
           JOIN vendita_dettaglio vd ON vd.vendita_id = v.id
           WHERE v.data BETWEEN ? AND ?
             AND v.omaggio = 0
           GROUP BY strftime('%Y-%m', v.data)
           ORDER BY mese ASC`
        )
        .all(p.da, p.a) as Array<{ mese: string; bottiglie: number; fusti: number }>
    } catch (error) {
      console.error('[IPC report:trend-mensile] errore:', error)
      throw error
    }
  })

  ipcMain.removeHandler('report:omaggi')
  ipcMain.handle('report:omaggi', (_e, p: { da?: string | null; a?: string | null }) => {
    try {
      const da = p?.da?.trim() || null
      const a = p?.a?.trim() || null

      const vendite = db
        .prepare(
          `SELECT
             v.id,
             v.data,
             v.note,
             v.occasione,
             cl.nome as cliente_nome,
             COALESCE(SUM(CASE WHEN vd.tipo_prodotto = 'fusto' THEN vd.quantita ELSE 0 END), 0) as totale_fusti,
             COALESCE(SUM(CASE WHEN vd.tipo_prodotto = 'bottiglia' THEN vd.quantita ELSE 0 END), 0) as totale_bottiglie
           FROM vendite v
           LEFT JOIN clienti cl ON cl.id = v.cliente_id
           LEFT JOIN vendita_dettaglio vd ON vd.vendita_id = v.id
           WHERE v.omaggio = 1
             AND (? IS NULL OR v.data >= ?)
             AND (? IS NULL OR v.data <= ?)
           GROUP BY v.id
           ORDER BY v.data DESC`
        )
        .all(da, da, a, a) as Array<{
        id: number
        data: string
        note: string | null
        occasione: string | null
        cliente_nome: string | null
        totale_fusti: number
        totale_bottiglie: number
      }>

      const ids = vendite.map((v) => v.id)
      const righePerVendita = new Map<
        number,
        Array<{
          birra_nome: string
          numero_lotto: string
          tipo_prodotto: string
          formato_nome: string | null
          quantita: number
        }>
      >()
      for (const id of ids) {
        righePerVendita.set(id, [])
      }
      if (ids.length > 0) {
        const placeholders = ids.map(() => '?').join(',')
        const righe = db
          .prepare(
            `SELECT vd.vendita_id,
                    vd.tipo_prodotto,
                    vd.quantita,
                    vd.materiale_id,
                    b.nome as birra_nome,
                    c.numero_lotto,
                    mc.nome as formato_nome
             FROM vendita_dettaglio vd
             JOIN cotte c ON c.id = vd.cotta_id
             JOIN birre b ON b.id = c.birra_id
             LEFT JOIN materiali_confezionamento mc ON mc.id = vd.materiale_id
             WHERE vd.vendita_id IN (${placeholders})`
          )
          .all(...ids) as Array<{
          vendita_id: number
          tipo_prodotto: string
          quantita: number
          materiale_id: number | null
          birra_nome: string
          numero_lotto: string
          formato_nome: string | null
        }>
        for (const r of righe) {
          const arr = righePerVendita.get(r.vendita_id)
          if (arr) {
            arr.push({
              birra_nome: r.birra_nome,
              numero_lotto: r.numero_lotto,
              tipo_prodotto: r.tipo_prodotto,
              formato_nome: r.formato_nome,
              quantita: r.quantita
            })
          }
        }
      }

      return vendite.map((v) => ({
        id: v.id,
        data: v.data,
        note: v.note,
        occasione: v.occasione,
        cliente_nome: v.cliente_nome,
        totale_fusti: Number(v.totale_fusti) || 0,
        totale_bottiglie: Number(v.totale_bottiglie) || 0,
        righe: righePerVendita.get(v.id) ?? []
      }))
    } catch (error) {
      console.error('[IPC report:omaggi] errore:', error)
      throw error
    }
  })

  console.log('[startup] IPC handlers registrati: report:*')
}

type ImpostazioniConfigAggiorna = { chiave: string; valore: string }
type ImpostazioniBirraPayload = { nome: string; stile: string; descrizione: string; attiva: number }
type ImpostazioniCreaBirraPayload = { nome: string; stile: string; descrizione: string }
type SalvaRicettaPayload = {
  birra_id: number
  ingredienti: Array<{ materia_prima_id: number; quantita: number; note?: string | null }>
}
type CambiaPasswordPayload = { password_attuale: string; password_nuova: string }

function registerImpostazioniIpcHandlers(): void {
  ipcMain.removeHandler('impostazioni:lista')
  ipcMain.handle('impostazioni:lista', () => {
    try {
      return db
        .prepare(
          `SELECT * FROM configurazioni
           ORDER BY
             COALESCE(categoria, ''),
             COALESCE(etichetta, chiave)`
        )
        .all() as Array<{
        id: number
        chiave: string
        valore: string
        tipo: string
        etichetta: string
        categoria: string
        creato_il: string
        aggiornato_il: string
      }>
    } catch (error) {
      console.error('[IPC impostazioni:lista] errore:', error)
      throw error
    }
  })

  ipcMain.removeHandler('impostazioni:aggiorna')
  ipcMain.handle('impostazioni:aggiorna', (_e, payload: ImpostazioniConfigAggiorna) => {
    try {
      const n = db
        .prepare(`UPDATE configurazioni SET valore = ?, aggiornato_il = CURRENT_TIMESTAMP WHERE chiave = ?`)
        .run(payload.valore, payload.chiave).changes
      if (n === 0) {
        throw new Error('Chiave configurazione non trovata')
      }
      return { ok: true as const }
    } catch (error) {
      console.error('[IPC impostazioni:aggiorna] errore:', error)
      throw error
    }
  })

  ipcMain.removeHandler('impostazioni:birre')
  ipcMain.handle('impostazioni:birre', () => {
    try {
      return db.prepare(`SELECT * FROM birre ORDER BY nome`).all() as Array<{
        id: number
        nome: string
        stile: string | null
        descrizione: string | null
        attiva: number
        creato_il: string
        aggiornato_il: string
      }>
    } catch (error) {
      console.error('[IPC impostazioni:birre] errore:', error)
      throw error
    }
  })

  ipcMain.removeHandler('impostazioni:aggiorna-birra')
  ipcMain.handle(
    'impostazioni:aggiorna-birra',
    (_e, id: number, dati: ImpostazioniBirraPayload) => {
      try {
        db.prepare(
          `UPDATE birre SET
             nome = ?,
             stile = ?,
             descrizione = ?,
             attiva = ?,
             aggiornato_il = CURRENT_TIMESTAMP
           WHERE id = ?`
        ).run(dati.nome, dati.stile, dati.descrizione, dati.attiva, id)
        return { ok: true as const }
      } catch (error) {
        console.error('[IPC impostazioni:aggiorna-birra] errore:', error)
        throw error
      }
    }
  )

  ipcMain.removeHandler('impostazioni:crea-birra')
  ipcMain.handle('impostazioni:crea-birra', (_e, dati: ImpostazioniCreaBirraPayload) => {
    try {
      const litri = getConfigGiorni('cotta_litri', 250)
      const info = db
        .transaction(() => {
          const b = db
            .prepare(`INSERT INTO birre (nome, stile, descrizione) VALUES (?, ?, ?)`)
            .run(dati.nome, dati.stile, dati.descrizione ?? null)
          const id = Number(b.lastInsertRowid)
          db.prepare(
            `INSERT INTO ricette (birra_id, versione, cotta_litri_riferimento, attiva, note)
             VALUES (?, 1, ?, 1, NULL)`
          ).run(id, litri)
          return id
        })()
      return { ok: true as const, id: info }
    } catch (error) {
      console.error('[IPC impostazioni:crea-birra] errore:', error)
      throw error
    }
  })

  ipcMain.removeHandler('impostazioni:ricetta')
  ipcMain.handle('impostazioni:ricetta', (_e, birraId: number) => {
    try {
      return db
        .prepare(
          `SELECT
             ri.id,
             ri.ricetta_id,
             ri.materia_prima_id,
             ri.quantita,
             ri.note,
             mp.nome as mp_nome,
             mp.unita_misura
           FROM ricetta_ingredienti ri
           JOIN materie_prime mp ON mp.id = ri.materia_prima_id
           WHERE ri.ricetta_id = (SELECT id FROM ricette WHERE birra_id = ? AND attiva = 1)
           ORDER BY mp.nome`
        )
        .all(birraId) as Array<{
        id: number
        ricetta_id: number
        materia_prima_id: number
        quantita: number
        note: string | null
        mp_nome: string
        unita_misura: string
      }>
    } catch (error) {
      console.error('[IPC impostazioni:ricetta] errore:', error)
      throw error
    }
  })

  ipcMain.removeHandler('impostazioni:salva-ricetta')
  ipcMain.handle('impostazioni:salva-ricetta', (_e, dati: SalvaRicettaPayload) => {
    try {
      const tx = db.transaction(() => {
        const attiva = db
          .prepare(
            `SELECT id, cotta_litri_riferimento FROM ricette
             WHERE birra_id = ? AND attiva = 1
             LIMIT 1`
          )
          .get(dati.birra_id) as { id: number; cotta_litri_riferimento: number } | undefined
        const maxV = (db
          .prepare(`SELECT MAX(versione) as m FROM ricette WHERE birra_id = ?`)
          .get(dati.birra_id) as { m: number | null }).m
        const prossimaVersione = (maxV ?? 0) + 1
        const litri =
          attiva?.cotta_litri_riferimento !== undefined
            ? attiva.cotta_litri_riferimento
            : getConfigGiorni('cotta_litri', 250)
        db.prepare(`UPDATE ricette SET attiva = 0 WHERE birra_id = ?`).run(dati.birra_id)
        const insR = db
          .prepare(
            `INSERT INTO ricette (birra_id, versione, cotta_litri_riferimento, attiva, note)
             VALUES (?, ?, ?, 1, NULL)`
          )
          .run(dati.birra_id, prossimaVersione, litri)
        const nuovoRicettaId = Number(insR.lastInsertRowid)
        const insI = db.prepare(
          `INSERT INTO ricetta_ingredienti (ricetta_id, materia_prima_id, quantita, note) VALUES (?, ?, ?, ?)`
        )
        for (const r of dati.ingredienti) {
          if (r.quantita > 0) {
            insI.run(
              nuovoRicettaId,
              r.materia_prima_id,
              r.quantita,
              r.note != null && r.note !== '' ? r.note : null
            )
          }
        }
      })
      tx()
      return { ok: true as const }
    } catch (error) {
      console.error('[IPC impostazioni:salva-ricetta] errore:', error)
      throw error
    }
  })

  ipcMain.removeHandler('impostazioni:valore-di')
  ipcMain.handle('impostazioni:valore-di', (_e, chiave: string) => {
    try {
      const row = db.prepare(`SELECT valore FROM configurazioni WHERE chiave = ?`).get(chiave) as
        | { valore: string }
        | undefined
      return row?.valore ?? ''
    } catch (error) {
      console.error('[IPC impostazioni:valore-di] errore:', error)
      return ''
    }
  })

  ipcMain.removeHandler('impostazioni:cambia-password')
  ipcMain.handle('impostazioni:cambia-password', async (_e, payload: CambiaPasswordPayload) => {
    try {
      const utente = db.prepare(`SELECT password_hash FROM utente WHERE id = 1`).get() as
        | { password_hash: string | null }
        | undefined
      if (!utente?.password_hash) {
        return { ok: false as const, errore: 'Nessun utente configurato' }
      }
      const valida = await bcrypt.compare(payload.password_attuale, utente.password_hash)
      if (!valida) {
        return { ok: false as const, errore: 'Password attuale non valida' }
      }
      const passwordHash = await bcrypt.hash(payload.password_nuova, 10)
      db.prepare(
        `UPDATE utente
         SET password_hash = ?,
             password_modificata_il = CURRENT_TIMESTAMP,
             ultimo_accesso = CURRENT_TIMESTAMP
         WHERE id = 1`
      ).run(passwordHash)
      return { ok: true as const }
    } catch (error) {
      console.error('[IPC impostazioni:cambia-password] errore:', error)
      return { ok: false as const, errore: error instanceof Error ? error.message : 'Errore' }
    }
  })

  console.log('[startup] IPC handlers registrati: impostazioni:*')
}

type BackupTipoEsecuzione = 'manuale' | 'automatico'
type BackupEseguiRisultato = { ok: true; percorso: string } | { ok: false; errore: string }

function inserisciRigaLogBackup(
  percorsoDest: string,
  dimensioneBytes: number | null,
  tipo: BackupTipoEsecuzione,
  esito: 'ok' | 'errore',
  messaggioErrore: string | null
): void {
  try {
    db.prepare(
      `INSERT INTO backup_log (data, percorso_destinazione, dimensione_bytes, tipo, esito, messaggio_errore)
       VALUES (CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)`
    ).run(percorsoDest, dimensioneBytes, tipo, esito, messaggioErrore)
  } catch (e) {
    console.error('[backup] scrittura backup_log fallita:', e)
  }
}

function getConfigValoreString(chiave: string): string {
  const row = db.prepare(`SELECT valore FROM configurazioni WHERE chiave = ?`).get(chiave) as
    | { valore: string }
    | undefined
  return String(row?.valore ?? '')
}

function getConfigNumeroMantenere(): number {
  const r = getConfigValoreString('backup_numero_da_mantenere')
  const n = parseInt(r, 10)
  return Number.isFinite(n) && n > 0 ? n : 30
}

function formattaTimestampBackupFile(): string {
  const d = new Date()
  const p = (n: number) => n.toString().padStart(2, '0')
  return (
    d.getFullYear() +
    '-' +
    p(d.getMonth() + 1) +
    '-' +
    p(d.getDate()) +
    '_' +
    p(d.getHours()) +
    '-' +
    p(d.getMinutes()) +
    '-' +
    p(d.getSeconds())
  )
}

function verificaCartellaScrivibile(dir: string): { ok: true } | { ok: false; errore: string } {
  try {
    if (!fs.existsSync(dir)) {
      return { ok: false, errore: 'cartella_inesistente' }
    }
    const st = fs.statSync(dir)
    if (!st.isDirectory()) {
      return { ok: false, errore: 'non_e_una_cartella' }
    }
    fs.accessSync(dir, fs.constants.R_OK | fs.constants.W_OK)
  } catch {
    return { ok: false, errore: 'non_scrivibile' }
  }
  return { ok: true }
}

function eseguiRitenzioneBackup(dir: string, daMantenere: number): void {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith('fermento_backup_') && f.endsWith('.db'))
    .sort()
  if (files.length <= daMantenere) return
  const toRemove = files.slice(0, files.length - daMantenere)
  for (const f of toRemove) {
    try {
      fs.unlinkSync(path.join(dir, f))
    } catch (e) {
      console.error('[backup] eliminazione vecchio file fallita', f, e)
    }
  }
}

/**
 * Esegue il backup; non chiude il db. Log sempre su backup_log in caso di errore.
 */
function eseguiLogicaBackup(tipo: BackupTipoEsecuzione): BackupEseguiRisultato {
  const percorsoBase = getConfigValoreString('backup_percorso').trim()
  if (percorsoBase === '') {
    inserisciRigaLogBackup('', null, tipo, 'errore', 'percorso_non_configurato')
    return { ok: false, errore: 'percorso_non_configurato' }
  }
  const dir = path.resolve(percorsoBase)
  const w = verificaCartellaScrivibile(dir)
  if (!w.ok) {
    inserisciRigaLogBackup(dir, null, tipo, 'errore', w.errore)
    return { ok: false, errore: w.errore }
  }
  const sorgente = getDatabaseFilePath()
  if (!fs.existsSync(sorgente)) {
    inserisciRigaLogBackup(dir, null, tipo, 'errore', 'db_sorgente_mancante')
    return { ok: false, errore: 'db_sorgente_mancante' }
  }
  const nome = `fermento_backup_${formattaTimestampBackupFile()}.db`
  const destinazione = path.join(dir, nome)
    try {
      try {
        db.exec('PRAGMA wal_checkpoint(FULL)')
      } catch (e) {
        console.warn('[backup] wal_checkpoint (opzionale):', e)
      }
    fs.copyFileSync(sorgente, destinazione)
    const dim = fs.statSync(destinazione).size
    const keep = getConfigNumeroMantenere()
    eseguiRitenzioneBackup(dir, keep)
    inserisciRigaLogBackup(destinazione, dim, tipo, 'ok', null)
    return { ok: true, percorso: destinazione }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[backup] esecuzione fallita', e)
    inserisciRigaLogBackup(destinazione, null, tipo, 'errore', msg)
    return { ok: false, errore: 'copia_fallita' }
  }
}

function ultimoBackupAutomaticoOkOltre24h(): boolean {
  const row = db
    .prepare(
      `SELECT data FROM backup_log
       WHERE tipo = 'automatico' AND esito = 'ok'
       ORDER BY data DESC
       LIMIT 1`
    )
    .get() as { data: string } | undefined
  if (!row?.data) return true
  const t = new Date(row.data).getTime()
  if (Number.isNaN(t)) return true
  return Date.now() - t > 24 * 60 * 60 * 1000
}

function registerBackupIpcHandlers(): void {
  ipcMain.removeHandler('backup:esegui')
  ipcMain.handle('backup:esegui', (_e, payload: { tipo: BackupTipoEsecuzione }) => {
    try {
      return eseguiLogicaBackup(payload.tipo)
    } catch (error) {
      console.error('[IPC backup:esegui] errore:', error)
      const msg = error instanceof Error ? error.message : 'errore_sconosciuto'
      inserisciRigaLogBackup('', null, payload.tipo, 'errore', msg)
      return { ok: false as const, errore: 'errore_sconosciuto' }
    }
  })

  ipcMain.removeHandler('backup:seleziona-cartella')
  ipcMain.handle('backup:seleziona-cartella', async () => {
    const win = BrowserWindow.getFocusedWindow()
    try {
      const r = win
        ? await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
        : await dialog.showOpenDialog({ properties: ['openDirectory'] })
      if (r.canceled || r.filePaths.length === 0) {
        return { ok: false as const }
      }
      return { ok: true as const, percorso: r.filePaths[0] }
    } catch (error) {
      console.error('[IPC backup:seleziona-cartella] errore:', error)
      return { ok: false as const }
    }
  })

  ipcMain.removeHandler('backup:seleziona-file-ripristino')
  ipcMain.handle('backup:seleziona-file-ripristino', async () => {
    const win = BrowserWindow.getFocusedWindow()
    try {
      const opts = {
        properties: ['openFile' as const],
        filters: [{ name: 'Database SQLite', extensions: ['db' as const] }],
      }
      const r = win
        ? await dialog.showOpenDialog(win, opts)
        : await dialog.showOpenDialog(opts)
      if (r.canceled || r.filePaths.length === 0) {
        return { ok: false as const }
      }
      return { ok: true as const, percorso: r.filePaths[0] }
    } catch (error) {
      console.error('[IPC backup:seleziona-file-ripristino] errore:', error)
      return { ok: false as const }
    }
  })

  ipcMain.removeHandler('backup:configura-percorso')
  ipcMain.handle('backup:configura-percorso', (_e, payload: { percorso: string }) => {
    try {
      const p = payload.percorso.trim()
      db.prepare(
        `INSERT INTO configurazioni (chiave, valore, tipo, etichetta, categoria)
         VALUES ('backup_percorso', ?, 'string', 'Cartella di destinazione backup', 'backup')
         ON CONFLICT(chiave) DO UPDATE SET
           valore = excluded.valore,
           aggiornato_il = CURRENT_TIMESTAMP`
      ).run(p)
      return { ok: true as const }
    } catch (error) {
      console.error('[IPC backup:configura-percorso] errore:', error)
      throw error
    }
  })

  ipcMain.removeHandler('backup:lista')
  ipcMain.handle('backup:lista', () => {
    try {
      return db
        .prepare(
          `SELECT * FROM backup_log
           ORDER BY data DESC
           LIMIT 10`
        )
        .all() as Array<{
        id: number
        data: string
        percorso_destinazione: string
        dimensione_bytes: number | null
        tipo: string
        esito: string
        messaggio_errore: string | null
      }>
    } catch (error) {
      console.error('[IPC backup:lista] errore:', error)
      throw error
    }
  })

  ipcMain.removeHandler('backup:ripristina')
  ipcMain.handle('backup:ripristina', (_e, payload: { percorso_file: string }) => {
    try {
      const src = path.resolve(payload.percorso_file)
      if (!fs.existsSync(src) || !fs.statSync(src).isFile()) {
        return { ok: false as const, errore: 'file_inesistente' }
      }
      const target = getDatabaseFilePath()
      closeDatabaseConnection()
      try {
        fs.copyFileSync(src, target)
        reopenDatabaseConnection()
        return { ok: true as const }
      } catch (e) {
        try {
          reopenDatabaseConnection()
        } catch (r) {
          console.error('[backup] impossibile riaprire db dopo errore', r)
        }
        const msg = e instanceof Error ? e.message : 'copia_fallita'
        return { ok: false as const, errore: msg }
      }
    } catch (error) {
      console.error('[IPC backup:ripristina] errore:', error)
      return { ok: false as const, errore: error instanceof Error ? error.message : 'errore' }
    }
  })

  console.log('[startup] IPC handlers registrati: backup:*')
}

function configuraAutoUpdater(): void {
  if (!app.isPackaged) {
    console.log('[AutoUpdate] skip (app non impacchettata)')
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    console.log('[AutoUpdate] update disponibile:', info?.version)
    const finestra = BrowserWindow.getAllWindows()[0]
    dialog.showMessageBox(finestra, {
      type: 'info',
      title: 'Aggiornamento disponibile',
      message: `È disponibile una nuova versione di Fermento${info?.version ? ` (${info.version})` : ''}.`,
      detail:
        'Il download partirà in background. Quando sarà pronto ti chiederò di riavviare per installarlo.',
      buttons: ['OK']
    })
  })

  autoUpdater.on('update-not-available', (info) => {
    console.log('[AutoUpdate] nessun aggiornamento disponibile', info?.version ?? '')
  })

  autoUpdater.on('download-progress', (p) => {
    console.log(
      `[AutoUpdate] download ${Math.round(p.percent)}% (${p.transferred}/${p.total})`
    )
  })

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[AutoUpdate] update scaricato:', info?.version)
    const finestra = BrowserWindow.getAllWindows()[0]
    dialog
      .showMessageBox(finestra, {
        type: 'question',
        title: 'Aggiornamento pronto',
        message: `La versione${info?.version ? ` ${info.version}` : ''} è pronta per essere installata.`,
        detail:
          'Vuoi riavviare ora per completare l\'installazione? In alternativa verrà installata alla prossima chiusura dell\'app.',
        buttons: ['Riavvia ora', 'Più tardi'],
        defaultId: 0,
        cancelId: 1
      })
      .then((result) => {
        if (result.response === 0) {
          autoUpdater.quitAndInstall()
        }
      })
      .catch((err) => {
        console.error('[AutoUpdate] errore dialog update-downloaded:', err)
      })
  })

  autoUpdater.on('error', (err) => {
    console.error('[AutoUpdate] errore:', err)
  })

  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    console.error('[AutoUpdate] errore checkForUpdatesAndNotify:', err)
  })
}

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    title: 'Fermento',
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  initDatabase()
  ensureAiConfigRows(db)
  registerAiIpcHandlers(() => db)
  registerMpIpcHandlers()
  registerConfIpcHandlers()
  registerProduzioneIpcHandlers()
  registerProdottoFinitoIpcHandlers()
  registerClientiIpcHandlers()
  registerVenditeIpcHandlers()
  registerDashboardIpcHandlers()
  registerAvvisiIpcHandlers()
  registerReportIpcHandlers()
  registerImpostazioniIpcHandlers()
  registerBackupIpcHandlers()

  ipcMain.on('ping', () => console.log('pong'))

  ipcMain.handle('login:verifica', async (_event, password: string) => {
    const utente = db.prepare(`SELECT password_hash FROM utente WHERE id = 1`).get() as
      | { password_hash: string | null }
      | undefined

    if (!utente?.password_hash) {
      return { ok: false, errore: 'primo_avvio' }
    }

    const passwordValida = await bcrypt.compare(password, utente.password_hash)
    if (!passwordValida) {
      return { ok: false, errore: 'Password errata' }
    }

    return { ok: true }
  })

  ipcMain.handle('login:imposta-password', async (_event, password: string) => {
    const passwordHash = await bcrypt.hash(password, 10)

    db.prepare(
      `INSERT INTO utente (id, nome, password_hash, password_modificata_il, ultimo_accesso)
       VALUES (1, 'Luca', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET
         nome = excluded.nome,
         password_hash = excluded.password_hash,
         password_modificata_il = CURRENT_TIMESTAMP,
         ultimo_accesso = CURRENT_TIMESTAMP`
    ).run(passwordHash)

    return { ok: true }
  })

  ipcMain.handle('login:aggiorna-accesso', () => {
    db.prepare(`UPDATE utente SET ultimo_accesso = CURRENT_TIMESTAMP WHERE id = 1`).run()
    return { ok: true }
  })

  createWindow()

  configuraAutoUpdater()

  setTimeout(() => {
    try {
      if (ultimoBackupAutomaticoOkOltre24h()) {
        const r = eseguiLogicaBackup('automatico')
        if (!r.ok) {
          console.warn('[backup avvio automatico] esito non ok:', r)
        }
      }
    } catch (e) {
      console.error('[backup avvio automatico]', e)
    }
  }, 0)

  setInterval(
    () => {
      try {
        const r = eseguiLogicaBackup('automatico')
        if (!r.ok) {
          console.warn('[backup 24h] esito non ok:', r)
        }
      } catch (e) {
        console.error('[backup 24h]', e)
      }
    },
    24 * 60 * 60 * 1000
  )

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
