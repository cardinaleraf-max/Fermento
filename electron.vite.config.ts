import path from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const isDemo = process.env.DEMO_BUILD === '1'

export default defineConfig({
  main: {
    define: { __DEMO_MODE__: JSON.stringify(isDemo) }
  },
  preload: {
    define: { __DEMO_MODE__: JSON.stringify(isDemo) }
  },
  renderer: {
    define: { __DEMO_MODE__: JSON.stringify(isDemo) },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src/renderer/src'),
        '@renderer': path.resolve(__dirname, './src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
