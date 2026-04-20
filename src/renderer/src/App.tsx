import { useEffect, useState } from 'react'
import { Layout, type Sezione } from './components/Layout'
import Dashboard from './screens/Dashboard'
import Login from './screens/Login'
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

function App(): React.JSX.Element {
  const [stato, setStato] = useState<'loading' | 'login' | 'app'>('loading')
  const [primoAvvio, setPrimoAvvio] = useState(false)
  const [sezioneCorrente, setSezioneCorrente] = useState<Sezione>('dashboard')

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

  useEffect(() => {
    const bootstrap = async (): Promise<void> => {
      try {
        const risultato = await window.api.login.verifica('')
        if (risultato.ok) {
          setStato('app')
          return
        }

        setPrimoAvvio(risultato.errore === 'primo_avvio')
        setStato('login')
      } catch {
        setPrimoAvvio(false)
        setStato('login')
      }
    }

    void bootstrap()
  }, [])

  if (stato === 'loading') {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Caricamento...</div>
  }

  if (stato === 'login') {
    return <Login primoAvvio={primoAvvio} onLoginSuccess={() => setStato('app')} />
  }

  return (
    <Layout sezioneCorrente={sezioneCorrente} onSezioneChange={setSezioneCorrente}>
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
