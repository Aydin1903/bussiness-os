import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Birim testleri.
 *
 * DEVELOPMENT_RULES 5.3: domain testleri MOCK'SUZ yazilir. Bu yuzden birim
 * testleri veritabani, Docker veya ag gerektirmez ve saniyeler icinde biter —
 * hizli geri bildirim testin yazilmasini saglayan tek seydir.
 *
 * SWC kullanildi: NestJS decorator'lari ve emitDecoratorMetadata icin gerekli,
 * esbuild bunlari desteklemiyor.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      /**
       * `*.port.ts` haric tutulur: port'lar yalnizca interface icerir ve
       * TypeScript bunlari derlemede siler. Calistirilabilir tek satir yoktur,
       * ama v8 sourcemap uzerinden dosyanin tamamini "kapsanmamis" isaretler.
       * Sonuc, gercek bir kapsam kaybi olmadigi halde dusen bir yuzde olurdu —
       * yani kapsam raporunu ise yaramaz hale getiren gurultu.
       */
      exclude: [
        'src/**/*.spec.ts',
        'src/**/*.module.ts',
        'src/**/*.port.ts',
        'src/main.ts',
      ],
    },
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
