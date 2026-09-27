import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Testes cobrem o núcleo de domínio (core/) e os repositórios SQLite (database/),
// que não dependem de React Native.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    include: ['core/**/*.test.ts', 'database/**/*.test.ts'],
    environment: 'node',
  },
});
