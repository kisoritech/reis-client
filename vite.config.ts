import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiUrl =
    env.VITE_API_BASE_URL ??
    env.VITE_REIS_API_URL ??
    env.REIS_API_URL ??
    'http://localhost:3000/api/v1'

  return {
    plugins: [react()],
    base: './',
    server: {
      proxy: {
        '/api/v1': {
          target: new URL(apiUrl).origin,
          changeOrigin: true,
          secure: true,
        },
      },
    },
  }
})
