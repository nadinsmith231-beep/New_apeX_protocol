import { defineConfig } from 'vite';

export default defineConfig({
  // Set the base URL to '/' if deployed to the root
  base: '/',
  build: {
    // Output directory (Vercel will serve this)
    outDir: 'dist',
    // Copy static assets like index.html, style.css
    rollupOptions: {
      input: {
        main: 'index.html'
      }
    }
  },
  // Ensure assets are handled correctly
  publicDir: 'public' // if you have a public folder
});
