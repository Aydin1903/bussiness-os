import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { getTenantContext } from '../../../infrastructure/tenant/tenant-context';
import {
  type RetrievalSelectionRecord,
  type RetrievalSelectionRecorder,
} from '../application/retrieval-selection-recorder.port';

/**
 * Log satirinin SABIT adi. Sorgulanabilirligin tamami buna dayanir:
 * `event = "retrieval.select"` filtresi tum secim kararlarini verir.
 *
 * ⚠️ DEGISTIRILMEMELIDIR — `ai.call`in ayni gerekcesi: degisirse gecmis
 * kayitlarla yeni kayitlar ayni sorguya dusmez ve donem karsilastirmasi
 * sessizce bozulur. ⚠️ Rerank acildiginda satirin ALANLARI degisir ama BU AD
 * DEGISMEZ (ADR-0046 § Bu karar ne zaman yeniden gozden gecirilir).
 */
const RETRIEVAL_SELECT_EVENT = 'retrieval.select';

/**
 * `RetrievalSelectionRecorder`in yapilandirilmis log implementasyonu
 * (ADR-0046).
 *
 * ============================================================================
 * KAPSAM BILINCLI DAR: SATIR YAZAR, KARAR VERMEZ
 * ============================================================================
 * `LoggingAiUsageRecorder`in birebir ayni disiplini. Pano, alarm, toplama ve
 * sorgu kutuphanesi BU ISIN PARCASI DEGILDIR. Tek iddia sudur: her `/ask`
 * cagrisi, secimin nasil olustugunu geriye donuk okunabilir kilan bir satir
 * birakir.
 *
 * ⚠️ Ve bu satir HICBIR KARARI VERMEZ: ne tabani degistirir, ne rerank acar,
 * ne askidaki bir katkiciyi onaylar. ADR-0046'nin cumlesi: _"aletin varligi,
 * olculen seyin degismesi gerektigi anlamina gelmez."_
 *
 * ============================================================================
 * ⚠️ TABLO DEGIL LOG — VE BU, `ai.call` ILE AYNI SINIFTA OLMASINDANDIR
 * ============================================================================
 * Ayri bir `platform.retrieval_selections` tablosu ADR-0046 §2'de
 * degerlendirildi ve UC gerekceyle reddedildi:
 *
 *   1. Retention listesine YIRMI DORDUNCU ve EN HIZLI BUYUYEN kalemi eklerdi
 *      (her `/ask` × her katkici). O unvan bugun `platform.audit_log`ta ve
 *      ROADMAP §8.5 onu "karari en zor olan kalem" diye isaretliyor.
 *   2. Cevap yoluna bir transaction sokardi — `AskUseCase` iki ag cagrisini da
 *      BILEREK transaction disinda tutuyor.
 *   3. Verinin tabiati TESHISTIR, urun degil: hicbir ekran okumaz.
 *
 * ⚠️ Dogrudan sonucu: bu kalem ROADMAP §8.5'e GIRMEZ (o liste TABLOLARI
 * sayar). Log satirlarinin saklama suresi platformun log altyapisinin
 * sorunudur ve HENUZ KARARA BAGLANMAMISTIR.
 *
 * ============================================================================
 * KIM/HANGI TENANT BILGISI CAGIRANDAN ISTENMEZ, CONTEXT'TEN OKUNUR
 * ============================================================================
 * `LoggingAiUsageRecorder` ile ayni karar (MT §11): `tenantId`/`userId`/
 * `correlationId` ALS'teki tenant context'ten gelir. Parametre olarak
 * istenseydi her cagri yolu bunu elden ele tasimak zorunda kalirdi ve derin
 * bir zincirde bir yerde unutulurdu.
 *
 * Ucu de `null` OLABILIR ve bu bir hata DEGILDIR.
 *
 * ============================================================================
 * ⚠️ ICERIK TASINMAZ — BU DOSYA O KURALIN SON DURAGIDIR
 * ============================================================================
 * `record` yalnizca port'un verdigi SAYILARI ve KAYNAK ADLARINI yazar. Soru
 * metni, parca icerigi ve `reference.id` bu dosyaya HIC ULASMAZ — cunku
 * `RetrievalSelectionRecord` onlari TASIMAZ. Kural tipte zorlanir, dikkate
 * birakilmaz.
 */
@Injectable()
export class LoggingRetrievalSelectionRecorder implements RetrievalSelectionRecorder {
  constructor(private readonly logger: PinoLogger) {}

  record(selection: RetrievalSelectionRecord): void {
    const context = getTenantContext();

    try {
      this.logger.info(
        {
          event: RETRIEVAL_SELECT_EVENT,
          retrieval: {
            limit: selection.limit,
            structuralFloor: selection.structuralFloor,
            selectedCount: selection.selectedCount,
            candidateCount: selection.candidateCount,
            // ⚠️ Dizi OLDUGU GIBI yazilir: `sources` zaten yalnizca sayilar ve
            // sabit etiketler tasir (port'un tipi bunu garanti eder).
            sources: selection.sources,
          },
          tenantId: context?.tenantId ?? null,
          userId: context?.userId ?? null,
          correlationId: context?.correlationId ?? null,
        },
        RETRIEVAL_SELECT_EVENT,
      );
    } catch {
      // Kasitli olarak yutuluyor — bkz. port yorumu: kayit tutmak, kaydedilen
      // isin basarisini etkilememelidir. Burada tekrar loglamak, log'un
      // kendisinin bozuk oldugu bir durumda sonsuz donguye girebilirdi.
    }
  }
}
