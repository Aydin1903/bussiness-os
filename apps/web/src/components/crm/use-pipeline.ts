'use client';

import {
  OPPORTUNITY_STAGE_ORDER,
  type OpportunityListRow,
  type OpportunityStage,
} from '@business-os/contracts';
import { useCallback, useEffect, useState } from 'react';

import { listOpportunities } from '@/lib/api/crm';
import { pipelineVisiblePerStage } from '@/lib/config/crm';

/**
 * Sütun başına çekilen fırsat sayısı = GÖSTERİLEN sayı.
 *
 * Fazlasını çekip istemcide kesmek boşuna veri taşımak olurdu; `total` zaten
 * zarfın içinde geliyor, yani "kaç tane daha var" sorusu çekilen satır
 * sayısından bağımsız cevaplanıyor.
 */
function columnSize(): number {
  return pipelineVisiblePerStage();
}

export interface StageColumn {
  readonly stage: OpportunityStage;
  readonly items: readonly OpportunityListRow[];
  /** Sunucudaki TOPLAM — gösterilen kadar değil. */
  readonly total: number;
  /** Bu sütun çekilemedi. "0 fırsat" ile AYNI ŞEY DEĞİL. */
  readonly failed: boolean;
}

function emptyColumns(): StageColumn[] {
  return OPPORTUNITY_STAGE_ORDER.map((stage) => ({
    stage,
    items: [],
    total: 0,
    failed: false,
  }));
}

/**
 * Hattın verisi — SÜTUN BAŞINA BİR İSTEK.
 *
 * ============================================================================
 * NEDEN TEK ÇAĞRI + İSTEMCİDE GRUPLAMA DEĞİL
 * ============================================================================
 * Akla ilk gelen `GET /crm/opportunities?limit=100` çekip `stage`'e göre
 * gruplamaktır. İki şeyi birden bozar:
 *
 * 1. SESSİZ KIRPMA — 100 fırsatı aşan tenant'ta bazı sütunlar keyfî biçimde
 *    eksik kalır. Hangi sütunun eksildiği sıralamaya bağlıdır, yani ekran
 *    tenant büyüdükçe sessizce yalan söylemeye başlar.
 * 2. SAYAÇLAR YALAN SÖYLER — sütun başlığındaki sayı ancak "getirebildiğim
 *    kadarı" olur; oysa kullanıcı onu "hattımda bu aşamada kaç anlaşma var"
 *    diye okur.
 *
 * Beş ayrı istek her sütuna KENDİ `total`'ını verir; sayaç sunucudan gelir,
 * istemcide sayılmaz.
 *
 * `allSettled`: bir sütun düşerse diğer dördü çizilir ve düşen sütun bunu
 * SÖYLER (Panel'in `PartialLoadNotice` gerekçesiyle aynı).
 */
export function usePipeline() {
  const [columns, setColumns] = useState<readonly StageColumn[]>(emptyColumns);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);

    void Promise.allSettled(
      OPPORTUNITY_STAGE_ORDER.map((stage) =>
        // `order: 'priority'` — önce gecikmiş takipler, sonra en son
        // güncellenen. Sıralama SUNUCUDA: istemcide kesmek, çekilen sayfanın
        // dışında kalan gecikmiş bir fırsatı görünmez kılardı.
        listOpportunities({ limit: columnSize(), offset: 0, stage, order: 'priority' }),
      ),
    )
      .then((results) => {
        if (!active) {
          return;
        }

        setColumns(
          OPPORTUNITY_STAGE_ORDER.map((stage, index) => {
            const result = results[index];

            if (result === undefined || result.status === 'rejected') {
              // eslint-disable-next-line no-console
              console.warn(`[Pipeline] "${stage}" sütunu yüklenemedi.`, result?.reason);
              return { stage, items: [], total: 0, failed: true };
            }

            return {
              stage,
              items: result.value.items,
              total: result.value.total,
              failed: false,
            };
          }),
        );
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [reloadToken]);

  const reload = useCallback(() => {
    setReloadToken((previous) => previous + 1);
  }, []);

  return { columns, loading, reload };
}
