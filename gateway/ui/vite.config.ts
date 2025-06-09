import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000, // Port for Vite dev server
    proxy: {
      '/v1': { // Proxy requests from /v1 (UI) to Gateway backend
        target: 'http://localhost:8080', // Assuming gateway runs on 8080 locally
        changeOrigin: true,
      },
    },
  },
})
