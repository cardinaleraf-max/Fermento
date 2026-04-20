import { Wrench } from 'lucide-react'

type PlaceholderProps = {
  titolo: string
}

export default function Placeholder({ titolo }: PlaceholderProps): React.JSX.Element {
  return (
    <div className="flex h-full min-h-[320px] items-center justify-center rounded-lg border border-dashed border-border bg-card p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="rounded-full bg-secondary p-3">
          <Wrench className="h-5 w-5 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">{titolo}</h3>
        <p className="text-sm text-muted-foreground">In costruzione</p>
      </div>
    </div>
  )
}
