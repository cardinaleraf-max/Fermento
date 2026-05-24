import { useEffect, useState } from 'react'
import { Layout, type Sezione } from './components/Layout'
import Dashboard from './screens/Dashboard'
import Login from './screens/Login'
import AttivazioneLicenza from './screens/AttivazioneLicenza'
import Onboarding from './screens/Onboarding'
import MagazzinoConf from './screens/MagazzinoConf'
import MagazzinoMP from './screens/MagazzinoMP'
import Placeholder from './screens/Placeholder'
import Produzione from './screens/Produzione'
import ProdottoFinito from './screens/ProdottoFinito'
import Clienti from './screens/Clienti'
import Vendite from './screens/Vendite'
import Avvisi from './screens/Avvisi'
import Report from './screens/Report'
import Impostazioni from './screens/Impostazioni'
import { ProposteNavigazione } from './components/ProposteNavigazione'

function App(): React.JSX.Element {
  const [stato, setStato] = useState<'loading' | 'licenza' | 'password' | 'login' | 'onboarding' | 'app'>('loading')
  const [sezioneCorrente, setSezioneCorrente] = useState<Sezione>('dashboard')

  useEffect(() => {
    const bootstrap = async (): Promise<void> => {
      try {
        // 1. Verifica licenza
        const licenza = await window.api.licenza.stato()
        if (!licenza.valida) {
          setStato('licenza')
          return
        }

        // 2. Verifica login
        const login = await window.api.login.verifica('')
        if (login.ok) {
          setStato('app')
          return
        }

        if (login.errore === 'primo_avvio') {
          setStato('password')
          return
        }

        setStato('login')
      } catch {
        setStato('login')
      }
    }

    void bootstrap()
  }, [])

  const handleLoginSuccess = async (): Promise<void> => {
    try {
      const onboarding = await window.api.impostazioni.valoreDi('onboarding_completato')
      if (onboarding === '0') {
        setStato('onboarding')
      } else {
        setStato('app')
      }
    } catch {
      setStato('app')
    }
  }

  if (stato === 'loading') {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Caricamento...</div>
  }

  if (stato === 'licenza') {
    return <AttivazioneLicenza onLicenzaAttivata={() => setStato('password')} />
  }

  if (stato === 'password') {
    return <Login primoAvvio={true} onLoginSuccess={() => { void handleLoginSuccess() }} />
  }

  if (stato === 'login') {
    return <Login primoAvvio={false} onLoginSuccess={() => { void handleLoginSuccess() }} />
  }

  if (stato === 'onboarding') {
    return <Onboarding onOnboardingCompletato={() => setStato('app')} />
  }

  const sezioneTitoli: Record<Exclude<Sezione, 'dashboard'>, string> = {
    'magazzino-mp': 'Magazzino materie prime',
    'magazzino-conf': 'Magazzino confezionamento',
    produzione: 'Produzione',
    'prodotto-finito': 'Prodotto finito',
    clienti: 'Clienti',
    vendite: 'Vendite',
    report: 'Report',
    avvisi: 'Avvisi',
    impostazioni: 'Impostazioni'
  }

  return (
    <Layout sezioneCorrente={sezioneCorrente} onSezioneChange={setSezioneCorrente}>
      <ProposteNavigazione onNaviga={setSezioneCorrente} />
      {sezioneCorrente === 'dashboard' && <Dashboard onVaiAvvisi={() => setSezioneCorrente('avvisi')} />}
      {sezioneCorrente === 'magazzino-mp' && <MagazzinoMP />}
      {sezioneCorrente === 'magazzino-conf' && <MagazzinoConf />}
      {sezioneCorrente === 'produzione' && <Produzione />}
      {sezioneCorrente === 'prodotto-finito' && <ProdottoFinito />}
      {sezioneCorrente === 'clienti' && <Clienti />}
      {sezioneCorrente === 'vendite' && <Vendite />}
      {sezioneCorrente === 'avvisi' && <Avvisi />}
      {sezioneCorrente === 'report' && <Report />}
      {sezioneCorrente === 'impostazioni' && <Impostazioni />}
      {!['dashboard', 'magazzino-mp', 'magazzino-conf', 'produzione', 'prodotto-finito', 'clienti', 'vendite', 'avvisi', 'report', 'impostazioni'].includes(
        sezioneCorrente
      ) && (
        <Placeholder titolo={sezioneTitoli[sezioneCorrente as Exclude<Sezione, 'dashboard'>]} />
      )}
    </Layout>
  )
}

export default App
