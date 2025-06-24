// vite.config.js
import { defineConfig } from 'vite'
import react        from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,            // or whatever you’re running on
    proxy: {
      // proxy any request starting with /auth to localhost:8000
      '/auth': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
      // and requests for /catalog
      '/catalog': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
      // plus /upload, /weed, etc. as needed
      '/upload': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
      '/weed': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
