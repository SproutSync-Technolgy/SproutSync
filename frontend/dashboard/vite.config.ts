import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  envDir: '../../',
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        configure: (proxy: any) => {
          proxy.on('error', (_err: any, req: any, res: any) => {
            if (res && 'writeHead' in res && !res.headersSent) {
              const url: string = req?.url || '';
              if (url.includes('/api/v1/health')) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'offline', service: 'sproutsync-api-offline' }));
                return;
              }
              res.writeHead(503, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ detail: 'Backend API unreachable (FastAPI container offline)' }));
            }
          });
        },
      },
    },
  },
});
