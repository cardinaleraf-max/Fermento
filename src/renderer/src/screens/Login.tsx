import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type LoginProps = {
  primoAvvio: boolean
  onLoginSuccess: () => void
}

export default function Login({ primoAvvio, onLoginSuccess }: LoginProps): React.JSX.Element {
  const [nomeBirrificio, setNomeBirrificio] = useState('')
  const [password, setPassword] = useState('')
  const [confermaPassword, setConfermaPassword] = useState('')
  const [errore, setErrore] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    void window.api.impostazioni.valoreDi('nome_birrificio').then(setNomeBirrificio).catch(() => {})
  }, [])

  const handleLogin = async (): Promise<void> => {
    if (!password.trim()) {
      setErrore('Inserisci la password')
      return
    }
    setErrore('')
    setIsLoading(true)
    try {
      const risultato = await window.api.login.verifica(password)
      if (!risultato.ok) {
        setErrore(risultato.errore)
        return
      }
      await window.electron.ipcRenderer.invoke('login:aggiorna-accesso')
      onLoginSuccess()
    } finally {
      setIsLoading(false)
    }
  }

  const handleImpostaPassword = async (): Promise<void> => {
    if (!password.trim() || !confermaPassword.trim()) {
      setErrore('Compila entrambi i campi password')
      return
    }
    if (password !== confermaPassword) {
      setErrore('Le password non coincidono')
      return
    }
    setErrore('')
    setIsLoading(true)
    try {
      await window.api.login.impostaPassword(password)
      onLoginSuccess()
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
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
            {nomeBirrificio || 'Gestionale birrificio'}
          </p>
        </div>

        <div className="relative z-10 space-y-2.5">
          {['Magazzino materie prime', 'Gestione cotte e produzione', 'Clienti e vendite', 'Report e analisi'].map(
            (feature) => (
              <div key={feature} className="flex items-center gap-3">
                <div className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: 'rgba(232,160,32,0.5)' }} />
                <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.25)' }}>{feature}</span>
              </div>
            )
          )}
        </div>
      </div>

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

          <h2 className="text-xl font-semibold text-foreground mb-1">
            {primoAvvio ? 'Configura accesso' : 'Bentornato'}
          </h2>
          <p className="text-sm text-muted-foreground mb-8">
            {primoAvvio
              ? 'Imposta la password per proteggere il gestionale.'
              : 'Inserisci la password per accedere.'}
          </p>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !primoAvvio) void handleLogin()
                }}
                placeholder={primoAvvio ? 'Nuova password' : 'Password'}
                disabled={isLoading}
                className="h-10"
              />
            </div>

            {primoAvvio && (
              <div className="space-y-2">
                <Label htmlFor="confermaPassword">Conferma password</Label>
                <Input
                  id="confermaPassword"
                  type="password"
                  value={confermaPassword}
                  onChange={(event) => setConfermaPassword(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void handleImpostaPassword()
                  }}
                  placeholder="Conferma password"
                  disabled={isLoading}
                  className="h-10"
                />
              </div>
            )}

            {errore && <p className="text-sm text-destructive">{errore}</p>}

            <Button
              className="w-full h-10"
              onClick={primoAvvio ? handleImpostaPassword : handleLogin}
              disabled={isLoading}
            >
              {isLoading ? '...' : primoAvvio ? 'Imposta password' : 'Accedi'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
