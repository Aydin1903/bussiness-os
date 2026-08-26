/**
 * Band ICI esitlik kirma sinyalleri — `affinity` ve `lot` (ADR-0049).
 *
 * ============================================================================
 * ⚠️ NEDEN VAR — KAYIT SIRASI BIR SECIM OLCUTU OLMUSTU
 * ============================================================================
 * ADR-0048'in olcumu ADR-0042'nin **T1** tetikleyicisini atesledi: alti
 * yapisal kaynagin ALTISI da alarm bandindaydi (`0.95`) ve `selectFragments`
 * beraberligi `Array.prototype.sort`un KARARLILIGINA birakiyordu — yani
 * kazanani `app.module.ts`teki MODUL IMPORT SIRASI belirliyordu.
 *
 * Kazanan uclu (`crm-pipeline`, `inventory-stock`, `invoicing-pipeline`)
 * kayit sirasindaki ILK UCTU; kaybeden uclu (`appointment-schedule`,
 * `project-status`, `finance-cashflow`) SON UC.
 *
 * ⚠️ Duzeltilen sey ne tabanin BUYUKLUGU ne skorun OLCEGIDIR (ADR-0049
 * §Baglam: ikisi de dogru calisiyordu); duzeltilen sey tabanin SECIM
 * OLCUTUDUR.
 *
 * ============================================================================
 * ⚠️ IKI SINYAL, IKI FARKLI IDDIA — VE IKISI KARISTIRILMAMALIDIR
 * ============================================================================
 *   `affinity` -> ⚠️ LIYAKAT. Parca soruya ne kadar cevap veriyor?
 *   `lot`      -> ⚠️ LIYAKAT DEGIL, ADALET. Hicbir sey ayirt etmiyorsa
 *                 sistematik acligi kiran, soruya bagli KARARLI bir kur'a.
 *
 * Ikisinin ayri tutulmasi bir uslup tercihi degil: `lot`u "liyakat" diye
 * sunmak, keyfi bir sirayi ILKELI gostermek olurdu — ve ADR-0049 bunu
 * "durust bir kur'adan DAHA KOTU" diye kaydetti.
 * ============================================================================
 */

/**
 * Soru token'i olarak SAYILMAYAN kelimeler.
 *
 * ⚠️ YALNIZCA soru kaliplari ve baglaclar. Alan kelimeleri (`stok`, `nakit`,
 * `randevu`, `teklif`, `proje`) buraya ASLA girmez — girerlerse fonksiyon tam
 * olarak ayirt etmesi gereken seyi ayirt edemez hale gelir.
 *
 * ⚠️ Uzunlugu 3'ten kisa token'lar zaten elenir (`ne`, `mi`, `bu`, `su`), yani
 * bu liste yalnizca UZUN ama TASIYICI OLMAYAN kelimeleri kapsar.
 */
const QUESTION_STOPWORDS: ReadonlySet<string> = new Set([
  'acaba',
  'anlat',
  'bana',
  'bilgi',
  'bir',
  'bize',
  'cok',
  'daha',
  'gibi',
  'hangi',
  'kadar',
  'kimler',
  'lutfen',
  'nasil',
  'nedir',
  'neler',
  'nerede',
  'olan',
  'oluyor',
  'ozetle',
  'sonra',
  'soyle',
  'var',
  'yok',
  'icin',
  'ile',
]);

/** Bir token'in sayilmasi icin gereken en kisa uzunluk. */
const MIN_TOKEN_LENGTH = 3;

/**
 * Onek eslesmesi icin gereken en kisa uzunluk.
 *
 * ⚠️ 4'un altina inilemez: `bir` ↔ `birim`, `sat` ↔ `satis` gibi eslesmeler
 * gurultu uretirdi. 4'te `stok` ↔ `stoktaki` ve `not` gibi kisa kelimeler
 * yalnizca TAM esitlikle eslesir.
 */
const MIN_PREFIX_LENGTH = 4;

/**
 * Metni karsilastirilabilir token'lara cevirir.
 *
 * ⚠️ NORMALIZASYON IKI TARAFA DA UYGULANIR ve bu sart: kullanici `"akışı"`
 * yazar, katkicinin urettigi metin `"akisi"` der (kod tabani ASCII yazilmis).
 * Aksan soyulmazsa bu ikisi HIC eslesmezdi ve `affinity` sessizce her zaman
 * 0 donerdi — yani mekanizma calisiyor gorunup hicbir sey yapmazdi.
 */
function tokenize(text: string): string[] {
  return (
    text
      .normalize('NFD')
      // ⚠️ Birlestirici isaretler (U+0300–U+036F) soyulur: `ş` -> `s + cedil`
      // -> `s`, `ğ` -> `g`, `ö` -> `o`. Kacis dizisi kullanildi — ham
      // birlestirici karakterler kaynak dosyada gorunmez ve bir editor/format
      // adiminda SESSIZCE kaybolabilirdi.
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      // ⚠️ `ı` NFD ile AYRISMAZ (tek kod noktasidir) ve `toLowerCase` onu
      // korur; elle esleniyor. `İ` ise NFD'de `I + U+0307` olur, yani ustteki
      // satir onu zaten `I`ya indirmis olur.
      .replace(/ı/g, 'i')
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= MIN_TOKEN_LENGTH)
  );
}

/** Iki token ayni koke mi isaret ediyor? (Turkce EKLEMELI bir dildir.) */
function tokensMatch(questionToken: string, contentToken: string): boolean {
  if (questionToken === contentToken) {
    return true;
  }

  const [shorter, longer] =
    questionToken.length <= contentToken.length
      ? [questionToken, contentToken]
      : [contentToken, questionToken];

  return shorter.length >= MIN_PREFIX_LENGTH && longer.startsWith(shorter);
}

/**
 * Parcanin SORUYA yakinligi — `[0, 1]` (ADR-0049 §2).
 *
 * ============================================================================
 * ⚠️ SORUNUN KAPSANMASI OLCULUR, ICERIGIN DEGIL
 * ============================================================================
 * Payda SORU token'larinin sayisidir. Tersi (icerigin kapsanmasi) olsaydi
 * KISA parcalar, oran (`icerigin kaci soruda geciyor`) yuksek ciktigi icin
 * kazanirdi; toplam eslesme sayisi olsaydi UZUN parcalar yalnizca daha cok
 * kelime tasidiklari icin kazanirdi. Ikisi de olculmek isteneni olcmez:
 * soru soruldu, cevabi kim tasiyor?
 *
 * ============================================================================
 * ⚠️ BU BIR ARAMA MOTORU DEGILDIR — VE OLMASI DA GEREKMIYOR
 * ============================================================================
 * Govdeleme yok, IDF yok, es anlamli yok; `stok` ↔ `stokholm` gibi yanlis
 * eslesmeler MUMKUNDUR. Kabaligi kabul edilebilir cunku YETKISI bir bandin
 * icidir (ADR-0049 §2.2):
 *
 *   * bir bandi ASLA ezemez — 0.75'lik saglikli bir satir, kelimeleri soruya
 *     benziyor diye 0.95'lik bir alarmi GECEMEZ;
 *   * sifir donerse hicbir sey bozulmaz — karar `lot`a duser;
 *   * bir SKOR degildir, `AskResult`e ACILMAZ (yalnizca loga yazilir).
 *
 * ⚠️ ADR-0011'in FTS borcunu KAPATMAZ: burada yapilan sey arama degil, ayni
 * banddaki iki adaydan birini secmektir.
 */
export function questionAffinity(question: string, content: string): number {
  const questionTokens = tokenize(question).filter((token) => !QUESTION_STOPWORDS.has(token));

  if (questionTokens.length === 0) {
    // ⚠️ Tasiyici kelimesi olmayan bir soru ("Nasil gidiyor?") hicbir kaynagi
    // digerine tercih ettirmez. 0 donmek DOGRU cevaptir: karar `lot`a duser.
    return 0;
  }

  const contentTokens = tokenize(content);
  const matched = questionTokens.filter((questionToken) =>
    contentTokens.some((contentToken) => tokensMatch(questionToken, contentToken)),
  );

  // ⚠️ Ayni soru token'i iki kez gecerse iki kez sayilmasin diye BENZERSIZ
  // token'lar uzerinden olculur; aksi halde "stok stok stok" yazan bir soru
  // orani sisirirdi.
  const uniqueQuestion = new Set(questionTokens);
  const uniqueMatched = new Set(matched);

  return uniqueMatched.size / uniqueQuestion.size;
}

/** FNV-1a 32-bit — kriptografik DEGIL, yalnizca dagitim icin. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    // 32-bit FNV asal carpani; `Math.imul` tasmayi 32 bitte tutar.
    hash = Math.imul(hash, 0x01000193);
  }

  // İsaretsiz 32-bit'e cevrilir: `>>> 0` olmadan deger negatif olabilir ve
  // siralama okunurken kafa karistirirdi.
  return hash >>> 0;
}

/**
 * ⚠️ KARARLI KUR'A — VE BU BIR LIYAKAT OLCUSU DEGILDIR (ADR-0049 §3).
 *
 * ============================================================================
 * ⚠️ NE IDDIA EDIYOR, NE ETMIYOR
 * ============================================================================
 * Genel bir soruda ("Sirkette neler oluyor?") hicbir yapisal parcanin soruyla
 * ortak kelimesi olmayabilir; `affinity` alti kaynak icin de 0 doner ve
 * esitlik SURER. O anda birinin secilmesi gerekir.
 *
 * Bu fonksiyonun TEK iddiasi, o secimin **sistematik olarak ayni kaynaklari
 * kayirmamasidir**. Hangi ucunun kazandigi ANLAMSIZDIR — yalnizca ADILDIR.
 * ⚠️ Kodu okuyan biri bunu "alaka olcusu" sanmamalidir.
 *
 * ============================================================================
 * ⚠️ NEDEN `Math.random` DEGIL — VE NEDEN ALFABETIK DEGIL
 * ============================================================================
 *   `Math.random`  -> ayni soru farkli zamanlarda FARKLI cevap verirdi:
 *                     ADR-0048'in olcumu TEKRAR URETILEMEZ olurdu ve bir hata
 *                     ayiklama oturumu imkansizlasirdi.
 *   alfabetik      -> deterministik ama SABIT: yine HEP AYNI ucu kazandirirdi.
 *                     Bir keyfi sabit sirayi baska bir keyfi sabit sirayla
 *                     degistirmek, kusuru adini degistirerek korumaktir.
 *
 * Soru girdinin parcasi oldugu icin farkli sorular farkli kazananlar uretir;
 * AYNI soru ise her zaman ayni cevabi verir.
 *
 * ⚠️ Ayrac (` `) sart: onsuz `("ab", "c")` ile `("a", "bc")` ayni dizeyi
 * uretir ve iki farkli durum ayni kur'ayi cekerdi.
 */
export function selectionLot(question: string, source: string): number {
  return fnv1a(`${question} ${source}`);
}
