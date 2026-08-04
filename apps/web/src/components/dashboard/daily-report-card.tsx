'use client';

import { useEffect, useState } from 'react';

import type { DailyReportResponse } from '@business-os/contracts';

import { SparkleIcon } from '@/components/icons';
import { fetchDailyReport } from '@/lib/api/knowledge';

interface Report {
  readonly summary: string;
  readonly generatedAt: string;
}

type State =
  | { readonly phase: 'loading' }
  | { readonly phase: 'empty' }
  | { readonly phase: 'ready'; readonly report: Report }
  /** Kart görünmez olur; dashboard'ın kalanı etkilenmez. */
  | { readonly phase: 'hidden' };

/** Yanıtı duruma çevirir — SAF. `report: null` boş durumdur, hata değil. */
function toState(report: DailyReportResponse['report']): State {
  if (report === null) {
    return { phase: 'empty' };
  }

  return {
    phase: 'ready',
    report: { summary: report.summary, generatedAt: report.generatedAt },
  };
}

/** Veri çekme, görünümden ayrı: bileşen yalnızca DURUMU çizer. */
function useDailyReport(): State {
  const [state, setState] = useState<State>({ phase: 'loading' });

  useEffect(() => {
    let active = true;

    void fetchDailyReport()
      .then((response) => {
        if (!active) {
          return;
        }
        setState(toState(response.report));
      })
      .catch(() => {
        if (active) {
          setState({ phase: 'hidden' });
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return state;
}

/**
 * Günlük rapor kartı (ADR-0030 §2.2).
 *
 * ============================================================================
 * BOŞ DURUM GİZLENMEZ, AÇIKLANIR
 * ============================================================================
 * Rapor yokken kartı hiç göstermemek de bir seçenekti; gösterilmesi seçildi
 * çünkü `AiWelcomeCard`'ın varlık sebebi zaten budur: henüz olmayan bir şeyin
 * ne zaman ve neden geleceğini anlatmak. Kartı gizlemek, özelliği kullanıcı
 * için KEŞFEDİLEMEZ kılardı — kimse var olduğunu bilmediği bir raporu beklemez.
 *
 * ⚠️ Metinde SAAT YAZMAZ. Üretim saati sunucu config'indedir
 * (`DAILY_REPORT_HOUR_UTC`); istemciye kopyalamak iki doğruluk kaynağı
 * yaratırdı ve biri değiştiğinde diğeri sessizce yalan söylerdi.
 *
 * ============================================================================
 * HATA KARTI YOK EDER, SAYFAYI DEĞİL
 * ============================================================================
 * Çağrı başarısız olursa (ağ, 5xx, oturum) kart `hidden`'a düşer ve hiçbir şey
 * çizilmez. Dashboard'ın geri kalanı çalışmaya devam eder: bir özet kartının
 * yüklenememesi, kullanıcının şirket paneline erişimini engellememeli.
 * `OnboardingGate`'in hata davranışıyla aynı ilke.
 * ============================================================================
 */
export function DailyReportCard() {
  const state = useDailyReport();

  // Yüklenirken hiçbir şey çizilmez: kısa bir istek için iskelet göstermek,
  // dashboard'da bir anlık sıçrama yaratırdı.
  if (state.phase === 'loading' || state.phase === 'hidden') {
    return null;
  }

  return (
    <section className="rounded-card border border-border bg-surface p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-fg">
          <SparkleIcon width={18} height={18} />
        </span>

        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">Günlük özet</h2>
          {state.phase === 'empty' ? <EmptyState /> : <ReportBody report={state.report} />}
        </div>
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <p className="max-w-xl text-sm text-fg-muted">
      Henüz bir özet yok. Not eklemeye başladığınızda, her gün eklenenlerden otomatik bir özet
      oluşturulacak.
    </p>
  );
}

function ReportBody({ report }: { report: Report }) {
  return (
    <>
      <p className="max-w-xl text-sm text-fg">{report.summary}</p>
      <p className="mt-1 text-xs text-fg-muted/70">
        {formatRelativeTime(report.generatedAt)} oluşturuldu
      </p>
    </>
  );
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * "3 saat önce" gibi göreli zaman.
 *
 * Mutlak zaman damgası yerine göreli metin: raporun ne zaman üretildiği
 * kullanıcı için "bugün mü, dün mü" sorusudur — saat/dakika değil.
 *
 * GELECEK bir tarih "az önce" sayılır: sunucu ile istemci saati birkaç saniye
 * kayabilir ve "-1 dakika önce" yazmak, doğru bir zamandan daha kötüdür.
 */
export function formatRelativeTime(isoTimestamp: string, now: Date = new Date()): string {
  const timestamp = Date.parse(isoTimestamp);
  if (Number.isNaN(timestamp)) {
    // Ayrıştırılamayan bir değeri "NaN gün önce" diye yazmaktansa sessiz kal.
    return 'yakın zamanda';
  }

  const elapsed = now.getTime() - timestamp;

  if (elapsed < MINUTE_MS) {
    return 'az önce';
  }
  if (elapsed < HOUR_MS) {
    return `${String(Math.floor(elapsed / MINUTE_MS))} dakika önce`;
  }
  if (elapsed < DAY_MS) {
    return `${String(Math.floor(elapsed / HOUR_MS))} saat önce`;
  }

  return `${String(Math.floor(elapsed / DAY_MS))} gün önce`;
}
