import { useEffect, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { BiraChat } from './BiraChat'
import { cn } from '@/lib/utils'

export function BiraLauncher(): React.JSX.Element {
  const [aperto, setAperto] = useState(false)
  const [aiAbilitata, setAiAbilitata] = useState<boolean | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const h = await window.api.ai.health()
        setAiAbilitata(h.abilitato)
      } catch {
        setAiAbilitata(true)
      }
    })()
  }, [])

  useEffect(() => {
    if (!aperto) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setAperto(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [aperto])

  if (aiAbilitata === false) return <></>

  return (
    <>
      <div className="p-2.5" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <button
          type="button"
          onClick={() => setAperto((v) => !v)}
          className={cn(
            'group relative flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left transition-all',
            aperto
              ? 'text-amber-300'
              : 'text-white/60 hover:bg-white/[0.04] hover:text-amber-200'
          )}
          style={
            aperto
              ? {
                  background:
                    'linear-gradient(135deg, rgba(232,160,32,0.16) 0%, rgba(232,160,32,0.06) 100%)',
                  border: '1px solid rgba(232,160,32,0.28)'
                }
              : {
                  background:
                    'linear-gradient(135deg, rgba(232,160,32,0.08) 0%, rgba(232,160,32,0.02) 100%)',
                  border: '1px solid rgba(232,160,32,0.14)'
                }
          }
          title={aperto ? 'Chiudi Bira' : 'Apri Bira (assistente AI)'}
        >
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-all"
            style={{
              background:
                'radial-gradient(circle at 30% 30%, rgba(232,160,32,0.55), rgba(232,160,32,0.15) 70%)',
              boxShadow: aperto
                ? '0 0 12px rgba(232,160,32,0.35)'
                : '0 0 0 rgba(232,160,32,0)'
            }}
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-100" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-semibold">Bira</div>
            <div className="truncate text-[10px] text-white/40">Assistente AI</div>
          </div>
          <div
            className={cn(
              'h-1.5 w-1.5 shrink-0 rounded-full transition-all',
              aperto ? 'bg-amber-300' : 'bg-amber-400/50 group-hover:bg-amber-300'
            )}
          />
        </button>
      </div>

      {aperto && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setAperto(false)}
            aria-hidden
          />
          <div
            className="fixed bottom-4 left-4 z-50 flex flex-col rounded-xl shadow-2xl"
            style={{
              width: 'min(420px, calc(100vw - 2rem))',
              height: 'min(640px, calc(100vh - 2rem))',
              background: '#0C0C14',
              border: '1px solid rgba(232,160,32,0.2)',
              boxShadow:
                '0 24px 60px -12px rgba(0,0,0,0.7), 0 0 0 1px rgba(232,160,32,0.08)',
              animation: 'biraChatIn 0.18s ease-out'
            }}
            role="dialog"
            aria-label="Assistente AI Bira"
          >
            <div className="flex-1 overflow-hidden rounded-xl">
              <BiraChat onClose={() => setAperto(false)} />
            </div>
          </div>
          <style>{`
            @keyframes biraChatIn {
              from { opacity: 0; transform: translateY(12px) scale(0.98); }
              to   { opacity: 1; transform: translateY(0) scale(1); }
            }
          `}</style>
        </>
      )}
    </>
  )
}
