import { useEffect, useMemo, useState } from 'react'
import { CampoForm, InputNumero, cls } from './common'
import { fmtData, fmtQta, parseNumero, type ConsumoLotto, type LottoDisponibile } from '@/lib/agricolo'

export type ValoreProdotto = { materia_prima_id: string; quantita: string; lotto_id: string }

export const prodottoVuoto: ValoreProdotto = { materia_prima_id: '', quantita: '', lotto_id: '' }

export type InfoProdotto = {
  nome: string
  unita: string
  disponibile: number
  tempo_carenza_giorni: number | null
}

/**
 * Scelta di un prodotto di magazzino (input agricoli) con quantità e lotto.
 * Il lotto è "automatico" (scarico dal lotto che scade prima) oppure scelto a
 * mano. In modifica, `restituibili` sono le quantità già scaricate da questo
 * stesso record: vengono contate come disponibili perché tornano in magazzino.
 */
export function SelettoreProdotto({
  categorie,
  valore,
  onChange,
  restituibili = [],
  etichetta,
  obbligatorio,
  testoVuoto,
  onInfo,
  idBase = 'prodotto'
}: {
  categorie: string[]
  valore: ValoreProdotto
  onChange: (v: ValoreProdotto) => void
  restituibili?: ConsumoLotto[]
  etichetta: string
  obbligatorio?: boolean
  testoVuoto: string
  onInfo?: (info: InfoProdotto | null) => void
  idBase?: string
}): React.JSX.Element {
  const [lotti, setLotti] = useState<LottoDisponibile[]>([])
  const [caricato, setCaricato] = useState(false)
  const chiaveCategorie = categorie.join(',')
  const chiaveRestituibili = restituibili.map((r) => `${r.lotto_id}:${r.quantita}`).join(',')

  useEffect(() => {
    let attivo = true
    const includi = restituibili.map((r) => r.lotto_id)
    window.api.agri
      .lottiDisponibili(chiaveCategorie ? chiaveCategorie.split(',') : [], { includi })
      .then((l) => {
        if (!attivo) return
        // In modifica: ciò che questo record ha già scaricato torna disponibile.
        const extra = new Map<number, number>()
        for (const r of restituibili) extra.set(r.lotto_id, (extra.get(r.lotto_id) ?? 0) + r.quantita)
        setLotti(l.map((x) => ({ ...x, quantita_residua: x.quantita_residua + (extra.get(x.id) ?? 0) })))
        setCaricato(true)
      })
      .catch(() => {
        if (attivo) setCaricato(true)
      })
    return () => {
      attivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chiaveCategorie, chiaveRestituibili])

  const prodotti = useMemo(() => {
    const m = new Map<number, InfoProdotto & { id: number }>()
    for (const l of lotti) {
      if (l.quantita_residua <= 1e-9) continue
      const p = m.get(l.materia_prima_id)
      if (p) p.disponibile += l.quantita_residua
      else
        m.set(l.materia_prima_id, {
          id: l.materia_prima_id,
          nome: l.materia_prima_nome,
          unita: l.unita_misura,
          disponibile: l.quantita_residua,
          tempo_carenza_giorni: l.tempo_carenza_giorni
        })
    }
    return [...m.values()]
  }, [lotti])

  const prodotto = prodotti.find((p) => String(p.id) === valore.materia_prima_id) ?? null
  const lottiProdotto = lotti.filter((l) => String(l.materia_prima_id) === valore.materia_prima_id && l.quantita_residua > 1e-9)
  const lottoScelto = lottiProdotto.find((l) => String(l.id) === valore.lotto_id) ?? null
  const quantita = parseNumero(valore.quantita)
  const limite = lottoScelto ? lottoScelto.quantita_residua : (prodotto?.disponibile ?? 0)
  const supera = quantita !== null && !Number.isNaN(quantita) && prodotto !== null && quantita > limite + 1e-9

  useEffect(() => {
    onInfo?.(prodotto)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prodotto?.id, prodotto?.disponibile])

  if (caricato && prodotti.length === 0) {
    return (
      <CampoForm etichetta={etichetta} obbligatorio={obbligatorio}>
        <p className="rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">{testoVuoto}</p>
      </CampoForm>
    )
  }

  return (
    <div className="grid gap-3 rounded-md border border-border bg-secondary/20 p-3">
      <CampoForm etichetta={etichetta} obbligatorio={obbligatorio} htmlFor={`${idBase}-prodotto`}>
        <select
          id={`${idBase}-prodotto`}
          className={cls.select}
          value={valore.materia_prima_id}
          onChange={(e) => onChange({ ...valore, materia_prima_id: e.target.value, lotto_id: '' })}
        >
          <option value="">Scegli il prodotto…</option>
          {prodotti.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome} — {fmtQta(p.disponibile, p.unita)} disponibili
            </option>
          ))}
        </select>
      </CampoForm>
      {prodotto && (
        <div className="grid gap-3 sm:grid-cols-2">
          <CampoForm etichetta="Quantità totale" obbligatorio htmlFor={`${idBase}-quantita`}>
            <InputNumero id={`${idBase}-quantita`} valore={valore.quantita} unita={prodotto.unita} onChange={(q) => onChange({ ...valore, quantita: q })} />
          </CampoForm>
          <CampoForm etichetta="Lotto" htmlFor={`${idBase}-lotto`}>
            <select
              id={`${idBase}-lotto`}
              className={cls.select}
              value={valore.lotto_id}
              onChange={(e) => onChange({ ...valore, lotto_id: e.target.value })}
            >
              <option value="">Automatico (scade prima)</option>
              {lottiProdotto.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.codice || `#${l.id}`} · {fmtQta(l.quantita_residua, l.unita_misura)}
                  {l.data_scadenza ? ` · scade ${fmtData(l.data_scadenza)}` : ''}
                </option>
              ))}
            </select>
          </CampoForm>
        </div>
      )}
      {supera && (
        <p className="text-sm text-red-400">
          Quantità superiore alla giacenza {lottoScelto ? 'del lotto scelto' : 'disponibile'} ({fmtQta(limite, prodotto?.unita)}).
        </p>
      )}
    </div>
  )
}

/** Converte il valore del selettore nel payload per il main (null se non compilato). */
export function prodottoInPayload(v: ValoreProdotto): { materia_prima_id: number; quantita: number; lotto_id: number | null } | null {
  if (!v.materia_prima_id) return null
  const q = parseNumero(v.quantita)
  return {
    materia_prima_id: Number(v.materia_prima_id),
    quantita: q === null || Number.isNaN(q) ? Number.NaN : q,
    lotto_id: v.lotto_id ? Number(v.lotto_id) : null
  }
}
