import { defineConfig } from 'vite';

// GitHub Pages talpina projektą adresu https://kiprasb2b.github.io/Frankenstein/,
// todėl visi resursai turi būti kraunami iš /Frankenstein/ kelio.
export default defineConfig({
  base: '/Frankenstein/',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
});
