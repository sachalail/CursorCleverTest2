import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      clientPort: 5174,
      timeout: 5000,
      overlay: false
    }
  },
  preview: {
    allowedHosts: [
      "app-12de9394-68fa-405f-8d68-8d6768e59718.cleverapps.io"
    ]
  }
})
