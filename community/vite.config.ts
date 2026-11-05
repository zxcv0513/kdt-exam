import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API_SERVER = `http://localhost:${process.env.PORT ?? 3001}`;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: true,
    proxy: {
      '/api': API_SERVER,
      '/uploads': API_SERVER,
    },
  },
});
