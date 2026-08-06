import { Logger } from '@nestjs/common';

import { type AppConfig } from '../config/app.config';
import { type AiUsageRecorder } from '../../shared/ai-usage-recorder.port';
import { type EmbeddingPort } from '../../shared/embedding.port';
import { type LLMPort } from '../../shared/llm.port';
import { DeepSeekLlmAdapter } from './deepseek-llm.adapter';
import { FakeEmbeddingAdapter } from './fake-embedding.adapter';
import { FakeLlmAdapter } from './fake-llm.adapter';
import { OpenAiEmbeddingAdapter } from './openai-embedding.adapter';

/**
 * AI saglayici secimini TEK YERDE toplar.
 *
 * ============================================================================
 * NEDEN SIMDI YAZILDI — Slice 1'de BILEREK yazilmamisti
 * ============================================================================
 * Slice 1'in notu suydu: "ortak bir fabrika BUGUN yazilmadi — tek tuketici
 * varken soyutlama erken olurdu." Slice 3 o kosulu degistirdi: artik IKI
 * tuketici var (Knowledge'in yazma yolu, Context'in soru yolu) ve fabrika
 * olmasaydi saglayici secimi, `fake` uyarilari ve anahtar okuma IKI YERDE
 * kopyalanirdi.
 *
 * ============================================================================
 * `caller` HALA KURUCU PARAMETRESI
 * ============================================================================
 * Fabrika adapter'i PAYLASILAN bir ornege cevirmez: her cagiran kendi
 * ornegini kendi etiketiyle alir. Adapter'lar durumsuz `fetch`
 * sarmalayicilaridir; ikinci ornek pratikte bedava. Atif derleme zamaninda
 * zorunlu kalir (ADR-0031 Slice 1 karari).
 * ============================================================================
 */
export function createEmbeddingPort(
  config: AppConfig,
  recorder: AiUsageRecorder,
  caller: string,
): EmbeddingPort {
  if (config.embedding.provider === 'openai') {
    return new OpenAiEmbeddingAdapter({
      apiKey: config.embedding.openAiApiKey,
      model: config.embedding.model,
      recorder,
      caller,
    });
  }

  // Uretimde bu dala HIC girilmez: env semasi `fake`'i orada reddeder ve surec
  // baslamaz. Uyari dev/CI icindir — sahte embedding ile calistigini unutan
  // gelistirici, "arama neden sacmaliyor" sorusunun cevabini burada bulur.
  new Logger('AiProviderFactory').warn(
    'EMBEDDING_PROVIDER=fake — embedding ler SAHTE, anlamsal arama calismaz.',
  );
  return new FakeEmbeddingAdapter();
}

export function createLlmPort(
  config: AppConfig,
  recorder: AiUsageRecorder,
  caller: string,
): LLMPort {
  // Embedding'den AYRI cozulur: iki port GERCEKTEN iki farkli saglayiciya
  // gidiyor (DeepSeek chat, OpenAI embedding) — ADR-0029 §3'un bolunme
  // gerekcesinin somut karsiligi.
  if (config.llm.provider === 'deepseek') {
    return new DeepSeekLlmAdapter({
      apiKey: config.llm.deepSeekApiKey,
      model: config.llm.model,
      recorder,
      caller,
    });
  }

  new Logger('AiProviderFactory').warn(
    'LLM_PROVIDER=fake — cevaplar SAHTE, soru-cevap anlamli calismaz.',
  );
  return new FakeLlmAdapter();
}
