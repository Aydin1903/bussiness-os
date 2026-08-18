import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';

import { type TextExtractorPort } from '../application/text-extractor.port';
import { DOCX_MIME_TYPE, type DocumentMimeType } from '../domain/document.entity';

/**
 * `TextExtractorPort`'un PDF + DOCX implementasyonu (ADR-0037 §6.2).
 *
 * ============================================================================
 * KUTUPHANE KULLANMAK BURADA CELISKI DEGIL — RED GEREKCESI UYMUYOR
 * ============================================================================
 * Proje iki kez agir kutuphane reddetti: `recharts` (ADR-0031) ve FullCalendar
 * (ADR-0035 §7). Gerekceler tek tek bakildiginda BURAYA UYMUYOR:
 *
 *   "Yuzeyin %90'i kullanilmayacak"  -> ❌ yuzeyin TAMAMI kullaniliyor:
 *                                        bir dosya girer, bir metin cikar.
 *   "Tasarim dili catisir"           -> ❌ ARAYUZU YOK; sunucuda calisir.
 *   "`--accent` override'i islemez"  -> ❌ ilgisiz.
 *   "Bagimlilik yuzeyi buyuk"        -> ✅ GECERLI — bu yuzden PORT ARKASINDA.
 *
 * Bir PDF ayristiricisini kendimiz yazmak ciddi bir onerinin konusu degildir.
 *
 * ============================================================================
 * ⚠️ SECIM ADR'DEN SAPTI — VE SEBEP UYGULAMADA ORTAYA CIKTI
 * ============================================================================
 * ADR-0037 §6.2 PDF icin `pdfjs-dist`i "bugunku en guclu aday" diye andi ama
 * secimi bir ADAPTER ayrintisi olarak birakti ve olcutu BAGLAYICI yazdi: _"saf
 * JavaScript, native binding yok, aktif bakim, buffer'dan okuyabilme."_
 *
 * Uygulamada besinci bir olcut ortaya cikti: **CommonJS uyumlulugu**. Bu API
 * `module: CommonJS` derleniyor (`packages/config/typescript/nest.json`) ve
 * `pdfjs-dist` v4 SALT ESM'dir — `require` edilemez. Secilen `pdf-parse` v2,
 * ayni `pdfjs` motorunu SARMALAYAN ve gercek bir CJS cikti veren pakettir; dort
 * olcutu de karsilar.
 *
 * ⚠️ Bu, ADR'nin yanlislanmasi DEGILDIR: ADR kutuphaneyi karara baglamadi,
 * OLCUTU karara bagladi. Olcut tuttu, aday degisti — ve degisimin tek satirlik
 * olmasi portun ise yaradiginin kanitidir.
 *
 * ============================================================================
 * ⚠️ BOS SONUC HATA DEGILDIR (ADR-0037 §6.3)
 * ============================================================================
 * Taranmis (yalnizca goruntu iceren) bir PDF'ten metin CIKMAZ. Bu adapter o
 * durumda BOS DIZE doner ve exception FIRLATMAZ — dosyada gercekten metin
 * yoktur, bir ariza yoktur.
 *
 * Ayrim korunuyor: **bos sonuc** = "metin yok" (201 + `chunkCount: 0`),
 * **exception** = "dosya okunamadi" (bozuk/sifreli dosya) ve kullaniciya
 * bildirilir.
 */
export class PdfDocxTextExtractorAdapter implements TextExtractorPort {
  async extract(input: { bytes: Buffer; mimeType: DocumentMimeType }): Promise<string> {
    if (input.mimeType === DOCX_MIME_TYPE) {
      return this.#extractDocx(input.bytes);
    }

    return this.#extractPdf(input.bytes);
  }

  async #extractPdf(bytes: Buffer): Promise<string> {
    const parser = new PDFParse({ data: bytes });

    try {
      const result = await parser.getText();
      return normalize(result.text);
    } finally {
      // ⚠️ `destroy()` ZORUNLU: pdfjs motoru arka planda kaynak (worker,
      // tampon) tutar ve birakilmazsa uzun sureli bir surecte SIZINTI olur.
      // `finally` icinde cunku hata yolunda da birakilmali.
      await parser.destroy();
    }
  }

  async #extractDocx(bytes: Buffer): Promise<string> {
    // `extractRawText` bicimlendirmeyi ATAR ve yalnizca metni verir — tam
    // olarak istenen sey: gomulecek olan icerik, gorunumu degil.
    const result = await mammoth.extractRawText({ buffer: bytes });
    return normalize(result.value);
  }
}

/**
 * Cikarilan metni gomulmeye HAZIR hale getirir.
 *
 * ⚠️ Bu bir "guzellestirme" degil, BIR MALIYET KARARIDIR: ayristiricilar
 * sayfa sonlarinda ve tablolarda ardisik bos satirlar/bosluklar uretir. Ham
 * birakilsaydi bunlar `chunkText`in karakter butcesini yer ve AYNI belge DAHA
 * COK PARCA — yani daha cok embedding cagrisi — uretirdi.
 *
 * ⚠️ Satir sonlari KORUNUR (tek satira indirgenmis olarak): `chunkText`
 * paragraf sinirlarini onlardan bulur ve tumuyle duzlestirmek, parcalarin
 * cumle ortasindan bolunmesine yol acardi.
 */
function normalize(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
