'use client';

import { useCallback, useEffect, useState } from 'react';

import { errorMessage } from '@/lib/api/error-message';
import { countUnindexedInteractions, reindexInteractions } from '@/lib/api/crm';
import { FormError } from '@/components/ui/form-error';
import { PillButton } from './chrome';

/**
 * "N görüşmeniz aranabilir değil" uyarısı + onarım.
 *
 * `knowledge/reindex-banner.tsx`'in CRM ikizi ve aynı gerekçeyle var:
 * embedding çökerse görüşme kaydedilir ama parçasız kalır ve AI onu HİÇ
 * BULAMAZ. Kullanıcı görüşmeyi listede görür, sorusuna cevap alamaz ve
 * nedenini anlayamaz — sessiz bir doğruluk deliği.
 *
 * ============================================================================
 * İKİ FARK — İKİSİ DE BACKEND SÖZLEŞMESİNDEN
 * ============================================================================
 * 1. `POST /crm/reindex` yanıtında `remaining` YOKTUR (Knowledge'ta vardır).
 *    Bu yüzden kalan sayı TAHMİN EDİLMEZ, sayım ucu yeniden çağrılır. `count -
 *    repaired` aritmetiği yapmak, onarım sırasında eklenen yeni bir görüşmeyi
 *    gözden kaçırıp yanlış bir "bitti" iddiası üretirdi.
 *
 * 2. Onarım `interaction:create` ister; `viewer` bu izne sahip DEĞİLDİR.
 *    Uyarı yine gösterilir (bilmek onun da hakkı), düğme gösterilmez.
 * ============================================================================
 */
export function CrmReindexBanner({
  readOnly,
  onRepaired,
}: {
  readOnly: boolean;
  onRepaired: () => void;
}) {
  const [count, setCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    void countUnindexedInteractions()
      .then((result) => {
        setCount(result.count);
      })
      .catch(() => {
        // Sayım başarısızsa banner gösterilmez; sorun varsa bir sonraki
        // açılışta yine sorulur.
        setCount(0);
      });
  }, []);

  useEffect(refresh, [refresh]);

  async function repair(): Promise<void> {
    setError(null);
    setLoading(true);
    try {
      const result = await reindexInteractions();

      if (result.repaired > 0) {
        onRepaired();
      }

      // Kalan sayı SUNUCUDAN yeniden sorulur (yukarıdaki 1. fark).
      refresh();
    } catch (caught) {
      // 429 dahil: onarım görüşme oluşturmayla aynı oran sınırı kovasını
      // paylaşır ve sunucunun mesajı aynen gösterilir.
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  if (count === 0 && error === null) {
    return null;
  }

  return (
    <section className="mb-5 rounded-card border border-danger/30 bg-danger/5 p-5">
      <FormError message={error} />

      {count > 0 ? (
        <div className="flex flex-col items-start gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-[13.5px] font-semibold tracking-[-0.008em] text-fg">
              {count} görüşmeyi yapay zekâ okuyamıyor
            </h2>
            <p className="max-w-[52ch] text-[12.5px] leading-[1.6] text-fg-2">
              Bu görüşmeler kaydedildi ama yapay zekâ henüz okuyamadı; sorularınızı cevaplarken
              bunları kullanamaz.
              {readOnly
                ? ' Bunu ekibinizden bir yönetici veya üye düzeltebilir.'
                : ' Birkaç saniye sürebilir.'}
            </p>
          </div>

          {readOnly ? null : (
            <PillButton
              disabled={loading}
              onClick={() => {
                void repair();
              }}
            >
              {loading ? 'Hazırlanıyor…' : 'Okunur hale getir'}
            </PillButton>
          )}
        </div>
      ) : null}
    </section>
  );
}
