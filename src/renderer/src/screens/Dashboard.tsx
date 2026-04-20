import { useEffect, useState } from 'react'
import { AlertTriangle, Beer, CalendarClock, Lightbulb } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type DashboardCotta = {
  id: number
  nome: string
  stile: string | null
  cotte_producibili: number
  ingrediente_limitante: string
}

type DashboardDati = {
  avvisi_attivi: number
  cotte_in_corso: number
  lotti_in_scadenza: number
  cotte_producibili: DashboardCotta[]
  suggerimento: { nome: string; totale_venduto: number } | null
}

const emptyDati: DashboardDati = {
  avvisi_attivi: 0,
  cotte_in_corso: 0,
  lotti_in_scadenza: 0,
  cotte_producibili: [],
  suggerimento: null
}

type DashboardProps = {
  onVaiAvvisi: () => void
}

export default function Dashboard({ onVaiAvvisi }: DashboardProps): React.JSX.Element {
  const [dati, setDati] = useState<DashboardDati>(emptyDati)
  const [errore, setErrore] = useState<string | null>(null)
  const [caricamento, setCaricamento] = useState(true)

  useEffect(() => {
    void (async () => {
      setCaricamento(true)
      setErrore(null)
      try {
        await window.api.avvisi.genera()
        const d = await window.api.dashboard.dati()
        setDati(d)
      } catch (e) {
        setErrore(e instanceof Error ? e.message : 'Errore nel caricamento della dashboard')
        setDati(emptyDati)
      } finally {
        setCaricamento(false)
      }
    })()
  }, [])

  return (
    <div className="space-y-6">
      {errore && (
        <p className="rounded-md border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400" role="alert">
          {errore}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card
          role="button"
          tabIndex={0}
          onClick={onVaiAvvisi}
          onKeyDown={(ev) => {
            if (ev.key === 'Enter' || ev.key === ' ') {
              ev.preventDefault()
              onVaiAvvisi()
            }
          }}
          className="cursor-pointer transition-colors hover:border-white/20"
        >
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avvisi attivi</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums">
              {caricamento ? '—' : dati.avvisi_attivi}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cotte in corso</CardTitle>
            <Beer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums">
              {caricamento ? '—' : dati.cotte_in_corso}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Prodotto in scadenza</CardTitle>
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums">
              {caricamento ? '—' : dati.lotti_in_scadenza}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Suggerimento prossima cotta</CardTitle>
            <Lightbulb className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {caricamento && <p className="text-sm text-muted-foreground">Caricamento…</p>}
            {!caricamento && dati.suggerimento && (
              <p className="text-sm text-foreground">
                Ti consiglio di produrre{' '}
                <span className="font-medium text-amber-400">{dati.suggerimento.nome}</span>
              </p>
            )}
            {!caricamento && !dati.suggerimento && (
              <p className="text-sm text-muted-foreground">Nessun dato di vendita sufficiente</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cotte producibili</CardTitle>
          <CardDescription>Stima in base alle giacenze materie prime e alla ricetta attiva</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Birra</th>
                  <th className="py-2 pr-3 font-medium">Cotte producibili</th>
                  <th className="py-2 font-medium">Ingrediente limitante</th>
                </tr>
              </thead>
              <tbody>
                {caricamento && (
                  <tr>
                    <td colSpan={3} className="py-4 text-muted-foreground">
                      Caricamento…
                    </td>
                  </tr>
                )}
                {!caricamento && dati.cotte_producibili.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-4 text-muted-foreground">
                      Nessuna birra con ricetta attiva
                    </td>
                  </tr>
                )}
                {!caricamento &&
                  dati.cotte_producibili.map((riga) => {
                    const zero = riga.cotte_producibili === 0
                    return (
                      <tr
                        key={riga.id}
                        className={cn('border-b border-border/60', zero && 'bg-red-500/10 text-red-400')}
                      >
                        <td className="py-2 pr-3">{riga.nome}</td>
                        <td className="py-2 pr-3 font-medium">
                          {Math.max(0, Math.floor(riga.cotte_producibili))}
                        </td>
                        <td className="py-2">{riga.ingrediente_limitante}</td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
