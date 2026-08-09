/**
 * Musteri ozeti — ONBELLEK kaydi (ADR-0032).
 *
 * ============================================================================
 * NEDEN BU DOSYADA "ENTITY" DEGIL DEGER HESAPLARI VAR
 * ============================================================================
 * Diger CRM varliklarinin (`Company`, `Interaction`) aksine burada zengin bir
 * yasam dongusu yoktur: ozet uretilir, saklanir, bayatlar. Domain katmaninin
 * tasidigi asil bilgi IKI SORUNUN CEVABIDIR ve ikisi de burada, cerceveden
 * bagimsiz olarak yasar:
 *
 *   1. "Kaynaklar degisti mi?"  -> `sourceWatermarkOf`
 *   2. "Bu ozet bayat mi?"      -> `isStale`
 *
 * Ikisi de repository'de SQL'e gomulebilirdi. Gomulmedi, cunku israf freninin
 * KURALI bir is kuralidir: neyin "degisiklik" sayildigina veritabani degil
 * domain karar verir.
 */

/** Watermark'i olusturan ham sayimlar ve en son zaman damgalari. */
export interface SummarySourceFacts {
  readonly interactionCount: number;
  /** ISO 8601 ya da hic gorusme yoksa `null`. */
  readonly lastInteractionCreatedAt: string | null;
  readonly opportunityCount: number;
  readonly lastOpportunityUpdatedAt: string | null;
  readonly contactCount: number;
  readonly companyUpdatedAt: string;
}

/**
 * Kaynaklarin BUGUNKU imzasi.
 *
 * ============================================================================
 * SAYI VE ZAMAN BIRLIKTE — biri digerinin gormedigini gorur
 * ============================================================================
 *   silme       -> sayi DUSER, en buyuk zaman damgasi degismez
 *   guncelleme  -> sayi ayni kalir, zaman damgasi ILERLER
 *   ekleme      -> ikisi de degisir
 *
 * Yalnizca zaman damgasi tutulsaydi bir gorusmenin silinmesi ozeti bayat
 * SAYMAZDI ve kullanici sildigi bir gorusmeyi ozette okumaya devam ederdi.
 * Yalnizca sayi tutulsaydi, bir firsatin asamasinin degismesi gorunmezdi.
 *
 * ⚠️ Bicim OPAKTIR: disaridan ayristirilmaz, yalnizca ESITLIK icin
 * karsilastirilir. Bu yuzden `text` saklanir ve ileride alan eklenmesi
 * migration gerektirmez — eski imzalar yenisiyle esit CIKMAZ, yani ilk
 * istekte bir kez yeniden uretim olur. Bu, kabul edilmis ve ucuz bir bedeldir.
 */
export function sourceWatermarkOf(facts: SummarySourceFacts): string {
  return [
    facts.interactionCount,
    facts.lastInteractionCreatedAt ?? '-',
    facts.opportunityCount,
    facts.lastOpportunityUpdatedAt ?? '-',
    facts.contactCount,
    facts.companyUpdatedAt,
  ].join(':');
}

/**
 * Saklanan ozet, bugunku kaynaklara gore bayat mi?
 *
 * Hic uretilmemis bir ozet bayat DEGILDIR — "yok" ile "eski" ayri durumlardir
 * ve arayuz ikisini farkli gosterir (ADR-0032 §5). Ikisini birlestirmek,
 * hic ozeti olmayan bir sirkette "ozet guncel degil" demek olurdu.
 */
export function isStale(input: {
  storedWatermark: string | null;
  generatedAt: Date | null;
  currentWatermark: string;
}): boolean {
  if (input.generatedAt === null || input.storedWatermark === null) {
    return false;
  }
  return input.storedWatermark !== input.currentWatermark;
}

/**
 * Claim penceresi — bu suredan eski bir `generating_at` OLU sayilir.
 *
 * Coken bir istegin satiri sonsuza kadar kilitlemesini engeller. Iki dakika,
 * bir LLM cagrisinin makul en kotu suresinin (olculen: 2–4 sn) cok uzerinde
 * ve bir insanin "bir daha deneyeyim" esiginin altinda: kullanici tekrar
 * denedigunde kilit ya cozulmus olur ya da gercekten calisan bir uretim vardir.
 */
export const CLAIM_STALE_AFTER_MS = 2 * 60 * 1000;
