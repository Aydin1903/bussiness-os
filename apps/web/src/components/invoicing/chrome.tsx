'use client';

import type { SalesDocument, SalesDocumentStatus } from '@business-os/contracts';

/**
 * TEKLİF / FATURA ODASININ KENDİNE ÖZGÜ PARÇALARI.
 *
 * ⚠️ Buradakiler `module-kit`e TAŞINMADI ve sınav basit: "iki modül de bunu
 * aynı şekilde kullanabilir mi?" Hayır — `StatusPill` durum kümesinin `kind`'a
 * bağlı olduğunu, `DocumentNumber` numaranın taslakta HENÜZ VERİLMEDİĞİNİ
 * (eksik değil) bilir.
 */

/**
 * DURUM ROZETİ.
 *
 * ⚠️ RENK TEK AYIRT EDİCİ DEĞİLDİR: her rozet METNİ de taşır. Renk körlüğü
 * altında "gönderildi" ile "kabul edildi" yalnızca renkle ayrılsaydı ekran
 * hiçbir şey söylemezdi.
 *
 * ⚠️ İki durum makinesi burada BİRLEŞTİRİLMEZ, yalnızca ETİKETLENİR: geçerli
 * kümenin `kind`'a bağlı olduğunu sunucu ve veritabanı zorlar
 * (`sales_documents_status_valid`). Arayüz üçüncü bir kural kaynağı OLMAZ.
 */
const STATUS_LABELS: Readonly<Record<SalesDocumentStatus, string>> = {
  draft: 'Taslak',
  sent: 'Gönderildi',
  accepted: 'Kabul edildi',
  rejected: 'Reddedildi',
  issued: 'Kesildi',
  cancelled: 'İptal edildi',
};

/**
 * `accent` yalnızca DİKKAT İSTEYEN durumlara verilir.
 *
 * ⚠️ "Kabul edildi" vurgulanır çünkü ARDINDAN BİR İŞ GELİR (faturaya
 * dönüştürme, §3) — para masada demektir ve yapısal katkıcı da onu 0.95 ile
 * raporlar. "Kesildi" vurgulanmaz: yapılacak bir şey kalmamıştır.
 */
const STATUS_TONE: Readonly<Record<SalesDocumentStatus, 'accent' | 'plain' | 'quiet'>> = {
  draft: 'quiet',
  sent: 'plain',
  accepted: 'accent',
  rejected: 'quiet',
  issued: 'plain',
  cancelled: 'quiet',
};

export function StatusPill({ status }: { readonly status: SalesDocumentStatus }) {
  const tone = STATUS_TONE[status];

  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 rounded-full border px-[9px] py-[3px]',
        'font-mono text-[9.5px] font-medium tracking-[0.09em] uppercase',
        tone === 'accent'
          ? 'border-accent/40 bg-accent/10 text-ink'
          : tone === 'plain'
            ? 'border-border bg-sunken text-fg-2'
            : 'border-border bg-transparent text-fg-3',
      ].join(' ')}
    >
      {tone === 'accent' ? (
        <span aria-hidden className="h-[3px] w-[3px] shrink-0 rounded-full bg-accent" />
      ) : null}
      {STATUS_LABELS[status]}
    </span>
  );
}

/**
 * BELGE NUMARASI — taslakta GÖSTERİLMEZ (ADR-0041 §1.6).
 *
 * ============================================================================
 * ⚠️ BOŞLUK BİR EKSİK DEĞİL, BİR BİLGİDİR
 * ============================================================================
 * `number` taslakta `null`dur ve bu bir veri eksikliği DEĞİLDİR: numara belge
 * DIŞARI ÇIKTIĞI an üretilir. Taslakta üretilseydi silinen her taslak bir
 * numara YAKARDI ve kullanıcı numaralar arasındaki boşlukları HATA SANARDI.
 *
 * Bu yüzden ekran "—" ya da boş bırakmaz; ne olacağını SÖYLER. Sessiz
 * bırakmak, kullanıcının "numara alamadım galiba" diye düşünmesine yol açardı.
 *
 * ⚠️ Sahte bir numara (önizleme, "TKF-?") GÖSTERİLMEZ: henüz verilmemiş bir
 * numarayı verilmiş göstermek olurdu.
 */
export function DocumentNumber({ document }: { readonly document: SalesDocument }) {
  if (document.number !== null) {
    return (
      <span className="font-mono text-[11px] tracking-[0.04em] text-fg-2">{document.number}</span>
    );
  }

  return (
    <span className="text-[11px] text-fg-3">
      {document.kind === 'quote' ? 'Gönderilince numara atanacak' : 'Kesilince numara atanacak'}
    </span>
  );
}

/**
 * TUTAR — sunucunun kanonik dizesi OLDUĞU GİBİ yazılır.
 *
 * ============================================================================
 * ⚠️ BİNLİK AYRACI YOK — ve bu ADR-0034'ten devralınan bir karardır
 * ============================================================================
 * Biçimlendirmek `Number`a çevirmek demekti ve para bu projede hiçbir noktada
 * `number` OLMUYOR. Bir kez çevrilse yuvarlama hatası KALICI olurdu ve
 * çıktısı bir para rakamıdır; rakamlara itiraz edilmez.
 *
 * ⚠️ Para birimi HER TUTARIN yanında yazılır, bir kez başlıkta değil: farklı
 * para birimleri TOPLANMAZ (§1.4) ve çıplak bir sayı, toplanabilirliği ima
 * ederdi.
 */
export function Money({
  amount,
  currency,
}: {
  readonly amount: string;
  readonly currency: string;
}) {
  return (
    <span className="tabular text-[13px] text-fg">
      {amount} <span className="text-[11px] text-fg-3">{currency}</span>
    </span>
  );
}

/**
 * AKTÖR DAMGASI — "Ahmet tarafından gönderildi, 20 Ağustos" (ADR-0041 §8.2).
 *
 * ============================================================================
 * ⚠️ BU BİR DENETİM İZİ DEĞİLDİR VE ÖYLE ADLANDIRILMAZ
 * ============================================================================
 * `platform/audit` bu modülde AÇILMADI. Sorunun büyük kısmı §2 ile ortadan
 * kalkıyor: gönderilmiş bir belgenin tutarı DEĞİŞMEZ, yani "kim değiştirdi"
 * diye bir soru yoktur — olay OLMAZ. Geriye kalan DURUM GEÇİŞLERİDİR ve
 * cevabı satırın üzerindeki dört damgadır.
 *
 * Fark ekranda da korunur: bir olay günlüğü _"ne oldu"_yu SIRASIYLA anlatır;
 * damga yalnızca SON DURUMU söyler. Bu yüzden burada bir ZAMAN ÇİZELGESİ
 * yoktur — olsaydı, olmayan bir günlüğü VAR gibi gösterirdi.
 *
 * ⚠️ TASLAK ÜZERİNDEKİ DÜZENLEMELER İZLENMEZ ve ekran bunu ima etmez: taslak
 * için hiçbir damga gösterilmez.
 *
 * ⚠️ `userId` bir UUID'dir; bugün kullanıcı ADINI çözen bir dizin YOKTUR.
 * Uydurmak yerine kısaltılmış kimlik gösterilir — sahte bir ad, olmayan bir
 * bilgiyi VAR gibi gösterirdi. (Bir kullanıcı dizini geldiği gün burası tek
 * satırda değişir.)
 */
export function ActorStamp({
  action,
  at,
  userId,
}: {
  readonly action: string;
  readonly at: string | null;
  readonly userId: string | null;
}) {
  if (at === null) {
    return null;
  }

  return (
    <span className="text-[11.5px] leading-[1.6] text-fg-3">
      {userId === null ? action : `${shortActor(userId)} tarafından ${action.toLowerCase()}`}
      {', '}
      {formatDate(at)}
    </span>
  );
}

/** UUID'nin ilk bloğu — bir ad DEĞİL, bir kimlik parçası olduğu bellidir. */
function shortActor(userId: string): string {
  return `kullanıcı ${userId.slice(0, 8)}`;
}

/**
 * TAKVİM GÜNÜ — `YYYY-MM-DD` dizesinden.
 *
 * ⚠️ `new Date(iso)` SAAT DİLİMİ KAYDIRIR: `'2026-08-22'` UTC gece yarısı
 * olarak ayrıştırılır ve UTC−03:00'te BİR ÖNCEKİ GÜN gösterilir. Belge tarihi
 * bir TAKVİM GÜNÜDÜR (`date` kolonu), bir an değil — bu yüzden dize ELLE
 * parçalanır. `suppliers/chrome.tsx` ile aynı karar.
 */
export function formatDay(day: string): string {
  const [year, month, date] = day.split('-');
  if (year === undefined || month === undefined || date === undefined) {
    return day;
  }

  return new Date(Number(year), Number(month) - 1, Number(date)).toLocaleDateString('tr-TR', {
    dateStyle: 'medium',
  });
}

/** Türkçe tarih — ISO AN'dan (gönderim zamanı gibi). */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('tr-TR', { dateStyle: 'medium' });
}

/** Bugünün takvim günü — form varsayılanı. */
export function today(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const date = String(now.getDate()).padStart(2, '0');

  return `${String(now.getFullYear())}-${month}-${date}`;
}

/**
 * Belge DÜZENLENEBİLİR Mİ (ADR-0041 §2).
 *
 * ⚠️ Bu, sunucunun `assertEditable()`ının ARAYÜZ KARŞILIĞIDIR — ONUN YERİNE
 * GEÇMEZ. Koruma üç katmanlıdır (domain + uç + veritabanı trigger'ı) ve bu
 * fonksiyon DÖRDÜNCÜ bir katman değil, yalnızca kullanıcının bir hataya
 * çarpmadan ÖNCE anlamasını sağlayan bir görünürlük kuralıdır.
 *
 * İki sekmede açık bir belgede biri gönderirse, diğeri hâlâ taslak sanar ve
 * **409** alır — o yüzden sunucu tarafı vazgeçilmezdir.
 */
export function isEditable(document: SalesDocument): boolean {
  return document.status === 'draft';
}

/** Salt-okunur görünümün SEBEBİNİ söyleyen kısa metin (§2). */
export function readOnlyReason(document: SalesDocument): string {
  if (document.kind === 'quote') {
    return 'Bu teklif müşteriye iletildi; başlığı ve kalemleri artık değiştirilemez. Yanlış bir belge düzeltilmez — doğrusu yeni bir teklif olarak yazılır.';
  }

  return 'Bu fatura kesildi; başlığı ve kalemleri artık değiştirilemez. Yanlış bir belge düzeltilmez — iptal edilir ve doğrusu yeni bir fatura olarak kesilir.';
}
