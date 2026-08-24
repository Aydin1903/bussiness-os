/**
 * Denetim kaydi yazma port'u (ADR-0043 §6).
 *
 * ============================================================================
 * NEDEN `shared/` ALTINDA
 * ============================================================================
 * `clock.port.ts`in yorumu bunu YILLAR ONCE ongormustu: _"her modul ayni
 * sozlesmeye ihtiyac duyar — Identity, AUDIT ve her is modulu."_ Bir modul
 * icinde tanimlansaydi, diger moduller ya kopyalamak ya da o modulun internal
 * kodunu import etmek zorunda kalirdi; ikincisi ARCHITECTURE 6.1 geregi
 * yasaktir.
 *
 * CLAUDE.md: `shared/` FRAMEWORK'SUZDUR. Bu dosya bir INTERFACE'tir; NestJS
 * isaretlemesi adapter tarafinda (`platform/audit/infrastructure/`) yapilir.
 *
 * ============================================================================
 * ⚠️ BU SOZLESMEDE BIR "DEGER" ALANI YOKTUR — VE EKLENMEYECEKTIR
 * ============================================================================
 * `before`, `after`, `oldValue`, `newValue`, `payload`, `details`: hicbiri yok.
 * Tasinan sey yalnizca HANGI ALANIN degistigidir.
 *
 * Gerekce ADR-0043 §6.5'te ve uc maddedir:
 *
 *   1. ⚠️ Ilk tuketici IK moduludur ve orada degisen alanlardan biri MAAStir.
 *      Eski maasi denetim kaydina yazmak, maas verisini IKINCI BIR TABLOYA
 *      kopyalamak demektir ve ADR-0043 §4.2'nin uc katmanli izolasyonunu
 *      (ayri tablo + ayri izin + katkici yoklugu) TEK HAMLEDE deler.
 *   2. Bir gun bir alan yanlislikla hassas veri tasirsa (§3'un siniri), deger
 *      saklayan bir denetim kaydi onu KALICI OLARAK cogaltir.
 *   3. ⚠️ Ve maas icin BILGI KAYBI YOKTUR: eski deger `hr.compensation_records`
 *      ekleme-yalniz defterinde zaten durur (§6.2).
 *
 * Bu, `ai-usage-recorder.port.ts`in kurdugu disiplinin IKINCI uygulamasidir:
 * _"ICERIK TASINMAZ — YALNIZCA OLCU."_
 *
 * ⚠️ TIP TEK BASINA YETMEZ (TypeScript runtime'da yoktur). Sinir UC yerde
 * ayrica kilitlidir: `toAuditRows` yalnizca bildigi alanlari kopyalar
 * (birim testi), tabloda deger kolonu yoktur (entegrasyon testi kolon
 * kumesini SABITLER), ve adapter yalnizca o kolonlari yazar.
 *
 * ============================================================================
 * ⚠️ AKTOR VE TENANT BURADAN GECMEZ
 * ============================================================================
 * `actorUserId` ve `tenantId` bu arayuzde YOKTUR ve bilerek yoktur: cagirandan
 * alinsalardi cagiran YANLIS bir aktor yazabilirdi ve denetim kaydinin butun
 * degeri bu tek noktaya baglidir. Ikisi de adapter tarafindan istegin
 * DOGRULANMIS baglamindan okunur (DEVELOPMENT_RULES 4.5 — ayni disiplin
 * `tenant_id` icin zaten yururlukte).
 * ============================================================================
 */

/** DI token'i. Symbol kullanildi: string token'lar sessizce cakisabilir. */
export const AUDIT_RECORDER = Symbol('AUDIT_RECORDER');

/**
 * Denetlenen fiil — PLATFORM sozlugu, modul sozlugu DEGIL.
 *
 * Bir modul dorduncu bir fiil getiremez; getirmesi gereken gun tartisilacak
 * sey bu tip degil, o KARARDIR.
 */
export type AuditAction = 'created' | 'updated' | 'deleted';

/**
 * Tek bir degisiklik olayinin tarifi.
 *
 * ⚠️ `fieldNames` YALNIZCA `updated` icin anlamlidir ve o durumda BOS
 * OLMAMALIDIR. `created`/`deleted` icin bos dizi verilir — bir kaydin
 * olusturulmasi "tek bir alanin" olayi degildir.
 */
export interface AuditEntry {
  /** `<modul>.<kaynak>` — ornek: `hr.employee`. */
  readonly resourceType: string;
  readonly resourceId: string;
  readonly action: AuditAction;
  /**
   * Degisen alanlarin ADLARI — ⚠️ DEGERLERI DEGIL.
   *
   * Her ad AYRI BIR SATIR olur; ayni islemin satirlari ayni `occurredAt`
   * damgasini paylasir ve boyle gruplanir (ADR-0043 §6.4).
   */
  readonly fieldNames: readonly string[];
}

export interface AuditRecorder {
  /**
   * Denetim kaydini yazar.
   *
   * ==========================================================================
   * ⚠️ CAGIRANIN TRANSACTION'I ICINDE CALISIR — VE BU, KARARIN KENDISIDIR
   * ==========================================================================
   * Kendi transaction'ini ACMAZ (MT §13.3 kural 2) ve asenkron DEGILDIR.
   * Sonucu: denetim kaydi yazilamazsa DEGISIKLIK DE YAZILMAZ — ikisi ayni
   * commit'tedir.
   *
   * Kuyruk/outbox uzerinden yazmak ADR-0043 §6.8'de REDDEDILDI:
   * kaybolabilen bir denetim kaydi, HIC OLMAYANDAN KOTUDUR — cunku yanlis
   * bir guven uretir. Bedeli durustce: denetim yazimi bir yazma yolunu
   * bloklayabilir ve basarisiz olursa kullanicinin islemi de basarisiz olur.
   *
   * ⚠️ `fieldNames` BOS bir `updated` kaydi HICBIR SATIR YAZMAZ (hata da
   * vermez): degismeyen bir sey icin kayit tutulmaz. ADR-0039'un fiziksel
   * sayim karariyla ayni sekil — fark sifirsa satir yazilmaz.
   */
  record(entry: AuditEntry): Promise<void>;
}
