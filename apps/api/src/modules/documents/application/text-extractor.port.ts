import { type DocumentMimeType } from '../domain/document.entity';

/** DI token'i. Symbol kullanildi: string token'lar sessizce cakisabilir. */
export const TEXT_EXTRACTOR_PORT = Symbol('TEXT_EXTRACTOR_PORT');

/**
 * Dosyadan duz metin cikaran port (ADR-0037 §6.2).
 *
 * ============================================================================
 * ⚠️ BU PORT `shared/`DA DEGIL — VE BU, `StoragePort`UN TAM TERSI KARARDIR
 * ============================================================================
 * Ayni is icinde iki port yazildi ve IKISI FARKLI YERLERDE yasiyor. Ayrim
 * bilinclidir ve kuralin iki yuzudur:
 *
 *   `StoragePort`       -> `shared/` : bir PLATFORM yetenegi. ADR-0009 onu
 *                          platform seviyesinde karara bagladi ve iki modul
 *                          daha talep edecek (Teklif/Fatura'nin PDF'i, IK'nin
 *                          ozluk dosyasi).
 *
 *   `TextExtractorPort` -> MODULDE   : bugun YALNIZCA Belge'nin isi. `shared/`a
 *                          koymak, Faz 4'un hatasinin TERSINI yapmak olurdu —
 *                          Knowledge port'lari icinde tutup sonra tasimak
 *                          zorunda kalmisti; burada kimsenin kullanmadigi bir
 *                          seyi bugunden kernele koymak olurdu.
 *
 * ⚠️ TETIKLEYICI YAZILI: ikinci bir tuketici cikarsa (Faz 6'nin fatura okumasi)
 * ADR-0031'in yaptigi tasima yapilir — port `shared/`a, adapter
 * `infrastructure/`e. O gune kadar burada kalir.
 *
 * ============================================================================
 * NEDEN PORT — KUTUPHANEYI DOGRUDAN CAGIRMAK YERINE
 * ============================================================================
 * Uc sebep, sirasiyla:
 *
 *   1. **Kutuphane degisecek.** PDF ayristiricilari bu ekosistemde en cok yer
 *      degistiren bagimlilik sinifidir (ESM gecisi, bakim birakma).
 *   2. **OCR ayri bir adapter olacak** (§12 — v2). Bugunku adapter'in yanina
 *      ikinci bir implementasyon gelir; is mantiginda TEK SATIR degismez.
 *   3. **Test edilebilirlik.** Use case'i sinamak icin gercek bir PDF
 *      uretmek gerekmez.
 *
 * ============================================================================
 * ⚠️ BOS SONUC BIR HATA DEGILDIR (ADR-0037 §6.3)
 * ============================================================================
 * Taranmis (yalnizca goruntu iceren) bir PDF'ten metin CIKMAZ — dosyada
 * gercekten metin yoktur. Port bu durumda BOS DIZE doner ve exception
 * FIRLATMAZ; belge normal sekilde kaydedilir, yalnizca parcasi olmaz.
 *
 * Bunun SESSIZ BIR BASARISIZLIGA donusmemesini saglayan sey uc noktanin
 * cevabidir: `chunkCount: 0` acikca doner ve arayuz bunu gorunur kilmak
 * ZORUNDADIR. O cumle yazilmazsa kullanici sozlesmesini yukledigini sanir,
 * aylar sonra aradiginda bulamaz ve sebebini asla ogrenemez.
 */
export interface TextExtractorPort {
  /**
   * Dosyanin duz metnini dondurur.
   *
   * @param input.bytes dosyanin TAMAMI (bellekte — `DOCUMENTS_MAX_FILE_BYTES`
   * ile sinirli).
   * @param input.mimeType ICERIKTEN tespit edilmis tur; adapter hangi
   * ayristiriciyi kullanacagini buradan bilir ve uzantiya BAKMAZ.
   *
   * @returns cikarilan metin; metin yoksa BOS DIZE (hata degil — bkz. sinif
   * yorumu).
   *
   * @throws Ayristirici cokerse (bozuk dosya, sifreli PDF). ⚠️ Bu, bos
   * sonuctan FARKLIDIR: bos sonuc "metin yok", exception "dosya okunamadi"
   * demektir ve ikincisi kullaniciya bildirilmelidir.
   */
  extract(input: { bytes: Buffer; mimeType: DocumentMimeType }): Promise<string>;
}
