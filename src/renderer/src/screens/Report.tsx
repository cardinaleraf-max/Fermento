import { useCallback, useEffect, useMemo, useState } from 'react'
import { Gift } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

function toYmd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function defaultRange(): { da: string; a: string } {
  const a = new Date()
  const da = new Date(a)
  da.setDate(da.getDate() - 90)
  return { da: toYmd(da), a: toYmd(a) }
}

function num(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '0'
  return n.toLocaleString('it-IT', { maximumFractionDigits: 2 })
}

function intg(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '0'
  return String(Math.round(n))
}

function fmtDataIt(s: string | null | undefined): string {
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleDateString('it-IT')
}

type ProduzioneRiga = Awaited<ReturnType<typeof window.api.report.produzione>>[number]
type VcRiga = Awaited<ReturnType<typeof window.api.report.venditePerCliente>>[number]
type VbRiga = Awaited<ReturnType<typeof window.api.report.venditePerId>>[number]
type TrendRiga = Awaited<ReturnType<typeof window.api.report.trendMensile>>[number]
type OmaggioRiga = Awaited<ReturnType<typeof window.api.report.omaggi>>[number]

function labelTipo(t: string): string {
  if (t === 'fusto') return 'fusto'
  if (t === 'bottiglia') return 'bott.'
  return t
}

export default function Report(): React.JSX.Element {
  const iniziale = useMemo(() => defaultRange(), [])
  const [da, setDa] = useState(iniziale.da)
  const [a, setA] = useState(iniziale.a)
  const [produzione, setProduzione] = useState<ProduzioneRiga[]>([])
  const [venditeCli, setVenditeCli] = useState<VcRiga[]>([])
  const [venditeBir, setVenditeBir] = useState<VbRiga[]>([])
  const [trend, setTrend] = useState<TrendRiga[]>([])
  const [omaggi, setOmaggi] = useState<OmaggioRiga[]>([])
  const [caricamento, setCaricamento] = useState(true)
  const [errore, setErrore] = useState<string | null>(null)

  const carica = useCallback(async () => {
    setCaricamento(true)
    setErrore(null)
    try {
      const [p, vc, vb, t, om] = await Promise.all([
        window.api.report.produzione(da, a),
        window.api.report.venditePerCliente(da, a),
        window.api.report.venditePerId(da, a),
        window.api.report.trendMensile(da, a),
        window.api.report.omaggi(da, a)
      ])
      setProduzione(p)
      setVenditeCli(vc)
      setVenditeBir(vb)
      setTrend(t)
      setOmaggi(om)
    } catch (e) {
      setErrore(e instanceof Error ? e.message : 'Errore caricamento report')
      setProduzione([])
      setVenditeCli([])
      setVenditeBir([])
      setTrend([])
      setOmaggi([])
    } finally {
      setCaricamento(false)
    }
  }, [da, a])

  const totaleOmaggiBottiglie = useMemo(
    () =>
      omaggi.reduce(
        (sum, r) =>
          sum +
          r.righe
            .filter((x) => x.tipo_prodotto === 'bottiglia')
            .reduce((s, x) => s + (x.quantita || 0), 0),
        0
      ),
    [omaggi]
  )

  useEffect(() => {
    void carica()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Periodo</CardTitle>
          <CardDescription>Seleziona l&apos;intervallo (date ISO) e aggiorna i report.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-end sm:flex-wrap">
          <div className="space-y-1">
            <Label htmlFor="rep-da">Da</Label>
            <Input id="rep-da" type="date" value={da} onChange={(e) => setDa(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="rep-a">A</Label>
            <Input id="rep-a" type="date" value={a} onChange={(e) => setA(e.target.value)} />
          </div>
          <Button type="button" onClick={() => void carica()} disabled={caricamento}>
            {caricamento ? 'Caricamento…' : 'Aggiorna'}
          </Button>
        </CardContent>
      </Card>

      {errore && (
        <p className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400" role="alert">
          {errore}
        </p>
      )}

      <section>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Produzione per birra</h3>
        <div className="overflow-x-auto rounded-md border border-border bg-card">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/40 text-left text-muted-foreground">
                <th className="p-3 font-medium">Birra</th>
                <th className="p-3 font-medium">Cotte</th>
                <th className="p-3 font-medium">Litri totali</th>
                <th className="p-3 font-medium">Bottiglie</th>
              </tr>
            </thead>
            <tbody>
              {caricamento && (
                <tr>
                  <td colSpan={4} className="p-4 text-muted-foreground">…</td>
                </tr>
              )}
              {!caricamento &&
                produzione.map((r) => (
                  <tr key={r.birra_nome} className="border-b border-border/50">
                    <td className="p-3 font-medium text-foreground">{r.birra_nome}</td>
                    <td className="p-3 text-foreground/80">{intg(r.numero_cotte)}</td>
                    <td className="p-3 text-foreground/80">{num(r.litri_totali)}</td>
                    <td className="p-3 text-foreground/80">{intg(r.bottiglie_totali)}</td>
                  </tr>
                ))}
              {!caricamento && produzione.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-4 text-muted-foreground">Nessun dato</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Vendite per cliente</h3>
        <div className="overflow-x-auto rounded-md border border-border bg-card">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/40 text-left text-muted-foreground">
                <th className="p-3 font-medium">Cliente</th>
                <th className="p-3 font-medium">Tipo</th>
                <th className="p-3 font-medium">Vendite</th>
                <th className="p-3 font-medium">Bottiglie</th>
                <th className="p-3 font-medium">Fusti</th>
                <th className="p-3 font-medium">Ultima vendita</th>
              </tr>
            </thead>
            <tbody>
              {caricamento && (
                <tr>
                  <td colSpan={6} className="p-4 text-muted-foreground">…</td>
                </tr>
              )}
              {!caricamento &&
                venditeCli.map((r) => (
                  <tr key={r.cliente_nome} className="border-b border-border/50">
                    <td className="p-3 font-medium text-foreground">{r.cliente_nome}</td>
                    <td className="p-3 text-foreground/80">{r.tipo_cliente ?? '—'}</td>
                    <td className="p-3 text-foreground/80">{intg(r.numero_vendite)}</td>
                    <td className="p-3 text-foreground/80">{intg(r.bottiglie_totali)}</td>
                    <td className="p-3 text-foreground/80">{intg(r.fusti_totali)}</td>
                    <td className="p-3 text-foreground/80 whitespace-nowrap">{fmtDataIt(r.ultima_vendita)}</td>
                  </tr>
                ))}
              {!caricamento && venditeCli.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-4 text-muted-foreground">Nessun dato</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Vendite per birra</h3>
        <div className="overflow-x-auto rounded-md border border-border bg-card">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/40 text-left text-muted-foreground">
                <th className="p-3 font-medium">Birra</th>
                <th className="p-3 font-medium">Stile</th>
                <th className="p-3 font-medium">Bottiglie</th>
                <th className="p-3 font-medium">Fusti</th>
                <th className="p-3 font-medium">N. vendite</th>
              </tr>
            </thead>
            <tbody>
              {caricamento && (
                <tr>
                  <td colSpan={5} className="p-4 text-muted-foreground">…</td>
                </tr>
              )}
              {!caricamento &&
                venditeBir.map((r) => (
                  <tr key={r.birra_nome} className="border-b border-border/50">
                    <td className="p-3 font-medium text-foreground">{r.birra_nome}</td>
                    <td className="p-3 text-foreground/80">{r.stile ?? '—'}</td>
                    <td className="p-3 text-foreground/80">{intg(r.bottiglie_totali)}</td>
                    <td className="p-3 text-foreground/80">{intg(r.fusti_totali)}</td>
                    <td className="p-3 text-foreground/80">{intg(r.numero_vendite)}</td>
                  </tr>
                ))}
              {!caricamento && venditeBir.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-4 text-muted-foreground">Nessun dato</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Trend mensile</h3>
        <div className="overflow-x-auto rounded-md border border-border bg-card">
          <table className="w-full min-w-[400px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/40 text-left text-muted-foreground">
                <th className="p-3 font-medium">Mese</th>
                <th className="p-3 font-medium">Bottiglie</th>
                <th className="p-3 font-medium">Fusti</th>
              </tr>
            </thead>
            <tbody>
              {caricamento && (
                <tr>
                  <td colSpan={3} className="p-4 text-muted-foreground">…</td>
                </tr>
              )}
              {!caricamento &&
                trend.map((r) => (
                  <tr key={r.mese} className="border-b border-border/50">
                    <td className="p-3 font-medium text-foreground">{r.mese}</td>
                    <td className="p-3 text-foreground/80">{intg(r.bottiglie)}</td>
                    <td className="p-3 text-foreground/80">{intg(r.fusti)}</td>
                  </tr>
                ))}
              {!caricamento && trend.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-4 text-muted-foreground">Nessun dato</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Gift className="h-4 w-4 text-amber-400" />
            Omaggi
          </h3>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              <span className="font-semibold text-foreground">{omaggi.length}</span> nel periodo
            </span>
            <span>
              Totale bottiglie:{' '}
              <span className="font-semibold text-amber-400">
                {intg(totaleOmaggiBottiglie)}
              </span>
            </span>
          </div>
        </div>
        <div className="overflow-x-auto rounded-md border border-border bg-card">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-secondary/40 text-left text-muted-foreground">
                <th className="p-3 font-medium">Data</th>
                <th className="p-3 font-medium">Cliente</th>
                <th className="p-3 font-medium">Occasione</th>
                <th className="p-3 font-medium">Dettaglio prodotti</th>
                <th className="p-3 text-right font-medium">Bottiglie</th>
              </tr>
            </thead>
            <tbody>
              {caricamento && (
                <tr>
                  <td colSpan={5} className="p-4 text-muted-foreground">…</td>
                </tr>
              )}
              {!caricamento &&
                omaggi.map((r) => (
                  <tr key={r.id} className="border-b border-border/50 align-top">
                    <td className="p-3 text-foreground/80 whitespace-nowrap">
                      {fmtDataIt(r.data)}
                    </td>
                    <td className="p-3 font-medium text-foreground">
                      {r.cliente_nome ?? '—'}
                    </td>
                    <td className="p-3 text-foreground/80">
                      {r.occasione ? (
                        <Badge className="bg-amber-500/15 text-amber-400 hover:bg-amber-500/20">
                          {r.occasione}
                        </Badge>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="p-3 text-foreground/80">
                      {r.righe.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <ul className="space-y-0.5">
                          {r.righe.map((x, i) => (
                            <li key={i} className="text-xs">
                              <span className="font-medium text-foreground">{x.birra_nome}</span>{' '}
                              <span className="text-muted-foreground">
                                ({x.numero_lotto}) — {intg(x.quantita)} {labelTipo(x.tipo_prodotto)}
                                {x.tipo_prodotto === 'fusto' && x.formato_nome
                                  ? ` ${x.formato_nome}`
                                  : ''}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="p-3 text-right tabular-nums text-foreground/80">
                      {intg(
                        r.righe
                          .filter((x) => x.tipo_prodotto === 'bottiglia')
                          .reduce((s, x) => s + (x.quantita || 0), 0)
                      )}
                    </td>
                  </tr>
                ))}
              {!caricamento && omaggi.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-4 text-muted-foreground">
                    Nessun omaggio nel periodo
                  </td>
                </tr>
              )}
            </tbody>
            {!caricamento && omaggi.length > 0 && (
              <tfoot>
                <tr className="border-t border-border bg-secondary/30 text-foreground">
                  <td className="p-3 font-medium" colSpan={4}>
                    Totale {omaggi.length} omaggi
                  </td>
                  <td className="p-3 text-right font-semibold tabular-nums text-amber-400">
                    {intg(totaleOmaggiBottiglie)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </div>
  )
}
