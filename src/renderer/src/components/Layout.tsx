import { useEffect, useState, type ReactNode } from 'react'
import {
  BarChart3,
  Bell,
  Box,
  FlaskConical,
  LayoutDashboard,
  Package,
  Settings,
  ShoppingCart,
  Users,
  Warehouse
} from 'lucide-react'
import { cn } from '@/lib/utils'

export type Sezione =
  | 'dashboard'
  | 'magazzino-mp'
  | 'magazzino-conf'
  | 'produzione'
  | 'prodotto-finito'
  | 'clienti'
  | 'vendite'
  | 'report'
  | 'avvisi'
  | 'impostazioni'

type LayoutProps = {
  sezioneCorrente: Sezione
  onSezioneChange: (sezione: Sezione) => void
  children: ReactNode
}

type NavItem = {
  key: Sezione
  label: string
  icon: typeof LayoutDashboard
}

const navItems: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'magazzino-mp', label: 'Magazzino materie prime', icon: Package },
  { key: 'magazzino-conf', label: 'Magazzino confezionamento', icon: Box },
  { key: 'produzione', label: 'Produzione', icon: FlaskConical },
  { key: 'prodotto-finito', label: 'Prodotto finito', icon: Warehouse },
  { key: 'clienti', label: 'Clienti', icon: Users },
  { key: 'vendite', label: 'Vendite', icon: ShoppingCart },
  { key: 'report', label: 'Report', icon: BarChart3 },
  { key: 'avvisi', label: 'Avvisi', icon: Bell },
  { key: 'impostazioni', label: 'Impostazioni', icon: Settings }
]

const sezioneLabelMap: Record<Sezione, string> = Object.fromEntries(
  navItems.map((item) => [item.key, item.label])
) as Record<Sezione, string>

export function Layout({ sezioneCorrente, onSezioneChange, children }: LayoutProps): React.JSX.Element {
  const [conteggioAvvisi, setConteggioAvvisi] = useState(0)
  const [nomeBirrificio, setNomeBirrificio] = useState('')

  useEffect(() => {
    void window.api.impostazioni.valoreDi('nome_birrificio').then(setNomeBirrificio).catch(() => {})
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        const lista = await window.api.avvisi.lista()
        setConteggioAvvisi(lista.length)
      } catch {
        setConteggioAvvisi(0)
      }
    })()
  }, [sezioneCorrente])

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside
        className="fixed left-0 top-0 flex h-screen w-56 flex-col"
        style={{ background: '#0C0C14', borderRight: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div className="px-5 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <h1
            style={{
              fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
              fontSize: '1.75rem',
              fontWeight: 700,
              color: '#E8A020',
              letterSpacing: '0.125em',
              lineHeight: 1
            }}
          >
            FERMENTO
          </h1>
          <p
            style={{
              fontSize: '0.625rem',
              color: 'rgba(255,255,255,0.25)',
              textTransform: 'uppercase',
              letterSpacing: '0.18em',
              marginTop: '4px'
            }}
          >
            {nomeBirrificio || 'Gestionale birrificio'}
          </p>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2.5">
          {navItems.map((item) => {
            const Icon = item.icon
            const isActive = item.key === sezioneCorrente

            return (
              <button
                key={item.key}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-xs font-medium transition-all duration-150',
                  isActive ? 'text-amber-400' : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
                )}
                style={isActive ? { background: 'rgba(232,160,32,0.1)' } : undefined}
                onClick={() => onSezioneChange(item.key)}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{item.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="p-2.5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button
            type="button"
            onClick={() => onSezioneChange('avvisi')}
            className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left transition-all hover:bg-white/[0.04]"
          >
            <div className="flex items-center gap-2 text-white/35">
              <Bell className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">Avvisi attivi</span>
            </div>
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-amber-400"
              style={{ background: 'rgba(232,160,32,0.12)', border: '1px solid rgba(232,160,32,0.25)' }}
            >
              {conteggioAvvisi}
            </span>
          </button>
        </div>
      </aside>

      <div className="ml-56 flex min-h-screen flex-1 flex-col">
        <header
          className="sticky top-0 z-10 px-6 py-3.5"
          style={{
            background: 'rgba(12,12,20,0.9)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderBottom: '1px solid rgba(255,255,255,0.06)'
          }}
        >
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/35">
            {sezioneLabelMap[sezioneCorrente]}
          </h2>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}
