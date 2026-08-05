/**
 * Knowledge modulunun DEKLARE ettigi oran siniri eylemleri (ADR-0029 §5,
 * ADR-0031 §4.2).
 *
 * ============================================================================
 * PLATFORM SAYAR, MODUL ADLANDIRIR
 * ============================================================================
 * Mekanizma (`platform.rate_limits` tablosu, `evaluateRateLimit`,
 * `enforceRateLimit`) platformundur ve eylem adlarinin ANLAMINI bilmez —
 * `RateLimitedAction` orada bilerek ilkel bir `string`'tir. Hangi eylemlerin
 * sayildigi ve nasil adlandirildigi BU dosyada, kaynagin sahibi modulde yasar.
 *
 * `knowledge.permissions.ts` ile BIREBIR ayni desen; gerekcesi de ayni
 * (ADR-0025): platform bir kayit defteri ve bir sayactir, is semantigi degil.
 * ============================================================================
 *
 * ============================================================================
 * MERKEZI KAYIT DEFTERI YOK — ve bu permission'lardan FARKLI bir karar
 * ============================================================================
 * Permission'larda `PermissionRegistry` var cunku guard, calisma zamaninda
 * "bu permission'i hangi roller tasiyor" sorusunu ARAMAK zorunda. Oran
 * sinirinda boyle bir arama YOKTUR: cagiran eylem adini zaten elinde tasir.
 *
 * Ayrica registry AYNI adin iki kez kaydini bir PROGRAMLAMA HATASI sayar;
 * burada ise ayni kovayi paylasmak MESRU bir tasarim aracidir — yeniden
 * indeksleme `create_note` kovasini BILEREK paylasir (ADR-0029, 2026-08-05
 * notu: "ayri bir kova, onarimi butcesiz bir yan kapiya cevirirdi").
 * ============================================================================
 */

/**
 * Soru sorma — BUTCE turu sinir (ADR-0029 §5).
 *
 * Insan gercekten limite yaklasabilir; sayi normal kullanimi olcer.
 */
export const KNOWLEDGE_ASK_ACTION = 'ask';

/**
 * Not yazma — SIGORTA turu sinir (ADR-0029 §5).
 *
 * Bir insan saatte 60 anlamli not yazamaz; bu rakama ancak bir istemci retry
 * hatasi ya da script ulasir. Sinir normal kullanimi degil KACAK DONGUYU
 * hedefler.
 *
 * **Yeniden indeksleme bu kovayi PAYLASIR** — ayni maliyet profili.
 */
export const KNOWLEDGE_CREATE_NOTE_ACTION = 'create_note';

/**
 * Modulun eylem kumesi.
 *
 * ⚠️ Veritabani artik numaralandiran bir CHECK TASIMAZ (migration `0014`,
 * ADR-0031 §4.2 — Product Owner onayi). Yani yanlis yazilmis bir eylem adini
 * yakalayan TEK sey bu birlesim tipidir. Yeni bir eylem eklerken hem sabiti
 * hem birlesimi guncelle.
 */
export type KnowledgeRateLimitedAction =
  typeof KNOWLEDGE_ASK_ACTION | typeof KNOWLEDGE_CREATE_NOTE_ACTION;
