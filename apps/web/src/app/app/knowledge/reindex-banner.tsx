'use client';

import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/form-error';
import { errorMessage } from '@/lib/api/error-message';
import { countUnindexedNotes, reindexNotes } from '@/lib/api/knowledge';

/**
 * "N notunuz aranabilir değil" uyarısı + onarım (ADR-0029 bilinen sınır).
 *
 * ============================================================================
 * NEDEN GÖRÜNÜR OLMAK ZORUNDA
 * ============================================================================
 * Embedding çökerse not kaydedilir ama chunk'sız kalır ve AI onu HİÇ BULAMAZ.
 * Kullanıcı notunu listede görür, sorusuna cevap alamaz ve nedenini ANLAYAMAZ —
 * sessiz bir doğruluk deliği, görünür bir hatadan çok daha kötüdür.
 *
 * İki uç yazıp arayüzde iz bırakmamak, Faz 4'ün başına gelen "backend var,
 * ekran yok" hatasının küçük ölçekte tekrarı olurdu.
 *
 * ============================================================================
 * SORUN YOKKEN HİÇBİR ŞEY ÇİZİLMEZ
 * ============================================================================
 * `count === 0` olağan durumdur ve olağan durumda uyarı göstermek, uyarıyı
 * değersizleştirir. Sayım başarısız olursa da sessiz kalınır: kullanıcının
 * ilgilenmesi gereken bir şey değil ve panelin kalanı çalışıyor.
 * ============================================================================
 */
export function ReindexBanner({ onRepaired }: { onRepaired: () => void }) {
  const [count, setCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(() => {
    void countUnindexedNotes()
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
      const result = await reindexNotes();
      // `remaining` sunucudan gelir: tek çağrı batch kadar onarır, kalanı
      // istemci TAHMİN ETMEZ.
      setCount(result.remaining);

      if (result.repaired > 0) {
        // Onarılan notlar artık aranabilir; liste de tazelensin.
        onRepaired();
      }
    } catch (caught) {
      // 429 dahil: onarım not oluşturmayla aynı kovayı kullanır ve sunucunun
      // mesajı aynen gösterilir.
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  if (count === 0 && error === null) {
    return null;
  }

  return (
    <section className="rounded-card border border-danger/30 bg-danger/5 p-5">
      <FormError message={error} />

      {count > 0 ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold text-fg">{count} notunuz aranabilir değil</h2>
            <p className="max-w-xl text-sm text-fg-muted">
              Bu notlar kaydedildi ama indekslenemedi; sorularınızda bağlam olarak
              kullanılamıyorlar. Onarım birkaç saniye sürebilir.
            </p>
          </div>

          <Button
            className="sm:w-auto sm:self-start"
            loading={loading}
            onClick={() => {
              void repair();
            }}
          >
            Düzelt
          </Button>
        </div>
      ) : null}
    </section>
  );
}
