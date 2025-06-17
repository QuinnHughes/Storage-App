// storage_app/frontend/vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // proxy any request starting with /catalog → http://localhost:8000
      '/catalog': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      // proxy uploads too
      '/upload': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    }
  }
})
