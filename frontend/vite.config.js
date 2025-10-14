import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
      '/catalog': {
        target: 'http://localhost:8000/api',
        changeOrigin: true,
        secure: false,
      },
      '/analytics': {
        target: 'http://localhost:8000/api',
        changeOrigin: true,
        secure: false,
      },
      '/users': {
        target: 'http://localhost:8000/api',
        changeOrigin: true,
        secure: false,
      },
      '/dashboard': {
        target: 'http://localhost:8000/api',
        changeOrigin: true,
        secure: false,
      },
      '/strategic-accession': {
        target: 'http://localhost:8000/api',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
