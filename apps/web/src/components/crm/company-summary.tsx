'use client';

import type { CompanySummary } from '@business-os/contracts';
import { useCallback, useEffect, useState } from 'react';

import { generateCompanySummary, getCompanySummary } from '@/lib/api/crm';
import { errorMessage } from '@/lib/api/error-message';
import { localRelativeWhen } from '@/lib/format/datetime';

/**
 * Müşteri özeti — AI'ın bir MODÜLÜN İÇİNDE konuştuğu ilk yer (ADR-0032 §5).
 *
 * ============================================================================
 * ⚠️ BURADA TERRACOTTA KULLANILIR, MODÜLÜN RENGİ DEĞİL
 * ============================================================================
 * Bu bileşen `[data-module="crm"]` ağacının içindedir, yani `bg-accent` yazsa
 * ÇİVİT MAVİSİ alırdı. Almamalı: `--ai-accent` / `--ai-ink` sabittir ve hiçbir
 * modül onu ezemez (FRONTEND §4.8).
 *
 * Kural şudur ve bu ekran onun ilk sınavıdır: **bir ekranda terracotta
 * görüldüğünde tek bir şey demelidir — "burada asistan konuşuyor".** Sayfanın
 * geri kalanı (düğmeler, rozetler, kartların çizgisi) CRM'in mavisini taşır;
 * yalnızca bu blok terracottadır ve fark, kullanıcıya kimin konuştuğunu
 * SÖYLEMEDEN anlatır.
 *
 * Aynı ayrımın tipografi tarafı zaten vardı: AI serif konuşur (`.ai-voice`,
 * FRONTEND §4.5). Renk onu tekrarlar — yani bilgi TEK kanalda taşınmaz ve
 * renk körlüğünde de ayrım korunur.
 *
 * ============================================================================
 * SAYFANIN İLK EKRANINI KAPLAR — bu bir hiyerarşi kararıdır
 * ============================================================================
 * Özet, kimlik kartının da kişilerin de ÜSTÜNDEDİR ve büyüktür. Gerekçe
 * CLAUDE.md'nin kurucu kısıtı: modüller AI'a bağlam sağlamak için vardır.
 * Müşteriyi aramadan önce okunacak şey telefon numarası değil, "nerede
 * kaldık"tır. Küçük bir kutuya alınsaydı, ürünün iddiası ile ekranın
 * söylediği çelişirdi.
 */

type Phase = 'loading' | 'ready' | 'failed';

export function CompanySummaryPanel({
  companyId,
  readOnly,
}: {
  companyId: string;
  /** `viewer` özet OKUR ama ÜRETEMEZ — üretmek para harcar (`company:summarize`). */
  readOnly: boolean;
}) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [summary, setSummary] = useState<CompanySummary | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      setSummary(await getCompanySummary(companyId));
      setPhase('ready');
    } catch {
      // Özet YOKSA sayfa yine de çalışmalı: bu bir yardımcıdır, kaydın
      // kendisi değil. `PartialNotice` ile aynı ilke.
      setPhase('failed');
    }
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function generate(): Promise<void> {
    setGenerating(true);
    setError(null);
    setNotice(null);
    try {
      const result = await generateCompanySummary(companyId);
      setSummary(result);
      setPhase('ready');
      if (!result.regenerated) {
        // İSRAF FRENİ devreye girdi. Söylenmeseydi kullanıcı "yenile"ye basıp
        // metnin değişmemesini bir hata sanardı.
        setNotice('Görüşmelerde değişiklik yok — mevcut özet güncel.');
      }
    } catch (cause: unknown) {
      setError(errorMessage(cause));
    } finally {
      setGenerating(false);
    }
  }

  if (phase === 'loading') {
    return <SummarySkeleton />;
  }

  // Uç çökerse blok TAMAMEN çizilmez. Boş bir çerçeve bırakmak, "AI burada
  // bir şey söyleyecekti ama söyleyemedi" izlenimi verirdi; oysa sayfanın
  // geri kalanı sağlam.
  if (phase === 'failed' || summary === null) {
    return null;
  }

  const busy = generating || summary.generating;

  return (
    <section
      aria-label="Yapay zekâ özeti"
      className="border-b border-border px-5 pt-7 pb-8 md:px-10"
    >
      <Eyebrow />

      {summary.summary === null ? (
        <EmptyInvitation summarizable={summary.summarizable} readOnly={readOnly} />
      ) : (
        <p className="ai-voice-lead mt-4 max-w-[42ch] text-[22px] leading-[1.5] tracking-[-0.012em] text-fg md:text-[26px]">
          {summary.summary}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Meta summary={summary} busy={busy} />

        {readOnly || !summary.summarizable ? null : (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              void generate();
            }}
            className={[
              'ml-auto inline-flex shrink-0 items-center gap-[7px] rounded-full',
              'border border-ai-tint bg-raised px-[15px] py-[8px]',
              'text-[12.5px] font-medium tracking-[-0.008em] text-ai-ink shadow-card',
              'transition-[transform,box-shadow,color] duration-[260ms] ease-rise',
              'hover:-translate-y-[2px] hover:shadow-float',
              'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0',
            ].join(' ')}
          >
            {busy ? 'Hazırlanıyor…' : summary.summary === null ? 'Özet çıkar' : 'Yenile'}
          </button>
        )}
      </div>

      {notice === null ? null : (
        <p className="mt-3 text-[11.5px] text-fg-3" role="status">
          {notice}
        </p>
      )}
      {error === null ? null : (
        <p className="mt-3 text-[11.5px] text-danger" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

/**
 * "Asistan" etiketi — noktası `bg-ai-accent`.
 *
 * Panel'in akış noktalarıyla AYNI işaret (`stream.tsx`): kullanıcı bu noktayı
 * Panel'de zaten öğrendi ve burada aynı şeyi görür.
 */
function Eyebrow() {
  return (
    <p className="flex items-center gap-2 font-mono text-[9px] font-semibold tracking-[0.18em] text-fg-3 uppercase">
      <span aria-hidden className="h-[5px] w-[5px] shrink-0 rounded-full bg-ai-accent" />
      Asistan
    </p>
  );
}

/** Henüz özet yok — ne yapılacağını söyler, uyarı gibi görünmez. */
function EmptyInvitation({ summarizable, readOnly }: { summarizable: boolean; readOnly: boolean }) {
  if (!summarizable) {
    return (
      <p className="ai-voice mt-4 max-w-[52ch] text-[16.5px] leading-[1.7] text-fg-3">
        Bu müşteriyle henüz bir görüşme kaydedilmemiş. İlk görüşmeyi yazdığınızda ilişkinin özetini
        buradan okuyabilirsiniz.
      </p>
    );
  }

  return (
    <p className="ai-voice mt-4 max-w-[52ch] text-[16.5px] leading-[1.7] text-fg-3">
      {readOnly
        ? 'Bu müşteri için henüz bir özet çıkarılmamış.'
        : 'Görüşmelerinizden bu müşteriyle nerede kaldığınızı çıkarabilirim.'}
    </p>
  );
}

/** Tarih + tazelik durumu. Renk TEK taşıyıcı değil: metin de söyler. */
function Meta({ summary, busy }: { summary: CompanySummary; busy: boolean }) {
  if (busy) {
    return (
      <span className="font-mono text-[10px] tracking-[0.08em] text-fg-3 uppercase" role="status">
        Özet hazırlanıyor…
      </span>
    );
  }

  if (summary.generatedAt === null) {
    return null;
  }

  return (
    <span className="flex items-center gap-2 font-mono text-[10px] tracking-[0.08em] text-fg-3 uppercase">
      <span>{localRelativeWhen(summary.generatedAt)} özetlendi</span>
      {summary.stale ? (
        <span className="rounded-[6px] border border-ai-tint px-1.5 py-[2px] text-ai-ink normal-case">
          sonrasında değişiklik var
        </span>
      ) : null}
    </span>
  );
}

/** Yükleniyor — metnin GELECEĞİ yeri tutar, sayfa zıplamaz. */
function SummarySkeleton() {
  return (
    <section className="border-b border-border px-5 pt-7 pb-8 md:px-10" aria-hidden>
      <Eyebrow />
      <div className="mt-5 h-[18px] w-[70%] max-w-[420px] rounded-full bg-fill" />
      <div className="mt-3 h-[18px] w-[45%] max-w-[280px] rounded-full bg-fill" />
    </section>
  );
}
