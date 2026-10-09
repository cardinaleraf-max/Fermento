import { ShieldAlert } from 'lucide-react'

/** Avvertenza fissa del registro operazioni di campo (richiesta di progetto). */
export function BannerRegistro(): React.JSX.Element {
  return (
    <div className="flex items-start gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
      <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden />
      <p>
        Registro interno ai fini della tracciabilità aziendale. Non sostituisce il registro ufficiale dei
        trattamenti.
      </p>
    </div>
  )
}
