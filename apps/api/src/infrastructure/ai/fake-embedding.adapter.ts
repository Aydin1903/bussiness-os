import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { EMBEDDING_DIMENSIONS, type EmbeddingPort } from '../../shared/embedding.port';

/**
 * `EmbeddingPort`'un dev/CI implementasyonu — ag cagrisi YAPMAZ.
 *
 * ============================================================================
 * NEDEN VAR
 * ============================================================================
 * `ConsoleEmailAdapter` ile ayni gerekce: her gelistirici makinesinde ve CI'da
 * OpenAI anahtari BULUNMAZ, ve her `pnpm test` kosusunun para harcamasi kabul
 * edilemez. Bu adapter olmasaydi ya anahtar zorunlu olurdu ya da testler ag'a
 * cikardi — ikisi de yanlis.
 *
 * ⚠️ URETIMDE SECILMESI env semasinda REDDEDILIR ve surec BASLAMAZ. Sahte
 * embedding bir sir sizdirmaz ama urunu SESSIZCE islevsiz kilar: arama
 * calisiyor gorunur, sonuclari anlamsizdir. Sessizce yanlis calismak,
 * acilista patlamaktan kotudur.
 * ============================================================================
 *
 * ============================================================================
 * DETERMINISTIK — rastgele DEGIL
 * ============================================================================
 * Ayni metin daima ayni vektoru uretir (SHA-256 tohumlu). Rastgele olsaydi
 * testler her kosuda farkli sonuc verir ve "en yakin chunk" iddialari
 * dogrulanamazdi. Ayrica benzer metinler benzer vektor uretmez — bu adapter
 * ANLAM tasimaz, yalnizca BICIM tasir.
 * ============================================================================
 */
@Injectable()
export class FakeEmbeddingAdapter implements EmbeddingPort {
  embed(text: string): Promise<number[]> {
    const digest = createHash('sha256').update(text, 'utf8').digest();

    // Hash'i 1536 boyuta yayar; degerler [-1, 1] araliginda tutulur ki gercek
    // bir embedding'in profiline benzesin (kosinus mesafesi anlamli calissin).
    const vector = Array.from({ length: EMBEDDING_DIMENSIONS }, (_, index) => {
      const byte = digest[index % digest.length] ?? 0;
      return (byte / 255) * 2 - 1;
    });

    return Promise.resolve(vector);
  }
}
