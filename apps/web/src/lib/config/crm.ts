/**
 * CRM sinyal eşikleri — tek kaynak.
 *
 * ============================================================================
 * NEDEN AYARLANABİLİR
 * ============================================================================
 * "Uzun süredir" her işte aynı şey değildir: bir mimarlık bürosunda 21 gün
 * bekleyen teklif normal, bir e-ticaret operasyonunda alarmdır. Sayıyı koda
 * gömmek, ürünü tek bir iş temposuna kilitlerdi.
 *
 * `NEXT_PUBLIC_` öneki değişkeni TARAYICIYA taşır — bu değerler gizli değil,
 * yalnızca ayar (`lib/api/config.ts` ile aynı desen).
 *
 * ⚠️ Bunlar UYARI eşikleridir, iş kuralı DEĞİL: hiçbir şeyi engellemez,
 * yalnızca kullanıcıya "buraya bak" der. Bu yüzden sunucuda karşılıkları
 * yoktur ve olmamalıdır.
 */

/** Aşamada beklemenin "uzun" sayıldığı gün sayısı. */
const DEFAULT_STALE_STAGE_DAYS = 21;

/** Temassız geçen sürenin "uzun" sayıldığı gün sayısı. */
const DEFAULT_QUIET_COMPANY_DAYS = 30;

/**
 * Sayıyı okur; geçersiz ya da eksikse varsayılana düşer.
 *
 * Bozuk bir ortam değişkeni yüzünden `NaN` bir eşikle karşılaştırma yapmak,
 * her karşılaştırmayı sessizce `false` yapardı — yani uyarılar hiç
 * görünmezdi ve kimse fark etmezdi.
 */
function readPositiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined) {
    return fallback;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export function staleStageDays(): number {
  return readPositiveInt(process.env.NEXT_PUBLIC_CRM_STALE_STAGE_DAYS, DEFAULT_STALE_STAGE_DAYS);
}

export function quietCompanyDays(): number {
  return readPositiveInt(process.env.NEXT_PUBLIC_CRM_QUIET_DAYS, DEFAULT_QUIET_COMPANY_DAYS);
}

/**
 * Fırsatlar panosunda aşama başına gösterilen kart sayısı.
 *
 * ============================================================================
 * PANO BİR ÖZETTİR, ARŞİV DEĞİL
 * ============================================================================
 * Sekiz kart aynı sütuna yığıldığında pano dengesini kaybediyor: bir sütun
 * ekranı aşarken diğer dördü boş duruyor. Sınır, panoyu "her aşamada ne
 * durumdayım" sorusunun cevabı olarak tutar; tam liste ayrı bir ekrandır
 * (`/app/crm/pipeline/[stage]`).
 *
 * Hangi kartların gösterileceği SUNUCUDA belirlenir (`order=priority`):
 * önce gecikmiş takipler, sonra en son güncellenen. İstemcide kesmek,
 * sunucudan gelen sayfanın dışındaki gecikmiş bir fırsatı görünmez kılardı.
 */
const DEFAULT_PIPELINE_VISIBLE_PER_STAGE = 4;

export function pipelineVisiblePerStage(): number {
  return readPositiveInt(
    process.env.NEXT_PUBLIC_CRM_PIPELINE_VISIBLE_PER_STAGE,
    DEFAULT_PIPELINE_VISIBLE_PER_STAGE,
  );
}
