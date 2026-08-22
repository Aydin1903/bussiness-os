/** DI token'i. Symbol kullanildi: string token'lar sessizce cakisabilir. */
export const PDF_PORT = Symbol('PDF_PORT');

/**
 * PDF uretimi — saglayici-bagimsiz port (ADR-0041 §6.1).
 *
 * ============================================================================
 * ADR-0009'DAN (StoragePort) BU YANA `shared/`'A EKLENEN ILK YENI PORT
 * ============================================================================
 * Yerlesim olcutu `storage.port.ts`in kendi yazdigi cumledir:
 *
 *     "yerlesim TUKETICI SAYISIYLA degil, PORTUN NE OLDUGU ile belirlenir:
 *      saglayici degistirilebilir bir DIS YETENEK `shared/` + `infrastructure/`
 *      ikilisine aittir."
 *
 * PDF uretimi tam olarak boyledir ve ikinci tuketici zaten gorunuyor (IK'nin
 * belge ciktilari, 9. modul).
 *
 * ⚠️ KARSIT ORNEK AYNI PROJEDE DURUYOR ve ayrimi gorunur kilar:
 * `TextExtractorPort` Belge modulunun ICINDE kalir (ADR-0037 §6.2) cunku metin
 * cikarimi bir PLATFORM yetenegi degildir — bugun yalnizca Belge'nin isidir.
 * PDF *uretimi* ise "belgeyi kagida basmak"tir ve modulden bagimsizdir.
 *
 * ============================================================================
 * ⚠️ BU PORT "TEKLIF" KELIMESINI BILMEZ — VE BUNU BIR BIRIM TESTI KILITLER
 * ============================================================================
 * `PdfDocumentModel` bir IZDUSUMDUR, domain entity'si DEGILDIR. Port
 * `SalesDocument`i tanimaz; taniyorsa `shared/` bir IS MODULUNU bilirdi
 * (Mutlak Kural 6).
 *
 * Somut sonucu asagidaki alan adlarindadir: `title` bir DIZEDIR ("TEKLIF" /
 * "FATURA" modulun verdigi metindir), `meta` bir ETIKET-DEGER listesidir
 * ("Gecerlilik" / "Vade" gibi alan adlari da modulden gelir). Port bunlarin
 * ANLAMINI yorumlamaz, yalnizca DIZER.
 *
 * ⚠️ ADR-0035'in `week-grid` dersi — bilesen kendi alanini bilmez — bu kez
 * SUNUCU tarafinda. Orada bir React bileseni "randevu" kelimesini bilmiyordu.
 *
 * ============================================================================
 * ⚠️ BILEREK MINIMAL — TEK METOT
 * ============================================================================
 * Sayfa boyutu secimi, sablon secimi, yazi tipi ailesi, logo, filigran,
 * parola koruma, imza — HICBIRI arayuzde YOKTUR. ADR-0041 §12 sablon
 * ozellestirmesini kapsam disi birakti ve bu port o karari TASIR: bir sablon
 * parametresi eklemek, olmayan bir ozelligin arayuzunu bugunden cizmek olurdu.
 *
 * ============================================================================
 * ⚠️ URETILEN PDF SAKLANMAZ (§6.3) — bu port bir DEPOLAMA yuzeyi DEGILDIR
 * ============================================================================
 * `render` yalnizca bayt uretir; nereye gidecegi cagirani ilgilendirir ve bugun
 * cevap "dogrudan HTTP yanitina"dir. `StoragePort` bu modulde KULLANILMAZ.
 *
 * Gerekce hatanin seklidir: saklamak IKINCI BIR DOGRULUK KAYNAGI + ADR-0037'nin
 * HALA ACIK yetim nesne borcu demekti; uretmenin tek bedeli SABLON KAYMASIDIR
 * ve bugun sablon TEKTIR. Ilk sablon degisikligi geldigi gun saklamaya gecilir
 * ve o yol TEK YONLUDUR.
 */
export interface PdfPort {
  /**
   * Izdusumu PDF baytlarina cevirir.
   *
   * @throws {PdfRenderFailedError} Yazi tipi yuklenemedi, akis coktu ya da
   * uretim beklenmedik bicimde basarisiz oldu. ⚠️ `null` DONMEZ: bos bir
   * `Buffer` "gecerli ama bos PDF" ile "uretim coktu"yu ayirt edilemez kilardi.
   */
  render(document: PdfDocumentModel): Promise<Buffer>;
}

/** Tek bir satir kalemi — TOPLAMI CAGIRAN hesaplar (§1.3). */
export interface PdfLineItem {
  readonly description: string;
  /** Kanonik ondalik dize — `number` DEGIL (`money.ts` / `quantity.ts` karari). */
  readonly quantity: string;
  readonly unit: string | null;
  readonly unitPrice: string;
  /** Yuzde olarak; `"20.00"`. Bir SAYIDIR, bir kural degil (§1.8). */
  readonly taxRate: string;
  /** ⚠️ CAGIRAN hesaplar: port ARITMETIK YAPMAZ, yalnizca dizer. */
  readonly lineTotal: string;
}

/** Baslik alani — etiketi de degeri de MODUL verir. */
export interface PdfMetaField {
  readonly label: string;
  readonly value: string;
}

/**
 * PDF'e basilacak her sey.
 *
 * ⚠️ Hicbir alan bir IS KAVRAMI adi tasimaz (`quoteNumber`, `validUntil`
 * gibi). Tasisaydi port iki belge turunu de bilmek zorunda kalirdi ve ucuncu
 * bir tur eklendiginde DEGISIRDI.
 */
export interface PdfDocumentModel {
  /** ⚠️ Modulun verdigi metin — port bunun "teklif" oldugunu BILMEZ. */
  readonly title: string;
  /** Belge numarasi; taslakta `null` olabilir (§1.6). */
  readonly number: string | null;
  /** Baslik alanlari: tarih, gecerlilik, vade... hepsi etiket-deger. */
  readonly meta: readonly PdfMetaField[];
  /** ⚠️ Belgeye BASILAN musteri adi — dizinden okunan "bugunku ad" DEGIL (§1.5). */
  readonly customerName: string;
  /** Musteri alti bilgileri (varsa): kisi adi vb. */
  readonly customerDetails: readonly string[];
  readonly currency: string;
  readonly lines: readonly PdfLineItem[];
  /** Ara toplam / vergi / genel toplam — etiketleri de MODUL verir. */
  readonly totals: readonly PdfMetaField[];
  readonly notes: string | null;
  /**
   * Sayfa altina basilacak uyari.
   *
   * ⚠️ ADR-0041 §12'nin ARAYUZ karsiligi burada da tekrarlanir: uretilen
   * "fatura" BIR PDF BELGESIDIR, MALI BELGE DEGILDIR. Belirsiz birakmak,
   * kullanicinin yasal yukumlulugunu yerine getirdigini SANMASINA yol acardi.
   *
   * Metnin KENDISI modulden gelir — port ne yazacagini bilmez.
   */
  readonly footnote: string | null;
}

/**
 * PDF uretimi basarisiz oldu (ADR-0041 §10).
 *
 * ============================================================================
 * ⚠️ BU HATA `DisclosableProblem` ILE ISARETLENIR
 * ============================================================================
 * Gerekce ADR-0037'nin `StorageFailedError`iyla ayni satirdandir: kullanici
 * DOGRU bir istek yapti, hata SUNUCUDADIR ve TEKRAR DENEMEK anlamlidir.
 * Maskelenirse ekranda "Beklenmeyen bir hata" yazar ve kullanici belgesinin
 * KAYDEDILDIGINI (ama basilamadigini) ogrenemez.
 *
 * ⚠️ Govde ELLE yazilir; kutuphanenin mesajini TASIMAZ.
 */
export class PdfRenderFailedError extends Error {
  readonly code = 'PDF_RENDER_FAILED';

  constructor(reason: string) {
    super(`PDF uretilemedi: ${reason}`);
    this.name = 'PdfRenderFailedError';
  }
}
