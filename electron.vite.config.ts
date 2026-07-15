import path from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: { build: { minify: 'esbuild' } },
  preload: { build: { minify: 'esbuild' } },
  renderer: {
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src/renderer/src'),
        '@renderer': path.resolve(__dirname, './src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
