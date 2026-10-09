import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import {
  BarChart3,
  Bell,
  Box,
  Boxes,
  Flame,
  FlaskConical,
  LayoutDashboard,
  Microscope,
  Package,
  Route,
  Settings,
  ShoppingCart,
  Sprout,
  Tractor,
  Users,
  Warehouse,
  Wheat
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { BiraLauncher } from './BiraLauncher'

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
  | 'agri-campi'
  | 'agri-operazioni'
  | 'agri-raccolte'
  | 'agri-calibrature'
  | 'agri-maltazioni'
  | 'agri-input'
  | 'agri-tracciabilita'

type LayoutProps = {
  sezioneCorrente: Sezione
  onSezioneChange: (sezione: Sezione) => void
  /** Mostra il gruppo "Filiera agricola" nel menu (modulo agricolo attivo). */
  moduloAgricolo?: boolean
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

/** Voci del modulo agricolo, nell'ordine del processo. */
const navItemsAgricoli: NavItem[] = [
  { key: 'agri-campi', label: 'Campi e semine', icon: Sprout },
  { key: 'agri-operazioni', label: 'Operazioni di campo', icon: Tractor },
  { key: 'agri-raccolte', label: 'Raccolte', icon: Wheat },
  { key: 'agri-calibrature', label: 'Analisi e calibratura', icon: Microscope },
  { key: 'agri-maltazioni', label: 'Maltazioni', icon: Flame },
  { key: 'agri-input', label: 'Magazzino input agricoli', icon: Boxes },
  { key: 'agri-tracciabilita', label: 'Tracciabilità', icon: Route }
]

export const SEZIONI_AGRICOLE: Sezione[] = navItemsAgricoli.map((i) => i.key)

const sezioneLabelMap: Record<Sezione, string> = Object.fromEntries(
  [...navItems, ...navItemsAgricoli].map((item) => [item.key, item.label])
) as Record<Sezione, string>

function TitoloGruppo({ children }: { children: ReactNode }): React.JSX.Element {
  return (
    <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/25">
      {children}
    </p>
  )
}

export function Layout({
  sezioneCorrente,
  onSezioneChange,
  moduloAgricolo = false,
  children
}: LayoutProps): React.JSX.Element {
  const [conteggioAvvisi, setConteggioAvvisi] = useState(0)
  const [avvisiNuovi, setAvvisiNuovi] = useState(false)
  const [nomeBirrificio, setNomeBirrificio] = useState('')
  const conteggioPrecedente = useRef<number | null>(null)

  useEffect(() => {
    void window.api.impostazioni
      .valoreDi('nome_birrificio')
      .then(setNomeBirrificio)
      .catch(() => {})
  }, [])

  // Polling avvisi: aggiorna il contatore e fa "muovere" il badge quando ne arriva uno nuovo.
  useEffect(() => {
    let attivo = true
    const carica = async (): Promise<void> => {
      try {
        const lista = await window.api.avvisi.lista()
        if (!attivo) return
        const n = lista.length
        if (conteggioPrecedente.current !== null && n > conteggioPrecedente.current) {
          setAvvisiNuovi(true)
        }
        conteggioPrecedente.current = n
        setConteggioAvvisi(n)
      } catch {
        if (attivo) setConteggioAvvisi(0)
      }
    }
    void carica()
    const timer = setInterval(() => void carica(), 30000)
    return () => {
      attivo = false
      clearInterval(timer)
    }
  }, [sezioneCorrente])

  // Aprendo la pagina Avvisi si "spegne" l'animazione: l'utente li ha visti.
  useEffect(() => {
    if (sezioneCorrente === 'avvisi') setAvvisiNuovi(false)
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
          {navItems.map((item, indice) => {
            const Icon = item.icon
            const isActive = item.key === sezioneCorrente
            // A modulo agricolo attivo: Dashboard, poi "Filiera agricola", poi "Birrificio".
            const gruppoAgricolo =
              moduloAgricolo && indice === 1 ? (
                <div key="gruppo-agricolo" className="space-y-0.5">
                  <TitoloGruppo>Filiera agricola</TitoloGruppo>
                  {navItemsAgricoli.map((agri) => {
                    const AgriIcon = agri.icon
                    const agriAttivo = agri.key === sezioneCorrente
                    return (
                      <button
                        key={agri.key}
                        className={cn(
                          'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-xs font-medium transition-all duration-150',
                          agriAttivo
                            ? 'text-amber-400'
                            : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
                        )}
                        style={agriAttivo ? { background: 'rgba(232,160,32,0.1)' } : undefined}
                        onClick={() => onSezioneChange(agri.key)}
                      >
                        <AgriIcon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{agri.label}</span>
                      </button>
                    )
                  })}
                  <TitoloGruppo>Birrificio</TitoloGruppo>
                </div>
              ) : null

            return (
              <Fragment key={item.key}>
                {gruppoAgricolo}
                <button
                  key={item.key}
                  className={cn(
                    'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-xs font-medium transition-all duration-150',
                    isActive
                      ? 'text-amber-400'
                      : 'text-white/40 hover:text-white/70 hover:bg-white/[0.04]'
                  )}
                  style={isActive ? { background: 'rgba(232,160,32,0.1)' } : undefined}
                  onClick={() => onSezioneChange(item.key)}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{item.label}</span>
                  {item.key === 'avvisi' && conteggioAvvisi > 0 && (
                    <span className="relative ml-auto flex shrink-0 items-center justify-center">
                      {avvisiNuovi && (
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500/70" />
                      )}
                      <span
                        className={cn(
                          'relative inline-flex min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1.5 py-px text-[10px] font-bold text-white',
                          avvisiNuovi && 'animate-bounce'
                        )}
                      >
                        {conteggioAvvisi}
                      </span>
                    </span>
                  )}
                </button>
              </Fragment>
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
              <Bell className={cn('h-3.5 w-3.5', avvisiNuovi && 'animate-bounce text-red-400')} />
              <span className="text-xs font-medium">Avvisi attivi</span>
            </div>
            {avvisiNuovi ? (
              <span className="rounded-full border border-red-500/40 bg-red-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-red-300">
                {conteggioAvvisi}
              </span>
            ) : (
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold text-amber-400"
                style={{
                  background: 'rgba(232,160,32,0.12)',
                  border: '1px solid rgba(232,160,32,0.25)'
                }}
              >
                {conteggioAvvisi}
              </span>
            )}
          </button>
        </div>

        <BiraLauncher />
      </aside>

      <div className="ml-56 flex min-h-screen min-w-0 flex-1 flex-col">
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
        <main className="min-w-0 flex-1 p-6">{children}</main>
      </div>
    </div>
  )
}
