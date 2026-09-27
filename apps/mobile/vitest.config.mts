import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Testes cobrem apenas o núcleo de domínio (core/), que não depende de React Native.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    include: ['core/**/*.test.ts'],
    environment: 'node',
  },
});
