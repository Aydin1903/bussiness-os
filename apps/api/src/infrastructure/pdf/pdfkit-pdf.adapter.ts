import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';

import {
  PdfRenderFailedError,
  type PdfDocumentModel,
  type PdfLineItem,
  type PdfMetaField,
  type PdfPort,
} from '../../shared/pdf.port';

/**
 * `PdfPort`in `pdfkit` uygulamasi (ADR-0041 §6.2).
 *
 * ============================================================================
 * NEDEN `pdfkit` — TARAYICI REDDEDILDI
 * ============================================================================
 *   headless Chrome  -> ⚠️ REDDEDILDI. API container'ina ~300 MB'lik bir
 *                       tarayici koymak demektir; bellek profili istek basina
 *                       yuz MB'larla olculur ve dagitim yuzeyi buyur.
 *                       ADR-0035'in FullCalendar reddiyle AYNI SINIF karar.
 *   `pdf-lib`        -> mevcut PDF'leri DEGISTIRMEK icin guclu, sifirdan DIZGI
 *                       icin zayif (metin akisi, tablo, sayfa kirilimi elle).
 *   `pdfkit`         -> SECILEN. Saf JS, tarayici yok, deterministik cikti.
 *
 * ============================================================================
 * ⚠️ TURKCE KARAKTER TUZAGI — VE BU SESSIZ BIR HATADIR
 * ============================================================================
 * `pdfkit`in gomulu standart yazi tipleri (Helvetica ve kardesleri) WinAnsi
 * (Latin-1) kodlamasindadir ve Latin-1'de `g-breve`, `s-cedilla`, noktasiz `i`
 * ve nokta`li` buyuk I YOKTUR.
 *
 * Bir font GOMULMEZSE cikti SESSIZCE bozulur: PDF uretilir, indirilir, acilir —
 * yalnizca MUSTERININ ADI YANLIS YAZILMISTIR. Kusur ancak bir musteri
 * sikayetiyle ogrenilirdi.
 *
 * Bu yuzden bir TTF gomuluyor (DejaVu Sans — tam Latin-Extended kapsami) ve
 * `pdfkit-pdf.adapter.spec.ts` Turkce karakterli bir belgeyi gercekten uretip
 * ciktida o karakterlerin bulundugunu IDDIA EDIYOR.
 *
 * ⚠️ Font bir NPM PAKETINDEN gelir, repoya konmus bir binary'den DEGIL. Sebep
 * dagitimdir: `nest build` TypeScript disindaki varliklari `dist/`e KOPYALAMAZ
 * (nest-cli.json'da `assets` yok), yani repoda duran bir `.ttf` production
 * container'inda BULUNMAZDI — ve hata yine SESSIZ olurdu (PDF ilk kez
 * uretilene kadar). `node_modules` her ortamda vardir.
 *
 * ============================================================================
 * ⚠️ BU ADAPTER "TEKLIF" KELIMESINI BILMEZ
 * ============================================================================
 * Basliklar, alan etiketleri ve dipnot METINLERI `PdfDocumentModel`den gelir.
 * Bu dosyada bir is kavrami adi GECMEZ ve bunu bir birim testi kilitler —
 * ADR-0035'in `week-grid` dersi, sunucu tarafinda.
 */

/** A4, `mm` DEGIL PostScript punto — pdfkit'in birimi budur. */
const PAGE_MARGIN = 50;
const CONTENT_WIDTH = 595.28 - PAGE_MARGIN * 2;

/** Sayfa altinda dipnot icin ayrilan bosluk. */
const BOTTOM_RESERVE = 70;

const FONT_REGULAR = 'body';
const FONT_BOLD = 'body-bold';

/**
 * Tablo kolon genislikleri (toplam = `CONTENT_WIDTH`).
 *
 * ⚠️ Aciklama kolonu ESNEK DEGIL, SABIT: pdfkit satir sarmasini `width`
 * uzerinden yapar ve degisken genislik, sayfa kirilimi hesabini
 * ONGORULEMEZ kilardi.
 */
const COLUMNS = {
  description: 200,
  quantity: 70,
  unitPrice: 85,
  taxRate: 50,
  lineTotal: 90,
} as const;

const ROW_FONT_SIZE = 9;
const ROW_PADDING = 6;

@Injectable()
export class PdfKitPdfAdapter implements PdfPort {
  /**
   * ⚠️ Yol BIR KEZ cozulur ve ORNEK BOYUNCA saklanir.
   *
   * `require.resolve` her cagride dosya sistemine gider; PDF uretimi bir istek
   * yolundadir ve bu, her indirmede odenecek gereksiz bir maliyet olurdu.
   */
  private fontPaths: { regular: string; bold: string } | null = null;

  async render(document: PdfDocumentModel): Promise<Buffer> {
    try {
      return await this.#render(document);
    } catch (error) {
      // ⚠️ Kutuphanenin mesaji GOVDEYE TASINMAZ — `PdfRenderFailedError`in
      // metni ELLE yazilir (bkz. `pdf.port.ts`). Buradaki `reason` yalnizca
      // sunucu tarafinda gorulur.
      throw new PdfRenderFailedError(error instanceof Error ? error.message : String(error));
    }
  }

  async #render(model: PdfDocumentModel): Promise<Buffer> {
    const fonts = this.#resolveFonts();

    const doc = new PDFDocument({
      size: 'A4',
      margin: PAGE_MARGIN,
      // ⚠️ pdfkit varsayilan olarak Helvetica'yi YUKLER; kapatilmazsa gomulu
      // WinAnsi font ilk sayfaya yazilir ve Turkce karakter sorunu geri gelir.
      font: fonts.regular,
      info: { Title: model.title },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));

    const finished = new Promise<Buffer>((resolve, reject) => {
      doc.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
      doc.on('error', reject);
    });

    doc.registerFont(FONT_REGULAR, fonts.regular);
    doc.registerFont(FONT_BOLD, fonts.bold);

    writeHeader(doc, model);
    writeCustomer(doc, model);
    const tableBottom = writeLines(doc, model);
    writeTotals(doc, model, tableBottom);
    writeNotes(doc, model);
    writeFootnote(doc, model);

    doc.end();
    return finished;
  }

  /**
   * Font dosyalarini `node_modules`tan cozer.
   *
   * ⚠️ `require.resolve` KULLANILIYOR ve bu, derlenen cikti CommonJS oldugu
   * icin guvenlidir (`packages/config/typescript/nest.json` -> `"module":
   * "CommonJS"`). Ayni cagri vitest+swc altinda da calisir; ikisi de
   * dogrulandi.
   */
  #resolveFonts(): { regular: string; bold: string } {
    this.fontPaths ??= {
      regular: require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf'),
      bold: require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf'),
    };

    return this.fontPaths;
  }
}

type Doc = InstanceType<typeof PDFDocument>;

/** Baslik + belge numarasi + etiket-deger alanlari. */
function writeHeader(doc: Doc, model: PdfDocumentModel): void {
  doc.font(FONT_BOLD).fontSize(20).text(model.title, { align: 'left' });

  if (model.number !== null) {
    doc.moveDown(0.2);
    doc.font(FONT_REGULAR).fontSize(11).text(model.number);
  }

  doc.moveDown(0.8);

  // ⚠️ Etiketler MODULDEN gelir; bu fonksiyon "Gecerlilik" ile "Vade"
  // arasindaki farki BILMEZ.
  for (const field of model.meta) {
    writeLabelValue(doc, field, 10);
  }
}

function writeCustomer(doc: Doc, model: PdfDocumentModel): void {
  doc.moveDown(0.8);
  doc.font(FONT_BOLD).fontSize(10).text(model.customerName);

  doc.font(FONT_REGULAR).fontSize(9);
  for (const line of model.customerDetails) {
    doc.text(line);
  }

  doc.moveDown(1);
}

/**
 * Satir kalemleri tablosu.
 *
 * ⚠️ SAYFA KIRILIMI ELLE: pdfkit metin akisinda otomatik sayfa acar ama bir
 * TABLO cizimi (elle konumlandirilmis kolonlar) bunun disindadir. Kontrol
 * edilmeseydi uzun bir belge son satirlarini sayfa disina yazar ve cikti
 * SESSIZCE eksik olurdu.
 *
 * @returns tablonun bittigi `y`.
 */
function writeLines(doc: Doc, model: PdfDocumentModel): number {
  let y = doc.y;

  y = writeRow(
    doc,
    y,
    {
      description: 'Aciklama',
      quantity: 'Miktar',
      unit: null,
      unitPrice: 'Birim fiyat',
      taxRate: 'Vergi %',
      lineTotal: 'Tutar',
    },
    { bold: true },
  );

  doc
    .moveTo(PAGE_MARGIN, y)
    .lineTo(PAGE_MARGIN + CONTENT_WIDTH, y)
    .stroke();
  y += 4;

  for (const line of model.lines) {
    if (y > doc.page.height - BOTTOM_RESERVE) {
      doc.addPage();
      y = PAGE_MARGIN;
    }

    y = writeRow(doc, y, line, { bold: false });
  }

  return y;
}

/** Tek satir — kolonlar SABIT `x` konumlarinda. */
function writeRow(doc: Doc, y: number, line: PdfLineItem, options: { bold: boolean }): number {
  doc.font(options.bold ? FONT_BOLD : FONT_REGULAR).fontSize(ROW_FONT_SIZE);

  let x = PAGE_MARGIN;
  doc.text(line.description, x, y, { width: COLUMNS.description });
  const descriptionBottom = doc.y;

  x += COLUMNS.description;
  // ⚠️ Miktar ve birim TEK HUCREDE ("12 adet"): ADR-0039 §4.1'in kurali —
  // ciplak bir sayi, farkli kalemlerin TOPLANABILECEGINI ima ederdi.
  const quantityText = line.unit === null ? line.quantity : `${line.quantity} ${line.unit}`;
  doc.text(quantityText, x, y, { width: COLUMNS.quantity, align: 'right' });

  x += COLUMNS.quantity;
  doc.text(line.unitPrice, x, y, { width: COLUMNS.unitPrice, align: 'right' });

  x += COLUMNS.unitPrice;
  doc.text(line.taxRate, x, y, { width: COLUMNS.taxRate, align: 'right' });

  x += COLUMNS.taxRate;
  doc.text(line.lineTotal, x, y, { width: COLUMNS.lineTotal, align: 'right' });

  // ⚠️ Satir yuksekligi EN UZUN hucreye gore: aciklama sarabilir, sayilar
  // saramaz. `doc.y`yi sayilardan okumak, sarmis bir aciklamanin uzerine
  // yazmak olurdu.
  return Math.max(descriptionBottom, doc.y) + ROW_PADDING;
}

function writeTotals(doc: Doc, model: PdfDocumentModel, tableBottom: number): void {
  let y = tableBottom + 4;

  doc
    .moveTo(PAGE_MARGIN + CONTENT_WIDTH - 220, y)
    .lineTo(PAGE_MARGIN + CONTENT_WIDTH, y)
    .stroke();
  y += 6;

  for (const total of model.totals) {
    if (y > doc.page.height - BOTTOM_RESERVE) {
      doc.addPage();
      y = PAGE_MARGIN;
    }

    doc.font(FONT_BOLD).fontSize(10);
    doc.text(total.label, PAGE_MARGIN + CONTENT_WIDTH - 220, y, {
      width: 120,
      align: 'right',
    });
    // ⚠️ Para birimi ETIKETTE degil DEGERDE — belge basina TEK para birimi
    // vardir (ADR-0041 §1.4) ve modul onu degerin icine yazar.
    doc.text(total.value, PAGE_MARGIN + CONTENT_WIDTH - 100, y, {
      width: 100,
      align: 'right',
    });

    y = doc.y + 4;
  }

  doc.y = y;
}

function writeNotes(doc: Doc, model: PdfDocumentModel): void {
  if (model.notes === null) {
    return;
  }

  doc.moveDown(1.2);
  doc.font(FONT_REGULAR).fontSize(9).text(model.notes, PAGE_MARGIN, doc.y, {
    width: CONTENT_WIDTH,
  });
}

/**
 * Dipnot — ADR-0041 §12'nin PDF tarafindaki karsiligi.
 *
 * ⚠️ METIN MODULDEN GELIR. Bu fonksiyon "mali belge degildir" cumlesini
 * BILMEZ; yalnizca sayfanin altina basar.
 */
function writeFootnote(doc: Doc, model: PdfDocumentModel): void {
  if (model.footnote === null) {
    return;
  }

  doc.moveDown(1.5);
  doc.font(FONT_REGULAR).fontSize(8).text(model.footnote, PAGE_MARGIN, doc.y, {
    width: CONTENT_WIDTH,
  });
}

function writeLabelValue(doc: Doc, field: PdfMetaField, size: number): void {
  doc.font(FONT_BOLD).fontSize(size).text(`${field.label}: `, { continued: true });
  doc.font(FONT_REGULAR).text(field.value);
}
