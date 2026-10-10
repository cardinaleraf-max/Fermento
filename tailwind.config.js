/* eslint-disable @typescript-eslint/no-require-imports -- file di configurazione CommonJS */
const colors = require('tailwindcss/colors')
const plugin = require('tailwindcss/plugin')

// Tema chiaro (classe "tema-chiaro" su <html>). Il tema scuro resta quello di sempre:
// ogni variabile qui sotto, nel tema scuro, vale esattamente il colore di prima.

// Le tinte chiare usate per i TESTI colorati (es. text-amber-400) su fondo bianco non si
// leggono: nel tema chiaro diventano la tinta scura corrispondente. Sfondi e bordi colorati
// (es. bg-red-500/10) restano uguali, perché funzionano già su entrambi i fondi.
const TINTE = [
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose'
]
const TONO_TESTO_CHIARO = { 50: 950, 100: 900, 200: 800, 300: 800, 400: 700 }

const terna = (hex) => {
  const n = parseInt(hex.slice(1), 16)
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
}

const testiColorati = Object.fromEntries(
  TINTE.map((tinta) => [
    tinta,
    Object.fromEntries(
      Object.keys(TONO_TESTO_CHIARO).map((tono) => [
        tono,
        `rgb(var(--tx-${tinta}-${tono}) / <alpha-value>)`
      ])
    )
  ])
)

const variabiliTesti = plugin(({ addBase }) => {
  const scuro = {}
  const chiaro = {}
  for (const tinta of TINTE) {
    for (const [tono, tonoChiaro] of Object.entries(TONO_TESTO_CHIARO)) {
      scuro[`--tx-${tinta}-${tono}`] = terna(colors[tinta][tono])
      chiaro[`--tx-${tinta}-${tono}`] = terna(colors[tinta][tonoChiaro])
    }
  }
  addBase({ ':root': scuro, ':root.tema-chiaro': chiaro })
})

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: ['./src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // "ink" = il colore del testo in trasparenza: bianco nel tema scuro, quasi nero nel chiaro.
        // Su fondo chiaro le trasparenze basse sparirebbero: sfondi e bordi vengono rinforzati
        // da un moltiplicatore (1 nel tema scuro, quindi identici a prima).
        ink: 'rgb(var(--ink) / calc(var(--ink-k-fondo) * <alpha-value>))',
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        // fondo dei campi "pieni" (tendine e aree di testo): nel tema scuro uguale a input, nel chiaro bianco
        campo: 'hsl(var(--campo))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        }
      },
      textColor: {
        ...testiColorati,
        // Testo in trasparenza: nel tema chiaro le opacità vengono alzate (0,25 → ~0,5) per restare leggibili.
        ink: 'rgb(var(--ink) / calc(var(--ink-a0-testo) + var(--ink-k-testo) * <alpha-value>))'
      },
      borderColor: {
        ink: 'rgb(var(--ink) / calc(var(--ink-k-bordo) * <alpha-value>))'
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)'
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' }
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' }
        }
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out'
      }
    },
  },
  plugins: [require('tailwindcss-animate'), variabiliTesti],
}
