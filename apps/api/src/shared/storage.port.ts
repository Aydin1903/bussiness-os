import { type Readable } from 'node:stream';

/** DI token'i. */
export const STORAGE_PORT = Symbol('STORAGE_PORT');

/**
 * Nesne deposu — saglayici-bagimsiz port (ADR-0009, ADR-0037 §5.1).
 *
 * ============================================================================
 * ⚠️ BU PORT YENI DEGIL — ADR-0009 ONU 2026-07-20'DE KARARA BAGLADI
 * ============================================================================
 * O ADR'nin durumu acikca soyleydi: _"Kabul edildi (soyutlama) · Saglayici
 * secimi ACIK"_, yeniden gozden gecirme kosulu _"production saglayicisi
 * secilirken"_. ADR-0037 o kosulu cekti: saglayici **Cloudflare R2**dir ve bu
 * dosya portun ILK IMPLEMENTASYONUDUR.
 *
 * Yeni olan sey soyutlama degil, (a) saglayici secimi ve (b) portun ilk gercek
 * tuketicisi.
 *
 * ============================================================================
 * NEDEN `shared/` — TEK TUKETICISI OLMASINA RAGMEN
 * ============================================================================
 * "Once modulde dursun, ikinci tuketici cikinca tasiriz" savunulabilir bir
 * itirazdir ve burada YANLISTIR:
 *
 *   - `EmailPort` da `shared/` altindadir ve tek tuketicisi vardir (Identity).
 *     Yerlesim TUKETICI SAYISIYLA degil, PORTUN NE OLDUGU ile belirlenir:
 *     saglayici degistirilebilir bir DIS YETENEK `shared/` + `infrastructure/`
 *     ikilisine aittir.
 *   - ADR-0009 bu portu PLATFORM SEVIYESINDE karara bagladi ve iki modul daha
 *     onu talep edecek (Teklif/Fatura'nin uretecegi PDF, IK'nin ozluk dosyasi).
 *   - Faz 4'un dersi TERS yondeydi: Knowledge port'lari ICINDE tuttu ve
 *     ADR-0031 onlari disari tasimak zorunda kaldi.
 *
 * ⚠️ Karsit ornek AYNI MODULDE duruyor ve ayrimi gorunur kiliyor:
 * `TextExtractorPort` modulun ICINDE kalir (ADR-0037 §6.2) cunku metin cikarimi
 * bir PLATFORM yetenegi degildir — bugun yalnizca Belge'nin isidir.
 *
 * ============================================================================
 * BILEREK MINIMAL — S3-UYUMLU ORTAK PAYDA
 * ============================================================================
 * Uc metot. Cok parcali yukleme, yasam dongusu politikalari, olay
 * tetikleyicileri, imzali URL uretimi — hicbiri arayuzde YOKTUR. ADR-0009 bunu
 * bilinen bir bedel olarak yazdi: _"port, S3-uyumlu API'lerin ortak paydasini
 * temsil eder; saglayiciya ozgu gelismis ozellikler soyutlamanin disinda kalir
 * ve altyapi tarafinda ayrica yonetilir."_
 *
 * ⚠️ IMZALI (presigned) URL BILINCLI OLARAK YOK (ADR-0037 §5.4). Eklemek,
 * belge erisimini ADR-0025'in policy engine'inden cikarip BIR DIZEYE devretmek
 * olurdu; o dize bir sohbete yapistirildiginda izin sistemi devre disi kalir.
 * Tenant izolasyonu da ayni dizeye devredilirdi — bugun iki bagimsiz dayanagi
 * var (RLS + anahtardaki `tenantId`).
 * ============================================================================
 */
export interface StoragePort {
  /**
   * Nesneyi YAZAR (varsa uzerine yazar).
   *
   * ⚠️ CAGIRAN AYNI ANAHTARI IKI KEZ KULLANMAZ (ADR-0037 §5.2): her yukleme
   * YENI bir anahtar uretir. Uzerine yazmak (a) nesne depolarinin
   * okuma-sonrasi-yazma tutarliligina, (b) araya giren CDN/tarayici
   * onbelleklerine guvenmek demektir — ikisi de SESSIZ yanlis uretir:
   * kullanici yeni dosyayi yukler, eskisini indirir ve bunu FARK ETMEZ.
   *
   * Bu port yine de `put` semantigini korur: idempotentlik cagiranin degil,
   * anahtar uretiminin garantisidir.
   */
  put(input: { key: string; body: Buffer; contentType: string }): Promise<void>;

  /**
   * Nesneyi AKIS olarak dondurur.
   *
   * ⚠️ `Buffer` DEGIL `Readable`: 20 MB'lik bir dosyayi bellege alip oradan
   * yazmak, es zamanli indirmelerde sunucu bellegini dogrudan istek sayisiyla
   * carpar. Akis, sabit bellekte calisir.
   *
   * Nesne yoksa `StorageFailedError` firlatir — `null` DONMEZ. Gerekce: bu
   * durum "bulunamadi" degil, IKI DOGRULUK KAYNAGI ARASINDAKI TUTARSIZLIKTIR
   * (DB satiri var, nesne yok). Kullanicinin istegi DOGRUYDU; hata sunucu
   * tarafindadir ve 502 ile bildirilir.
   */
  get(key: string): Promise<Readable>;

  /**
   * Nesneyi SILER.
   *
   * ⚠️ OLMAYAN BIR ANAHTARI SILMEK HATA DEGILDIR. Silme yolu (ADR-0037 §5.3)
   * once DB satirini kaldirir, sonra nesneyi; bir onceki denemede nesne zaten
   * silinmis olabilir ve bu durumda ikinci cagri BASARILI sayilir. Aksi halde
   * onarilamaz bir kayit temizligi, kendi yarim kalmis izinden dolayi surekli
   * hata verirdi.
   */
  delete(key: string): Promise<void>;
}

/**
 * Nesne deposu islemi basarisiz oldu (ADR-0037 §9).
 *
 * ============================================================================
 * ⚠️ TEK TIP — "ULASILAMADI" ILE "NESNE YOK" AYRI TIPLER DEGIL
 * ============================================================================
 * Ikisi farkli SEBEPLERDIR ama:
 *   - ikisi de istemcinin DOGRU bir istegine karsi SUNUCU tarafinda olusur,
 *   - ikisinde de dogru HTTP kodu 502'dir,
 *   - ikisinde de kullanicinin yapabilecegi sey AYNIDIR.
 *
 * Ayrim GOVDE METNINDEDIR, HTTP kodunda degil. Iki ayri tip, filtreye ikinci
 * bir dal ve modul disina sizan bir siniflandirma eklerdi — karsiliginda
 * kullanici icin hicbir sey degistirmeden.
 *
 * ⚠️ Bu hata `DisclosableProblem` ile ISARETLENIR (§9): govdesi ELLE
 * yazilmistir, saglayicinin mesajini TASIMAZ. Isaretsiz birakilsaydi global
 * filtre onu "Beklenmeyen bir hata olustu."ya cevirirdi ve kullanici dosyanin
 * KAYDEDILMEDIGINI ogrenemezdi.
 */
export class StorageFailedError extends Error {
  readonly code = 'STORAGE_FAILED';

  constructor(reason: string) {
    super(`Nesne deposu islemi basarisiz: ${reason}`);
    this.name = 'StorageFailedError';
  }
}

/**
 * ADR-0009'un anahtar duzeni — TEK yerde uretilir.
 *
 * ```
 * tenants/<tenantId>/<module>/<resourceId>/<uuid>-<temizlenmis-ad>
 * ```
 *
 * ============================================================================
 * ⚠️ `tenantId` ANAHTARIN ONUNDE VE BU BIR SUSLEME DEGIL
 * ============================================================================
 * Nesne deposunda RLS YOKTUR. Tenant izolasyonunun oradaki TEK mekanik
 * dayanagi bu duzendir. Bu yuzden:
 *
 *   1. Anahtar HER ZAMAN veritabanindan okunur; istemciden gelen bir anahtarla
 *      ASLA nesne okunmaz (aksi halde bir tenant, digerinin anahtarini tahmin
 *      ederek okuyabilirdi),
 *   2. Uretim TEK BIR FONKSIYONDADIR — iki yerde kurulsaydi biri onegi
 *      unuttugunda hata SESSIZ olurdu: dosya yuklenir, indirilir, calisir; yalnizca
 *      izolasyon garantisi kaybolur ve hicbir test kirmizi yanmaz.
 *
 * ⚠️ `<module>` segmenti bugun DAIMA `documents`. ADR-0009 onu duzene koydu ve
 * ilk kez IKINCI bir modul `StoragePort`u kullandiginda gercekten islevsel
 * olacak (Teklif/Fatura'nin uretecegi PDF) — o gun ADR-0037 §5.2 yeniden
 * okunur.
 *
 * @param uniqueSuffix her yukleme icin YENI uretilmis bir kimlik (§5.2 — ayni
 * anahtarin uzerine yazilmaz).
 */
export function buildStorageKey(input: {
  tenantId: string;
  module: string;
  resourceId: string;
  uniqueSuffix: string;
  filename: string;
}): string {
  return [
    'tenants',
    input.tenantId,
    input.module,
    input.resourceId,
    `${input.uniqueSuffix}-${sanitizeFilename(input.filename)}`,
  ].join('/');
}

/**
 * Dosya adini anahtarda GUVENLI hale getirir.
 *
 * ⚠️ Bu, KULLANICIYA GOSTERILEN adi DEGISTIRMEZ — o `original_filename`
 * kolonunda oldugu gibi saklanir (Turkce karakterler, bosluklar dahil). Burada
 * temizlenen yalnizca ANAHTARDIR.
 *
 * Neden gerekli: `/` anahtarda bir dizin ayiracidir ve dosya adindaki bir `/`
 * karakteri, nesneyi BEKLENEN ONEKIN DISINA yazabilirdi — yani §5.2'nin
 * izolasyon garantisini deler. `..` ayni sinifta.
 *
 * Beyaz liste yaklasimi (neyin YASAK oldugunu saymak yerine neyin SERBEST
 * oldugunu saymak): ASCII harf/rakam, nokta, tire, alt tire. Geri kalan her sey
 * tireye doner.
 */
function sanitizeFilename(filename: string): string {
  const cleaned = filename
    .normalize('NFKD')
    .replace(/[^\w.-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[.-]+/, '');

  // Tumuyle temizlenip bosalan bir ad (ornegin yalnizca Cince karakterler)
  // anahtari bozuk birakirdi; `resourceId` zaten kimligi tasiyor.
  return cleaned === '' ? 'dosya' : cleaned.slice(0, MAX_KEY_FILENAME_CHARS);
}

/**
 * Anahtardaki ad parcasinin ust siniri.
 *
 * S3-uyumlu depolarda anahtar siniri 1024 bayttir; onek (`tenants/<uuid>/
 * documents/<uuid>/<uuid>-`) ~120 karakter tutar. 180 karakterlik bir ad
 * parcasi sinirin cok altinda kalir ve uzun dosya adlarini da taninir birakir.
 */
const MAX_KEY_FILENAME_CHARS = 180;
