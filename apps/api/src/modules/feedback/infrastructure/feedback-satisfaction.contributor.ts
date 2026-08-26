import { Injectable } from '@nestjs/common';

import {
  type ContextFragment,
  type RetrievalContributor,
} from '../../../platform/context/context.public';
import { type Clock } from '../../../shared/clock.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import {
  type FeedbackRepository,
  type SatisfactionSnapshot,
} from '../application/feedback.repository.port';
import { FEEDBACK_READ } from '../feedback.permissions';

/**
 * `feedback-satisfaction` — memnuniyetin YAPISAL sesi (ADR-0045 §3.2).
 *
 * ============================================================================
 * ⚠️ BU KATKICI UC ADR BOYUNCA ASKIDA KALDI — VE SEBEBI BIR EKSIKLIKTI
 * ============================================================================
 * ADR-0045 §3.4 onu REDDETMEDI, **kosullu erteledi** ve on kosullari sirayla
 * yazdi:
 *
 *   1. `retrieval.select` gozlemlenebilirlik satiri  -> ADR-0046 ✅
 *   2. gercek veriyle bir OLCUM                      -> ADR-0048 ✅
 *   3. ADR-0036/0042'nin yeniden acilmasi            -> ADR-0049 ✅
 *   4. ⚠️ ANCAK ONDAN SONRA katkici                  -> BURASI
 *
 * ⚠️ ADR-0049 kritikti: olcum, ayni banddaki kaynaklar arasinda secimin
 * KAYIT SIRASINA dustugunu gosterdi. O kusur dururken yeni bir yapisal
 * kaynak eklemek, onu havuzun SONUNA yazip sistematik olarak ac birakmak
 * olurdu.
 *
 * ============================================================================
 * ⚠️ DORDUNCU OLCUT "BUYUK OLCUDE" KARSILANIYOR — TAM DEGIL
 * ============================================================================
 * ADR-0045 §3.2'nin kendi olcutu: _"ayni haberi soyleyen bir ses zaten var
 * mi?"_ Burada cevap kismen EVET — olumsuz geri bildirimin haberi zaten
 * musterinin kendi cumlesidir ve `feedback-comments` onu havuza tasir.
 *
 * ⚠️ Adayi ayakta tutan sey YORUMSUZ puanlardir: onlarin metni yoktur, yani
 * anlamsal ses de yoktur. O kayitlar icin bu katkici **TEK sestir**.
 *
 * ⚠️ Bu yuzden ozet BILEREK anlamsal parcayla YARISMAZ, onu TAMAMLAR: cumleyi
 * tekrar etmez, SAYIYI soyler ("uc dusuk puan, sonuncusu iki gun once").
 * ============================================================================
 */
export const FEEDBACK_SATISFACTION_SOURCE = 'feedback-satisfaction';

/** Ozetin baktigi pencere — ekranin `summary` ucuyla ayni buyukluk. */
const WINDOW_DAYS = 30;

/**
 * Ortalamanin anlamli sayilmasi icin gereken en az kayit.
 *
 * ⚠️ ADR-0045 §9.1'in ekran kuralinin ("ortalama, N olmadan gosterilmez")
 * havuzdaki karsiligi: tek kayitli bir tenant'ta "ortalama 1,0" bir haber
 * degil GURULTUDUR. Ekran N'i yazarak cozer; havuz yazamaz, cunku modele
 * giden metin bir cumledir — bu yuzden burada esik ALTINDA ortalama
 * CUMLEYE HIC GIRMEZ.
 */
const MIN_AVERAGE_SAMPLE = 3;

/** Ortalamanin "dustu" sayilmasi icin gereken en az fark (5'lik olcekte). */
const DECLINE_DELTA = 0.3;

const SCORE_LOW_RATING = 0.95;
const SCORE_DECLINING = 0.9;
const SCORE_HEALTHY = 0.75;

@Injectable()
export class FeedbackSatisfactionContributor implements RetrievalContributor {
  readonly source = FEEDBACK_SATISFACTION_SOURCE;
  readonly contributionKind = 'structural' as const;
  readonly permission = FEEDBACK_READ;

  constructor(
    private readonly repository: FeedbackRepository,
    private readonly transactionManager: TransactionManager,
    private readonly clock: Clock,
    private readonly lowRatingMax: number,
  ) {}

  async contribute(): Promise<ContextFragment[]> {
    const now = this.clock.now();
    const from = shiftDays(now, -WINDOW_DAYS);
    const previousFrom = shiftDays(from, -WINDOW_DAYS);

    const snapshot = await this.transactionManager.runInCurrentTenantTransaction(() =>
      this.repository.satisfactionSnapshot({
        from,
        to: now,
        previousFrom,
        lowRatingMax: this.lowRatingMax,
      }),
    );

    // ⚠️ SOYLEYECEK SEYI YOKSA SUSAR — ve bu, ADR-0049 §3.4'un kaydettigi
    // "kosullu sessiz kaynak" seklidir: bos bir pencerede taban yuvasi
    // ISGAL ETMEZ ve T2'ye de SAYILMAZ (`status: "empty"`).
    if (snapshot.count === 0) {
      return [];
    }

    return [
      {
        content: describe(snapshot, now, this.lowRatingMax),
        score: scoreFor(snapshot),
        source: FEEDBACK_SATISFACTION_SOURCE,
        // ⚠️ Bir SATIRA degil PENCEREYE isaret ediyor: ozet tek bir geri
        // bildirimden turemiyor. `inventory-stock`in `last-7-days` deseni.
        reference: { kind: 'feedback-window', id: `last-${String(WINDOW_DAYS)}-days` },
      },
    ];
  }
}

/**
 * Skor merdiveni — ⚠️ DUZ SABIT DEGIL, RISKE GORE (ADR-0031/0033 politikasi).
 *
 * ⚠️ Duz bir 0.95 yazmak, sakin bir tenant'ta bile alarm bandini isgal
 * ederdi; ADR-0033'un Slice 6'da CRM'i hizalama gerekcesi tam olarak buydu.
 */
function scoreFor(snapshot: SatisfactionSnapshot): number {
  if (snapshot.lowRatingCount > 0) {
    return SCORE_LOW_RATING;
  }
  return isDeclining(snapshot) ? SCORE_DECLINING : SCORE_HEALTHY;
}

/**
 * Ortalama ONCEKI pencereye gore anlamli olcude dustu mu?
 *
 * ⚠️ Iki pencerenin de `MIN_AVERAGE_SAMPLE` kadar verisi olmadan "dustu"
 * denemez: iki kayittan bir kayda inen bir tenant'ta ortalama tesadufen
 * oynar ve bu bir TREND degildir.
 */
function isDeclining(snapshot: SatisfactionSnapshot): boolean {
  const current = toNumber(snapshot.average);
  const previous = toNumber(snapshot.previousAverage);

  if (current === null || previous === null || snapshot.count < MIN_AVERAGE_SAMPLE) {
    return false;
  }

  return previous - current >= DECLINE_DELTA;
}

function describe(snapshot: SatisfactionSnapshot, now: Date, lowRatingMax: number): string {
  const parts = [
    `Musteri memnuniyeti (son ${String(WINDOW_DAYS)} gun)`,
    `${String(snapshot.count)} geri bildirim`,
  ];

  // ⚠️ ORTALAMA ESIK ALTINDA HIC YAZILMAZ (ADR-0045 §9.1'in havuz karsiligi).
  if (snapshot.average !== null && snapshot.count >= MIN_AVERAGE_SAMPLE) {
    parts.push(`ortalama ${snapshot.average}`);
  }

  if (snapshot.lowRatingCount > 0) {
    const last =
      snapshot.lastLowRatingAt === null
        ? ''
        : `, sonuncusu ${describeAge(snapshot.lastLowRatingAt, now)}`;
    parts.push(
      `⚠️ ${String(snapshot.lowRatingCount)} DUSUK PUAN (${String(lowRatingMax)} ve alti)${last}`,
    );
  } else if (isDeclining(snapshot)) {
    parts.push(`onceki 30 gun ortalamasi ${String(snapshot.previousAverage)} — DUSUS`);
  }

  return parts.join(' · ');
}

function describeAge(moment: Date, now: Date): string {
  const days = Math.floor((now.getTime() - moment.getTime()) / 86_400_000);
  if (days <= 0) {
    return 'bugun';
  }
  return days === 1 ? 'dun' : `${String(days)} gun once`;
}

/**
 * ⚠️ `numeric` PostgreSQL'den DIZE olarak gelir (para/oran disiplini) ve
 * burada YALNIZCA karsilastirma icin sayiya cevrilir — saklanan ya da
 * gosterilen deger her zaman sunucunun kanonik dizesidir.
 */
function toNumber(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function shiftDays(moment: Date, days: number): Date {
  return new Date(moment.getTime() + days * 86_400_000);
}
