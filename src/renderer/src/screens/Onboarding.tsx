import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { InterruttoreTema } from '@/components/InterruttoreTema'
import { inkBordo, inkTesto } from '@/lib/tema'

type Props = {
  onOnboardingCompletato: () => void
}

type Step = 1 | 2 | 3

type FormData = {
  nome_birrificio: string
  nome_titolare: string
  cotta_litri: number
  shelf_life_mesi: number
  formato_bottiglia_cl: number | null
  bottiglie_per_cartone: number
}

const STEP_LABELS = ['Il tuo birrificio', 'Come produci', 'Tutto pronto']

export default function Onboarding({ onOnboardingCompletato }: Props): React.JSX.Element {
  const [step, setStep] = useState<Step>(1)
  const [isLoading, setIsLoading] = useState(false)
  const [errore, setErrore] = useState('')
  const [form, setForm] = useState<FormData>({
    nome_birrificio: '',
    nome_titolare: '',
    cotta_litri: 250,
    shelf_life_mesi: 13,
    formato_bottiglia_cl: 33,
    bottiglie_per_cartone: 6
  })

  const avanti = (): void => {
    setErrore('')
    if (step === 1) {
      if (!form.nome_birrificio.trim()) {
        setErrore('Il nome del birrificio e\' obbligatorio')
        return
      }
      setStep(2)
    } else if (step === 2) {
      setStep(3)
    }
  }

  const indietro = (): void => {
    setErrore('')
    if (step === 2) setStep(1)
    else if (step === 3) setStep(2)
  }

  const handleCompleta = async (): Promise<void> => {
    setIsLoading(true)
    try {
      await window.api.onboarding.completa({
        nome_birrificio: form.nome_birrificio.trim(),
        nome_titolare: form.nome_titolare.trim(),
        cotta_litri: form.cotta_litri,
        shelf_life_mesi: form.shelf_life_mesi,
        formato_bottiglia_cl: form.formato_bottiglia_cl,
        bottiglie_per_cartone: form.bottiglie_per_cartone
      })
      onOnboardingCompletato()
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      <InterruttoreTema className="fixed right-4 top-4 z-20" />
      {/* Sidebar sinistra */}
      <div
        className="hidden lg:flex lg:w-[400px] flex-shrink-0 flex-col justify-between p-12 relative overflow-hidden"
        style={{ background: 'var(--sidebar)', borderRight: '1px solid var(--line)' }}
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
              color: 'var(--brand-text)',
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
              color: inkTesto(0.22),
              textTransform: 'uppercase',
              letterSpacing: '0.22em'
            }}
          >
            Configurazione iniziale
          </p>
        </div>

        {/* Step indicator verticale */}
        <div className="relative z-10 space-y-4">
          {STEP_LABELS.map((label, i) => {
            const n = (i + 1) as Step
            const attivo = n === step
            const completato = n < step
            return (
              <div key={n} className="flex items-center gap-3">
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    background: attivo ? '#E8A020' : 'transparent',
                    border: attivo ? 'none' : `1px solid ${inkBordo(0.2)}`,
                    color: attivo ? '#0C0C14' : completato ? inkTesto(0.7) : inkTesto(0.3)
                  }}
                >
                  {completato ? '✓' : n}
                </div>
                <span
                  style={{
                    fontSize: '0.75rem',
                    color: attivo ? inkTesto(0.9) : completato ? inkTesto(0.5) : inkTesto(0.25)
                  }}
                >
                  {label}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Lato destro */}
      <div className="flex flex-1 flex-col justify-between px-8 py-12">
        <div className="w-full max-w-sm mx-auto">
          {/* Step 1 */}
          {step === 1 && (
            <div>
              <h2 className="text-xl font-semibold text-foreground mb-1">Il tuo birrificio</h2>
              <p className="text-sm text-muted-foreground mb-8">Come si chiama il tuo birrificio?</p>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nome_birrificio">Nome birrificio *</Label>
                  <Input
                    id="nome_birrificio"
                    value={form.nome_birrificio}
                    onChange={(e) => setForm({ ...form, nome_birrificio: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') avanti() }}
                    placeholder="Es. Birrificio della Valle"
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nome_titolare">Nome titolare / responsabile</Label>
                  <Input
                    id="nome_titolare"
                    value={form.nome_titolare}
                    onChange={(e) => setForm({ ...form, nome_titolare: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') avanti() }}
                    placeholder="Es. Mario Rossi"
                    className="h-10"
                  />
                </div>
                {errore && <p className="text-sm text-destructive">{errore}</p>}
              </div>
            </div>
          )}

          {/* Step 2 */}
          {step === 2 && (
            <div>
              <h2 className="text-xl font-semibold text-foreground mb-1">Come produci</h2>
              <p className="text-sm text-muted-foreground mb-8">Parametri di produzione standard del tuo birrificio.</p>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="cotta_litri">Dimensione cotta standard (litri)</Label>
                  <Input
                    id="cotta_litri"
                    type="number"
                    value={form.cotta_litri}
                    onChange={(e) => setForm({ ...form, cotta_litri: parseInt(e.target.value) || 250 })}
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shelf_life">Shelf life prodotto (mesi)</Label>
                  <Input
                    id="shelf_life"
                    type="number"
                    value={form.shelf_life_mesi}
                    onChange={(e) => setForm({ ...form, shelf_life_mesi: parseInt(e.target.value) || 13 })}
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bottiglie_per_cartone">Bottiglie per cartone</Label>
                  <Input
                    id="bottiglie_per_cartone"
                    type="number"
                    value={form.bottiglie_per_cartone}
                    onChange={(e) => setForm({ ...form, bottiglie_per_cartone: parseInt(e.target.value) || 6 })}
                    className="h-10"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="formato_bottiglia">Formato bottiglia principale (cl)</Label>
                  <select
                    id="formato_bottiglia"
                    value={form.formato_bottiglia_cl ?? 'altro'}
                    onChange={(e) => {
                      const v = e.target.value
                      setForm({ ...form, formato_bottiglia_cl: v === 'altro' ? null : parseInt(v) })
                    }}
                    style={{
                      width: '100%',
                      height: '40px',
                      padding: '0 12px',
                      background: 'hsl(var(--background))',
                      color: 'hsl(var(--foreground))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                      outline: 'none',
                      fontSize: '0.875rem'
                    }}
                  >
                    <option value="33">33 cl</option>
                    <option value="50">50 cl</option>
                    <option value="75">75 cl</option>
                    <option value="altro">Altro - lo creo dopo</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Step 3 */}
          {step === 3 && (
            <div>
              <h2 className="text-xl font-semibold text-foreground mb-1">Tutto pronto</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Fermento e&apos; configurato per {form.nome_birrificio || 'il tuo birrificio'}.
              </p>
              <div className="space-y-2 mb-8">
                {[
                  `Cotta standard: ${form.cotta_litri} litri`,
                  `Shelf life: ${form.shelf_life_mesi} mesi`,
                  `Bottiglie per cartone: ${form.bottiglie_per_cartone}`,
                  form.formato_bottiglia_cl ? `Bottiglia principale: ${form.formato_bottiglia_cl} cl` : 'Formato bottiglia: da configurare'
                ].map((testo) => (
                  <div key={testo} className="flex items-start gap-2">
                    <div
                      className="flex-shrink-0 mt-1.5"
                      style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#E8A020' }}
                    />
                    <span className="text-sm text-muted-foreground">{testo}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Prossimi passi:</p>
                {[
                  'Aggiungi le tue birre e le ricette dal menu Impostazioni',
                  'Carica le materie prime in magazzino',
                  'Configura il magazzino confezionamento con bottiglie, etichette e fusti'
                ].map((suggerimento) => (
                  <div key={suggerimento} className="flex items-start gap-2">
                    <div
                      className="flex-shrink-0 mt-1.5"
                      style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'rgba(232,160,32,0.5)' }}
                    />
                    <span>{suggerimento}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Navigation buttons */}
        <div className="w-full max-w-sm mx-auto flex justify-between items-center mt-8">
          {step > 1 ? (
            <button
              onClick={indietro}
              style={{ fontSize: '0.875rem', background: 'none', border: 'none', cursor: 'pointer' }}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Indietro
            </button>
          ) : (
            <span />
          )}
          <Button
            onClick={step === 3 ? () => { void handleCompleta() } : avanti}
            disabled={isLoading}
            style={{
              background: 'var(--pulsante-avanti)',
              color: 'var(--brand-text)',
              border: '1px solid rgba(232,160,32,0.3)',
              borderRadius: '9999px',
              padding: '8px 24px'
            }}
          >
            {isLoading ? '...' : step === 3 ? 'Entra nel gestionale' : 'Avanti'}
          </Button>
        </div>
      </div>
    </div>
  )
}
