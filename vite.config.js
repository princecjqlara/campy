import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true,
    // Handle SPA routing - fallback to index.html for all routes
    historyApiFallback: true
  },
  // For production builds, ensure proper base path
  base: '/'
});
