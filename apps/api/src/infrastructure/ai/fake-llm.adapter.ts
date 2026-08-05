import { Injectable } from '@nestjs/common';

import { type CompleteInput, type LLMPort } from '../../shared/llm.port';

/**
 * `LLMPort`'un dev/CI implementasyonu — ag cagrisi YAPMAZ.
 *
 * ============================================================================
 * NEDEN VAR
 * ============================================================================
 * `FakeEmbeddingAdapter` ile ayni gerekce: her gelistirici makinesinde ve CI'da
 * DeepSeek anahtari BULUNMAZ ve her `pnpm test` kosusunun para harcamasi kabul
 * edilemez.
 *
 * ⚠️ URETIMDE SECILMESI env semasinda REDDEDILIR ve surec BASLAMAZ. Sahte
 * cevap bir sir sizdirmaz ama soru-cevap ozelligini SESSIZCE islevsiz kilar —
 * her soru "[sahte cevap] ..." doner ve hicbir hata uretilmez.
 * ============================================================================
 *
 * ============================================================================
 * SISTEM PROMPTUNUN 2. KURALINI TAKLIT EDER
 * ============================================================================
 * Baglam BOSSA yonlendirici metni doner, doluysa baglamdan alintilar. Boylece
 * entegrasyon disindaki testler "bos baglam -> yonlendirme" davranisini gercek
 * bir saglayici olmadan da dogrulayabilir. Anlam URETMEZ — yalnizca BICIM
 * uretir; gercek kalite iddialari gercek API testine aittir.
 * ============================================================================
 */
@Injectable()
export class FakeLlmAdapter implements LLMPort {
  complete(input: CompleteInput): Promise<string> {
    if (input.context.length === 0) {
      return Promise.resolve(
        'Bu konuda henuz bir notunuz yok. Eklerseniz bir dahaki sefere bu soruyu cevaplayabilirim.',
      );
    }

    // Ilk parcanin basi + soru: deterministik ve testte taninabilir.
    const excerpt = input.context[0]?.slice(0, 120) ?? '';
    return Promise.resolve(`[sahte cevap] "${input.userMessage}" icin baglam: ${excerpt}`);
  }
}
