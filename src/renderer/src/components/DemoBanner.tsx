export function DemoBanner(): React.JSX.Element {
  return (
    <div
      className="flex items-center justify-center px-3 py-1.5 text-[11px] font-medium text-amber-950"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
        background: 'linear-gradient(90deg, #d97706 0%, #b45309 100%)'
      }}
    >
      VERSIONE DEMO — i dati si azzerano alla chiusura &nbsp;·&nbsp; Vai su fermento-software.it per la versione completa
    </div>
  )
}
