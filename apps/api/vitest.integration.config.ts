import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * Entegrasyon testleri.
 *
 * DEVELOPMENT_RULES 5.3: entegrasyon testleri GERCEK PostgreSQL'e karsi calisir
 * (Testcontainers). Mock bir veritabani RLS'i test etmez — ki Faz 2'den itibaren
 * test etmek istedigimiz tam olarak odur.
 *
 * Ayri bir config: birim testleri Docker'a bagimli olmamalidir. Karistirildiginda
 * "hizli testler" Docker acik degil diye kirmizi yanar ve kimse calistirmaz.
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/integration/**/*.spec.ts'],
    // Container indirme ve acilis suresi; ilk calistirmada imaj cekilebilir.
    testTimeout: 180_000,
    hookTimeout: 180_000,
    // Container'lar paylasimli kaynak: paralel dosya calistirmasi yarisa yol acar.
    fileParallelism: false,
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
