import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [react(), nodePolyfills()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    force: true,
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      'react-router-dom',
      '@tanstack/react-query',
      'wagmi',
      'wagmi/chains',
      'wagmi/connectors',
      'viem',
      'viem/chains',
      'connectkit',
      'framer-motion',
      'lucide-react',
      'sonner',
      'clsx',
      'tailwind-merge',
      'recharts',
      'vite-plugin-node-polyfills/shims/buffer',
      'vite-plugin-node-polyfills/shims/global',
      'vite-plugin-node-polyfills/shims/process',
    ],
  },
  server: {
    allowedHosts: true,
    cors: true,
    // Same-origin paths to the Arc RPCs (production uses Vercel rewrites in vercel.json).
    proxy: {
      '/rpc-testnet': {
        target: 'https://rpc.testnet.arc.io',
        changeOrigin: true,
        rewrite: () => '/',
      },
      '/rpc': {
        target: 'https://rpc.mainnet.arc.io',
        changeOrigin: true,
        rewrite: () => '/',
      },
      '/dx': {
        target: 'https://cdn.dexscreener.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/dx\//, '/cms/images/') + '?width=64&height=64&quality=80&format=auto',
      },
    },
  },
})
