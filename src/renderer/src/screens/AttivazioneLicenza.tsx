import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'

type Props = {
  onLicenzaAttivata: () => void
}

export default function AttivazioneLicenza({ onLicenzaAttivata }: Props): React.JSX.Element {
  const [chiave, setChiave] = useState('')
  const [errore, setErrore] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const handleAttiva = async (): Promise<void> => {
    if (!chiave.trim()) {
      setErrore('Inserisci la chiave licenza')
      return
    }
    setErrore('')
    setIsLoading(true)
    try {
      const risultato = await window.api.licenza.attiva(chiave.trim())
      if (!risultato.ok) {
        setErrore(risultato.errore)
        return
      }
      onLicenzaAttivata()
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar sinistra */}
      <div
        className="hidden lg:flex lg:w-[400px] flex-shrink-0 flex-col justify-between p-12 relative overflow-hidden"
        style={{ background: '#0C0C14', borderRight: '1px solid rgba(255,255,255,0.06)' }}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse at 25% 20%, rgba(232,160,32,0.07) 0%, transparent 55%)'
          }}
        />
        <div
          className="absolute -bottom-40 -left-40 rounded-full pointer-events-none"
          style={{ width: '400px', height: '400px', background: 'rgba(232,160,32,0.04)', filter: 'blur(70px)' }}
        />

        <div className="relative z-10">
          <h1
            style={{
              fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
              fontSize: '2.5rem',
              fontWeight: 700,
              color: '#E8A020',
              lineHeight: 1.05,
              letterSpacing: '0.12em'
            }}
          >
            FERMENTO
          </h1>
          <p
            className="mt-2.5"
            style={{
              fontSize: '0.65rem',
              color: 'rgba(255,255,255,0.22)',
              textTransform: 'uppercase',
              letterSpacing: '0.22em'
            }}
          >
            Attivazione
          </p>
        </div>

        <div />
      </div>

      {/* Lato destro */}
      <div className="flex flex-1 items-center justify-center px-8 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-2 lg:hidden">
            <h1
              style={{
                fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
                fontSize: '2rem',
                fontWeight: 700,
                color: '#E8A020',
                letterSpacing: '0.12em'
              }}
            >
              FERMENTO
            </h1>
          </div>

          <h2 className="text-xl font-semibold text-foreground mb-1">Attiva la tua licenza</h2>
          <p className="text-sm text-muted-foreground mb-8">
            Inserisci la chiave di licenza che hai ricevuto. La trovi nel messaggio che ti &egrave; stato inviato insieme al link di download di Fermento.
          </p>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="chiave">Chiave licenza</Label>
              <textarea
                id="chiave"
                value={chiave}
                onChange={(e) => setChiave(e.target.value)}
                placeholder="FRMTO-XXXXX-XXXXX-..."
                disabled={isLoading}
                rows={4}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  fontFamily: 'monospace',
                  fontSize: '0.8rem',
                  background: 'hsl(var(--background))',
                  color: 'hsl(var(--foreground))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                  resize: 'none',
                  outline: 'none'
                }}
              />
            </div>

            {errore && (
              <div
                style={{
                  padding: '10px 14px',
                  background: 'rgba(220, 38, 38, 0.12)',
                  border: '1px solid rgba(220, 38, 38, 0.35)',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  color: '#f87171',
                  lineHeight: 1.4
                }}
              >
                {errore === 'Licenza scaduta'
                  ? 'La licenza non è più valida. Contatta il supporto per rinnovarla.'
                  : errore === 'Firma non valida'
                    ? 'La chiave inserita non è valida. Controlla di averla copiata per intero.'
                    : errore}
              </div>
            )}

            <p style={{ fontSize: '0.72rem', color: 'rgba(150,150,160,0.85)', lineHeight: 1.5 }}>
              Non hai una chiave o l&apos;hai persa? Scrivi su WhatsApp al{' '}
              <a
                href="https://wa.me/393920287899"
                target="_blank"
                rel="noreferrer"
                style={{ color: 'rgba(200,200,210,0.9)', textDecoration: 'underline', textUnderlineOffset: '2px' }}
              >
                +39 392 028 7899
              </a>
            </p>

            <Button
              className="w-full h-10"
              onClick={() => { void handleAttiva() }}
              disabled={isLoading}
            >
              {isLoading ? '...' : 'Attiva'}
            </Button>

            <p style={{ fontSize: '11px', color: '#666', textAlign: 'center', marginTop: '4px' }}>
              Fermento &mdash; Gestionale per birrifici artigianali
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
