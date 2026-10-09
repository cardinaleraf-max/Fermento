import type { ReactNode } from 'react'
import { AlertTriangle, Info, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

/** Classi condivise, allineate alle schermate esistenti di Fermento. */
export const cls = {
  select:
    'h-9 w-full rounded-md border border-input bg-input px-3 py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50',
  textarea:
    'min-h-[72px] w-full rounded-md border border-input bg-input px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
  tabellaWrap: 'overflow-x-auto rounded-lg border border-border bg-card',
  tabella: 'w-full text-sm',
  thead: 'border-b border-border bg-secondary/40 text-left text-xs uppercase tracking-wide text-muted-foreground',
  th: 'px-4 py-2 font-medium',
  td: 'px-4 py-2.5',
  riga: 'border-t border-border/50 text-foreground/80',
  rigaCliccabile: 'cursor-pointer border-t border-border/50 text-foreground/80 hover:bg-secondary/30',
  pannello: 'rounded-lg border border-border bg-card',
  dialogLungo: 'max-h-[90vh] overflow-y-auto'
}

export function ErroreBox({ messaggio }: { messaggio: string | null | undefined }): React.JSX.Element | null {
  if (!messaggio) return null
  return (
    <div className="rounded-md border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-400" role="alert">
      {messaggio}
    </div>
  )
}

export function AvvisoBox({
  tono = 'info',
  titolo,
  children
}: {
  tono?: 'info' | 'attenzione'
  titolo?: string
  children?: ReactNode
}): React.JSX.Element {
  const Icona = tono === 'attenzione' ? AlertTriangle : Info
  return (
    <div
      className={cn(
        'flex gap-3 rounded-md border p-3 text-sm',
        tono === 'attenzione'
          ? 'border-amber-500/30 bg-amber-500/10 text-amber-200'
          : 'border-sky-500/25 bg-sky-500/10 text-sky-200'
      )}
      role={tono === 'attenzione' ? 'alert' : undefined}
    >
      <Icona className={cn('mt-0.5 h-4 w-4 shrink-0', tono === 'attenzione' ? 'text-amber-400' : 'text-sky-400')} />
      <div className="min-w-0 space-y-1">
        {titolo && <p className="font-medium text-foreground">{titolo}</p>}
        {children && <div className="text-foreground/80">{children}</div>}
      </div>
    </div>
  )
}

export function StatoVuoto({
  icona: Icona,
  titolo,
  testo,
  azione
}: {
  icona: LucideIcon
  titolo: string
  testo?: string
  azione?: ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-card p-8 text-center">
      <div className="rounded-full bg-secondary p-3">
        <Icona className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground">{titolo}</p>
      {testo && <p className="max-w-md text-sm text-muted-foreground">{testo}</p>}
      {azione && <div className="mt-2">{azione}</div>}
    </div>
  )
}

export function Intestazione({
  titolo,
  sottotitolo,
  azioni
}: {
  titolo: string
  sottotitolo?: string
  azioni?: ReactNode
}): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-lg font-semibold text-foreground">{titolo}</h3>
        {sottotitolo && <p className="text-sm text-muted-foreground">{sottotitolo}</p>}
      </div>
      {azioni && <div className="flex flex-wrap items-center gap-2">{azioni}</div>}
    </div>
  )
}

export function CampoForm({
  etichetta,
  htmlFor,
  aiuto,
  obbligatorio,
  className,
  children
}: {
  etichetta: string
  htmlFor?: string
  aiuto?: ReactNode
  obbligatorio?: boolean
  className?: string
  children: ReactNode
}): React.JSX.Element {
  return (
    <div className={cn('grid content-start gap-1.5', className)}>
      <Label htmlFor={htmlFor}>
        {etichetta}
        {obbligatorio && <span className="ml-0.5 text-amber-400">*</span>}
      </Label>
      {children}
      {aiuto && <p className="text-xs text-muted-foreground">{aiuto}</p>}
    </div>
  )
}

/** Campo numerico che accetta la virgola decimale; mostra l'unità a destra. */
export function InputNumero({
  id,
  valore,
  onChange,
  unita,
  placeholder,
  disabled,
  className
}: {
  id?: string
  valore: string
  onChange: (v: string) => void
  unita?: string | null
  placeholder?: string
  disabled?: boolean
  className?: string
}): React.JSX.Element {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Input
        id={id}
        inputMode="decimal"
        value={valore}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 tabular-nums"
      />
      {unita ? <span className="shrink-0 text-sm text-muted-foreground">{unita}</span> : null}
    </div>
  )
}

/** Gruppo di pulsanti per una scelta tra poche opzioni (più chiaro di un menu a tendina). */
export function SceltaPulsanti<T extends string>({
  opzioni,
  valore,
  onChange,
  disabled
}: {
  opzioni: Array<{ valore: T; etichetta: string }>
  valore: T | null
  onChange: (v: T) => void
  disabled?: boolean
}): React.JSX.Element {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-md border border-border bg-secondary/50 p-1">
      {opzioni.map((o) => (
        <button
          key={o.valore}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o.valore)}
          className={cn(
            'rounded px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50',
            valore === o.valore
              ? 'bg-primary text-primary-foreground shadow'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          {o.etichetta}
        </button>
      ))}
    </div>
  )
}

/** Finestra di conferma per azioni che non si possono annullare. */
export function ConfermaDialog({
  aperto,
  titolo,
  testo,
  etichettaConferma = 'Conferma',
  pericoloso = false,
  inCorso = false,
  errore,
  onConferma,
  onChiudi
}: {
  aperto: boolean
  titolo: string
  testo: ReactNode
  etichettaConferma?: string
  pericoloso?: boolean
  inCorso?: boolean
  errore?: string | null
  onConferma: () => void
  onChiudi: () => void
}): React.JSX.Element {
  return (
    <Dialog open={aperto} onOpenChange={(o) => (!o ? onChiudi() : undefined)}>
      <DialogContent className="max-w-md" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{titolo}</DialogTitle>
          <DialogDescription asChild>
            <div className="text-sm text-muted-foreground">{testo}</div>
          </DialogDescription>
        </DialogHeader>
        <ErroreBox messaggio={errore} />
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onChiudi} disabled={inCorso}>
            Annulla
          </Button>
          <Button
            onClick={onConferma}
            disabled={inCorso}
            className={pericoloso ? 'bg-red-600 text-white hover:bg-red-600/90' : undefined}
          >
            {inCorso ? 'Attendi…' : etichettaConferma}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Coppia etichetta/valore per i riepiloghi. */
export function Valore({ etichetta, children }: { etichetta: string; children: ReactNode }): React.JSX.Element {
  return (
    <div className="min-w-0">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{etichetta}</div>
      <div className="mt-0.5 text-sm text-foreground">{children}</div>
    </div>
  )
}

export function BadgeTono({
  tono,
  children
}: {
  tono: 'ambra' | 'verde' | 'blu' | 'rosso' | 'grigio' | 'viola'
  children: ReactNode
}): React.JSX.Element {
  const toni: Record<typeof tono, string> = {
    ambra: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
    verde: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
    blu: 'border-sky-500/30 bg-sky-500/10 text-sky-400',
    rosso: 'border-red-500/30 bg-red-500/10 text-red-400',
    grigio: 'border-border bg-secondary text-muted-foreground',
    viola: 'border-violet-500/30 bg-violet-500/10 text-violet-300'
  }
  return (
    <span className={cn('inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium', toni[tono])}>
      {children}
    </span>
  )
}
