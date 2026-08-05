import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { type AiCallRecord, type AiUsageRecorder } from '../../shared/ai-usage-recorder.port';
import { getTenantContext } from '../tenant/tenant-context';

/**
 * Log satirinin SABIT adi. Sorgulanabilirligin tamami buna dayanir:
 * `event = "ai.call"` filtresi tum AI harcamasini verir.
 *
 * DEGISTIRILMEMELIDIR — degisirse gecmis kayitlarla yeni kayitlar ayni sorguya
 * dusmez ve donem karsilastirmasi sessizce bozulur.
 */
const AI_CALL_EVENT = 'ai.call';

/**
 * `AiUsageRecorder`'in yapilandirilmis log implementasyonu (ROADMAP §8.1).
 *
 * ============================================================================
 * KAPSAM BILINCLI DAR: SATIR YAZAR, KARAR VERMEZ
 * ============================================================================
 * Gercek zamanli maliyet panosu, uyari/alarm, butce limiti ve harcamayi
 * DURDURAN bir mekanizma BU ISIN PARCASI DEGILDIR. Buradaki tek iddia sudur:
 * her saglayici cagrisi geriye donuk incelenebilir bir satir birakir.
 *
 * Butce zorlamasi zaten baska bir mekanizmadadir ve karistirilmamalidir:
 * oran siniri (ADR-0029 §5) istek SAYISINI baglar. O ADR'nin kendi kaydettigi
 * bilinen sinir — "mekanizma istek sayisini baglar, TOKEN harcamasini degil" —
 * bu satirlarla artik en azindan OLCULEBILIR hale geliyor; hala
 * ZORLANMIYOR.
 * ============================================================================
 *
 * ============================================================================
 * KIM/HANGI TENANT BILGISI CAGIRANDAN ISTENMEZ, CONTEXT'TEN OKUNUR
 * ============================================================================
 * `tenantId`/`userId`/`correlationId` ALS'teki tenant context'ten gelir
 * (MT §11). Adapter'lardan parametre olarak istenseydi, her adapter ve her
 * cagri yolu bunu elden ele tasimak zorunda kalirdi — ve MT §11.1'in dedigi
 * gibi, derin bir zincirde bir yerde unutulurdu.
 *
 * Ucu de `null` OLABILIR ve bu bir hata DEGILDIR: gunluk rapor gibi arka plan
 * isleri kendi context'ini kurar ama HTTP disi yollarda context hic kurulmamis
 * olabilir. `null` durust bir cevaptir; uydurulmus bir deger degil.
 * ============================================================================
 *
 * ⚠️ **BILINEN SINIR — `caller` atfi.** Bugun `caller`, adapter'i KURAN modul
 * tarafindan kurulus aninda veriliyor (adapter'lar modul basina saglaniyor).
 * ADR-0031 Slice 1 adapter'lari `infrastructure/ai/` altinda PAYLASILAN hale
 * getirdiginde bu yol calismaz: tek bir adapter ornegi hem Knowledge'a hem
 * CRM'e hizmet edecek. O gun atif ya istek baglamina tasinir ya da modul basina
 * ince bir sarmalayici saglanir. Bugun yanlis bir sey soylemiyor; yarin
 * soyleyebilir.
 */
@Injectable()
export class LoggingAiUsageRecorder implements AiUsageRecorder {
  constructor(private readonly logger: PinoLogger) {}

  record(call: AiCallRecord): void {
    const context = getTenantContext();

    try {
      this.logger.info(
        {
          event: AI_CALL_EVENT,
          ai: {
            operation: call.operation,
            provider: call.provider,
            model: call.model,
            caller: call.caller,
            outcome: call.outcome,
            durationMs: call.durationMs,
            promptTokens: call.usage.prompt,
            completionTokens: call.usage.completion,
            totalTokens: call.usage.total,
          },
          tenantId: context?.tenantId ?? null,
          userId: context?.userId ?? null,
          correlationId: context?.correlationId ?? null,
        },
        AI_CALL_EVENT,
      );
    } catch {
      // Kasitli olarak yutuluyor — bkz. port yorumu: kayit tutmak, kaydedilen
      // isin basarisini etkilememelidir. Burada tekrar loglamak, log'un
      // kendisinin bozuk oldugu bir durumda sonsuz donguye girebilirdi.
    }
  }
}
