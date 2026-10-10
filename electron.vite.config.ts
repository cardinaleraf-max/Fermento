import path from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

// Versione demo: DEMO_BUILD=1 (vedi script build:win:demo). Nella build normale
// __DEMO_MODE__ è false e il codice della demo viene eliminato dal pacchetto.
const demo = { __DEMO_MODE__: JSON.stringify(process.env.DEMO_BUILD === '1') }

export default defineConfig({
  main: { define: demo, build: { minify: 'esbuild' } },
  preload: { define: demo, build: { minify: 'esbuild' } },
  renderer: {
    define: demo,
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src/renderer/src'),
        '@renderer': path.resolve(__dirname, './src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
