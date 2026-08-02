import { resolve } from 'node:path';

import { defineConfig } from 'vitest/config';

/**
 * Web birim testleri.
 *
 * En incelikli/riskli mantığı hedefler (session bootstrap, token yenileme
 * single-flight, tenant değiştirme retry) — bunlar "sessiz regresyon" riski en
 * yüksek olanlardır (FRONTEND_ARCHITECTURE §3.4/§5.3/§5.5).
 *
 * `jsdom`: `document.cookie` (hint/last-tenant çerezleri) ve React (RTL) için.
 * `fetch` her testte MOCK'lanır — gerçek ağ yok.
 *
 * `esbuild.jsx: 'automatic'`: .tsx testleri React'i scope'a almadan render eder
 * (react/jsx-runtime). Next tsconfig `jsx: preserve`'dir; test transform'u onu
 * kullanmaz, bu yüzden burada açıkça set edilir.
 */
export default defineConfig({
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    environmentOptions: { jsdom: { url: 'http://localhost:3000' } },
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.spec.{ts,tsx}'],
  },
});
