'use client';

import type { CashflowSummary } from '@business-os/contracts';
import { useEffect, useState } from 'react';

import { getCashflowSummary } from '@/lib/api/finance';
import { monthPeriod } from '@/lib/format/period';
import { ExpenseDonut, NetTrend, type TrendPoint } from './charts';
import { leadCurrency } from './finance-wall';

/**
 * GENEL ÖZET — Finans'a ilk girişte (Product Owner talebi, 2026-08-17).
 *
 * ============================================================================
 * NE GÖSTERİR, NEDEN BU İKİSİ
 * ============================================================================
 *   HALKA  → "parayı nereye harcıyoruz"  (bu dönemin gider kırılımı)
 *   ÇİZGİ  → "hangi yöne gidiyoruz"      (son altı ayın neti)
 *
 * Duvar tek bir anı söyler (bu dönemin neti); bu iki grafik onun **bağlamını**
 * verir: dağılım ve yön. Üçü birlikte "ne oldu / neden / nereye" sorularını
 * kapatır.
 *
 * ============================================================================
 * ⚠️ ALTI AY = ALTI ÇAĞRI, ve bu bilinçli bir bedel
 * ============================================================================
 * Sunucuda "son N dönemin serisi" diye bir uç YOK. Açmak bir modül
 * değişikliği olurdu; ADR-0038 yalnızca arayüzü kapsıyor. Altı özet çağrısı
 * ucuz toplama sorgularıdır ve `Promise.all` ile paralel gider.
 *
 * ⚠️ Seri çağrıları `allSettled` DEĞİL `all` kullanır: eksik bir ay grafikte
 * "sıfır" olarak görünürdü ve o, ölçüm değil ölçememenin sonucudur — yanlış
 * bir eğilim çizmektense hiç çizmemek doğru.
 */

const MONTHS_BACK = 6;

export function FinanceOverview({
  summary,
  loading,
}: {
  /** Duvarın zaten çektiği DÖNEM özeti — halka bunu kullanır, tekrar çekmez. */
  summary: CashflowSummary | null;
  loading: boolean;
}) {
  const [trend, setTrend] = useState<readonly TrendPoint[] | null>(null);

  useEffect(() => {
    let active = true;

    const periods = Array.from({ length: MONTHS_BACK }, (_, index) =>
      monthPeriod(MONTHS_BACK - 1 - index),
    );

    Promise.all(periods.map((period) => getCashflowSummary({ from: period.from, to: period.to })))
      .then((results) => {
        if (!active) {
          return;
        }
        setTrend(
          results.map((result, index) => ({
            // "Ağustos 2026" → "AĞU": şeritte on iki nokta yan yana duracak.
            label: (periods[index]?.label ?? '').slice(0, 3),
            /*
             * ⚠️ Eğilim, DUVARIN kahraman para birimini izler. Para birimleri
             * toplanmaz (ADR-0034 §5.1); bir ayda o para biriminde hareket
             * yoksa net "0"dır ve bu doğrudur — o ay o parayla iş yapılmamış.
             */
            net: netOf(result, leadCurrency(summary)?.currency),
          })),
        );
      })
      .catch(() => {
        if (active) {
          // Eğilim çizilemezse bölüm sessizce görünmez; halka çalışmaya devam
          // eder. Yanlış bir eğilim çizmektense hiç çizmemek doğru.
          setTrend([]);
        }
      });

    return () => {
      active = false;
    };
  }, [summary]);

  if (loading) {
    return <OverviewSkeleton />;
  }

  const lead = leadCurrency(summary);
  if (lead === null) {
    return null;
  }

  return (
    <div className="mb-7 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ExpenseDonut
        categories={
          summary?.currencies.find((row) => row.currency === lead.currency)?.categories ?? []
        }
        currency={lead.currency}
        total={lead.expense}
      />
      {trend === null ? (
        <div className="h-[220px] animate-pulse rounded-card border border-border bg-fill" />
      ) : (
        <NetTrend points={trend} currency={lead.currency} />
      )}
    </div>
  );
}

/** İskelet — bölümün KENDİ şeklini taşır (ADR-0038 bulgu 5). */
function OverviewSkeleton() {
  return (
    <div aria-hidden className="mb-7 grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="h-[220px] animate-pulse rounded-card border border-border bg-fill" />
      <div className="h-[220px] animate-pulse rounded-card border border-border bg-fill" />
    </div>
  );
}

/** Verilen para biriminin neti; o dönemde hareket yoksa "0". */
function netOf(summary: CashflowSummary, currency: string | undefined): string {
  if (currency === undefined) {
    return '0';
  }
  return summary.currencies.find((row) => row.currency === currency)?.net ?? '0';
}
