import { analizzaMarkdown, type Inline } from '@/lib/markdownBira'
import { cn } from '@/lib/utils'

function TestoInline({ parti }: { parti: Inline[] }): React.JSX.Element {
  return (
    <>
      {parti.map((p, i) =>
        p.tipo === 'grassetto' ? (
          <strong key={i} className="font-semibold text-ink/95">
            {p.testo}
          </strong>
        ) : p.tipo === 'corsivo' ? (
          <em key={i}>{p.testo}</em>
        ) : p.tipo === 'codice' ? (
          <code key={i} className="rounded bg-ink/[0.06] px-1 py-px font-mono text-[0.85em]">
            {p.testo}
          </code>
        ) : (
          <span key={i}>{p.testo}</span>
        )
      )}
    </>
  )
}

/** Celle corte (codici, date, numeri) su una riga sola: non vanno spezzate a metà. */
const corta = (parti: Inline[]): boolean => parti.reduce((n, p) => n + p.testo.length, 0) <= 22

/** Risposta di Bira con titoli, elenchi e tabelle (solo elementi React, niente HTML). */
export function TestoBira({ testo }: { testo: string }): React.JSX.Element {
  const blocchi = analizzaMarkdown(testo)
  return (
    <div className="space-y-2 break-words">
      {blocchi.map((b, i) => {
        switch (b.tipo) {
          case 'titolo':
            return (
              <p key={i} className="pt-1 text-[13px] font-semibold text-ink/95">
                <TestoInline parti={b.contenuto} />
              </p>
            )
          case 'paragrafo':
            return (
              <p key={i}>
                {b.righe.map((r, j) => (
                  <span key={j}>
                    {j > 0 && <br />}
                    <TestoInline parti={r} />
                  </span>
                ))}
              </p>
            )
          case 'elenco': {
            const Lista = b.ordinato ? 'ol' : 'ul'
            return (
              <Lista
                key={i}
                className={
                  b.ordinato ? 'list-decimal space-y-0.5 pl-5' : 'list-disc space-y-0.5 pl-5'
                }
              >
                {b.voci.map((v, j) => (
                  <li key={j}>
                    <TestoInline parti={v} />
                  </li>
                ))}
              </Lista>
            )
          }
          case 'tabella':
            return (
              <div key={i} className="overflow-x-auto rounded-md border border-ink/[0.08]">
                <table className="w-full text-[12px]">
                  <thead className="bg-ink/[0.04] text-left">
                    <tr>
                      {b.intestazioni.map((c, j) => (
                        <th
                          key={j}
                          className="whitespace-nowrap px-2 py-1 font-semibold text-ink/80"
                        >
                          <TestoInline parti={c} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.righe.map((r, j) => (
                      <tr key={j} className="border-t border-ink/[0.06]">
                        {r.map((c, k) => (
                          <td
                            key={k}
                            className={cn('px-2 py-1 align-top', corta(c) && 'whitespace-nowrap')}
                          >
                            <TestoInline parti={c} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          case 'separatore':
            return <hr key={i} className="border-ink/[0.08]" />
        }
      })}
    </div>
  )
}
