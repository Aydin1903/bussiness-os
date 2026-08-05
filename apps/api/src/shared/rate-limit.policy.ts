/**
 * Oran siniri karari — SAF mantik, I/O YOK (ADR-0029 §5).
 *
 * ============================================================================
 * BU, KABA KUVVET POLITIKASININ KOPYASI DEGILDIR
 * ============================================================================
 * `brute-force-policy.ts` UC KATMANLIDIR (e-posta+IP kilidi, ustel gecikme,
 * IP limiti) cunku orada amac GUVENLIKTIR ve tek katman hem hedefli DoS'a hem
 * botnet'e birden cevap veremez.
 *
 * Burada amac MALIYET KONTROLUDUR (ADR-0029 §Gerekce 5). Tek soru sorulur:
 * "bu pencerede kac istek yapildi". Katman, gecikme, kilit YOK — asildiysa
 * 429, asilmadiysa gec. Kaba kuvvet mantigini buraya tasimak, cozulmeyen bir
 * problemin cozumunu tasimak olurdu.
 *
 * ORTAK OLAN TEK SEY felsefedir: karar fonksiyonu SAYIYI hazir alir. Sayiyi
 * uretmek (pencere, veritabani) use-case'in isidir; burada yalnizca KARAR
 * verilir.
 * ============================================================================
 */

/**
 * Oran siniri uygulanan eylemin adi.
 *
 * ============================================================================
 * PLATFORM MEKANIZMAYI SAHIPLENIR, EYLEM ADLARINI YORUMLAMAZ
 * ============================================================================
 * Bu tip bilerek ILKEL bir `string`'tir. Eylem kumesini burada numaralandirmak
 * (`'ask' | 'create_note'`) platformu Knowledge'in sozlugune baglardi ve CRM'in
 * `create_interaction`'i icin PLATFORM kodunu degistirmek gerekirdi.
 *
 * ADR-0025'te Authorization'in permission string'lerini yorumlamamasiyla
 * BIREBIR ayni disiplin: kaynagin sahibi modul kendi kumesini deklare eder
 * (`modules/knowledge/knowledge.rate-limits.ts`), platform yalnizca sayar.
 *
 * ⚠️ **Veritabani artik numaralandiran bir CHECK TASIMAZ** (migration `0014`).
 * `knowledge.rate_limits` tasirdi ve "tipin kacirdigini kisit yakalar" diye
 * gerekcelendirilmisti; o koruma ADR-0031 §4.2 geregi BILEREK birakildi —
 * modul siniri, veritabani seviyesi kisittan onceliklidir (Product Owner
 * onayi). Yanlis yazilmis bir eylem adi artik yalnizca modulun kendi
 * birlesim tipiyle yakalanir.
 * ============================================================================
 */
export type RateLimitedAction = string;

/** Pencere: SABIT saat dilimi. `window_start = date_trunc('hour', now())`. */
export const RATE_LIMIT_WINDOW_MINUTES = 60;

export type RateLimitDecision =
  | { readonly action: 'allow' }
  | { readonly action: 'exceeded'; readonly retryAfterSeconds: number };

/**
 * Karari uretir.
 *
 * `count` ARTIRILMIS degerdir — bu istek DAHIL. Sayac once artar, sonra karar
 * verilir; cunku artirma ile okuma tek atomik deyimdir (yarisi kokten kesen
 * sey budur).
 *
 * Esitlik GECER: limit 30 iken 30. istekte `count = 30` olur ve kabul edilir;
 * 31. istekte `count = 31` -> reddedilir. Yani limit "pencerede EN FAZLA N
 * istek" anlamindadir.
 */
export function evaluateRateLimit(input: {
  readonly count: number;
  readonly limit: number;
  readonly windowStart: Date;
  readonly now: Date;
}): RateLimitDecision {
  if (input.count <= input.limit) {
    return { action: 'allow' };
  }

  return { action: 'exceeded', retryAfterSeconds: secondsUntilWindowEnds(input) };
}

/**
 * Pencerenin bitisine kalan saniye — `Retry-After` basligi icin.
 *
 * Sabit sayi (orn. 3600) dondurmek YANILTICI olurdu: pencere 59. dakikadaysa
 * kullanici bir saat degil bir dakika beklemelidir. Yanlis bir `Retry-After`,
 * istemciyi gereksiz yere uzun susturur.
 *
 * En az 1 saniye: 0 dondurmek "hemen tekrar dene" demektir ve pencere henuz
 * donmemisken aninda ikinci bir 429 uretirdi.
 */
function secondsUntilWindowEnds(input: { readonly windowStart: Date; readonly now: Date }): number {
  const windowEndMs = input.windowStart.getTime() + RATE_LIMIT_WINDOW_MINUTES * 60_000;
  const remainingMs = windowEndMs - input.now.getTime();

  return Math.max(1, Math.ceil(remainingMs / 1000));
}

/**
 * Icinde bulunulan pencerenin baslangici — saate yuvarlanir.
 *
 * Sayacin kimliginin parcasidir: yeni saat = yeni satir = sifirdan sayim.
 * Ayrica bir "sifirlama" isi YOKTUR; eski satirlar yalnizca yer kaplar
 * (retention borcu, ROADMAP §8.3).
 */
export function currentWindowStart(now: Date): Date {
  const start = new Date(now.getTime());
  start.setUTCMinutes(0, 0, 0);
  return start;
}

/**
 * Oran siniri asildi (ADR-0029 §5).
 *
 * ============================================================================
 * BU BIR GUVENLIK REDDI DEGIL, BUTCE REDDIDIR
 * ============================================================================
 * Kimlik dogrudur, yetki vardir, istek gecerlidir — YALNIZCA bu saat icindeki
 * pay tukenmistir. Bu yuzden 403 degil `429` doner ve mesaj GIZLEMEZ: kac
 * istekten sonra ne zaman tekrar denenebilecegi acikca soylenir.
 *
 * Bu hata KNOWLEDGE HIYERARSISINDEN CIKARILDI (ADR-0031 Slice 2): mekanizma
 * artik platformun, dolayisiyla hata da hicbir is modulune ait degil. Bunun
 * sonucu olarak `KnowledgeDomainExceptionFilter`in `@Catch(...)` listesine
 * ACIKCA eklendi — daha once `KnowledgeDomainError` uzerinden yakalaniyordu.
 *
 * Kimlik akislarindaki P2 disiplini (reddin SEBEBINI sizdirma) burada
 * GECERSIZDIR ve olmamalidir: orada gizlenen sey "bu hesap var mi" idi;
 * burada gizlenecek bir sey yok, kullanici kendi kotasini bilir.
 * ============================================================================
 */
export class RateLimitExceededError extends Error {
  readonly code = 'RATE_LIMIT_EXCEEDED';

  constructor(
    readonly limit: number,
    /** Pencerenin bitisine kalan sure — `Retry-After` basligini besler. */
    readonly retryAfterSeconds: number,
  ) {
    super(
      `Saatlik istek siniri asildi (en fazla ${String(limit)}). ` +
        `${String(retryAfterSeconds)} saniye sonra tekrar deneyin.`,
    );
  }
}
