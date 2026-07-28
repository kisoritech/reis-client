import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiUrl = env.REIS_API_URL ?? 'http://localhost:3000/api/v1'

  return {
    build: { sourcemap: true },
    define: {
      'process.env.REIS_API_URL': JSON.stringify(apiUrl),
    },
  }
})
