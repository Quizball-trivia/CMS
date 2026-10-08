import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  // The Table Derby workspace is Georgian wherever it is deployed; the tests read its English source text.
  test: { environment: 'jsdom', restoreMocks: true, env: { NEXT_PUBLIC_TD_LANG: 'en' } },
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
});
