import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { EVENTO_MODULO_AGRICOLO, type StatoModuloAgricolo } from '@/lib/agricolo'

type ContestoAgricolo = StatoModuloAgricolo & { pronto: boolean; ricarica: () => Promise<void> }

const iniziale: ContestoAgricolo = {
  attivo: false,
  stagione_corrente: '',
  stagioni: [],
  pronto: false,
  ricarica: async () => {}
}

const Contesto = createContext<ContestoAgricolo>(iniziale)

/** Stato del modulo agricolo (attivo, stagione corrente, stagioni) condiviso da tutta l'app. */
export function AgricoloProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [stato, setStato] = useState<StatoModuloAgricolo & { pronto: boolean }>({
    attivo: false,
    stagione_corrente: '',
    stagioni: [],
    pronto: false
  })

  const ricarica = useCallback(async () => {
    try {
      const s = await window.api.agri.stato()
      setStato({ ...s, pronto: true })
    } catch {
      // se il modulo non risponde l'app resta com'era: modulo considerato spento
      setStato({ attivo: false, stagione_corrente: '', stagioni: [], pronto: true })
    }
  }, [])

  useEffect(() => {
    void ricarica()
    const handler = (): void => void ricarica()
    window.addEventListener(EVENTO_MODULO_AGRICOLO, handler)
    return () => window.removeEventListener(EVENTO_MODULO_AGRICOLO, handler)
  }, [ricarica])

  return <Contesto.Provider value={{ ...stato, ricarica }}>{children}</Contesto.Provider>
}

export function useAgricolo(): ContestoAgricolo {
  return useContext(Contesto)
}
