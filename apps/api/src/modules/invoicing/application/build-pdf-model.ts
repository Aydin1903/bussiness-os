import { computeLineTotals } from '../domain/document-money';
import { type PdfDocumentModel, type PdfMetaField } from '../../../shared/pdf.port';
import { type SalesDocumentView } from './invoicing.use-cases';

/**
 * Belge gorunumunu `PdfDocumentModel`e cevirir (ADR-0041 §6.1).
 *
 * ============================================================================
 * ⚠️ "TEKLIF" KELIMESI BU DOSYADA GECER — PORT'TA GECMEZ
 * ============================================================================
 * `PdfPort` bir IZDUSUM alir ve o izdusumun alan adlari NOTRDUR (`title`,
 * `meta`, `footnote`). Is kavramlarini metne ceviren yer BURASIDIR ve dogru
 * yer de burasidir: bu dosya modulun ICINDEDIR, port `shared/`tedir.
 *
 * Taniyor olsaydi `shared/` bir IS MODULUNU bilirdi (Mutlak Kural 6) ve
 * ucuncu bir belge turu eklendiginde PORT degisirdi.
 *
 * ============================================================================
 * ⚠️ TOPLAMLAR BURADA HESAPLANMAZ, DOMAIN'DEN GELIR
 * ============================================================================
 * `view.totals` zaten `computeDocumentTotals` ciktisidir. Satir toplamlari da
 * ayni dosyadan (`computeLineTotals`) gelir — yani belgede basili her rakamin
 * TEK BIR aritmetik kaynagi vardir.
 *
 * Bu, ADR-0041 §4.1'in acik teklif ozetinde tutar TASIMAMASININ da gerekcesi:
 * ikinci bir (SQL) aritmetik uygulamasi zamanla ayrisir ve hata SESSIZDIR.
 */

/** Turlerin BASLIGI — port bu kelimeleri bilmez. */
const TITLES = {
  quote: 'TEKLIF',
  invoice: 'FATURA',
} as const;

/**
 * ⚠️ ADR-0041 §12'nin PDF TARAFINDAKI KARSILIGI — VE BU SATIR PAZARLIK KONUSU
 * DEGILDIR.
 *
 * Bu modulun urettigi "fatura" BIR PDF BELGESIDIR, MALI BELGE DEGILDIR: yasal
 * e-fatura ulkeye ozel bir entegrasyon (mukellef sorgusu, mali muhur, zarf
 * formati, saklama yukumlulugu) demektir ve global bir urunun cekirdegine
 * konulamaz.
 *
 * ⚠️ Belirsiz birakmak, kullanicinin YASAL YUKUMLULUGUNU YERINE GETIRDIGINI
 * SANMASINA yol acardi — bu ADR'nin engelledigi EN PAHALI sessiz hata. Uyari
 * hem ekranda hem KAGITTA durur, cunku kagit sirketten CIKAR ve ekran cikmaz.
 */
const INVOICE_FOOTNOTE =
  'Bu belge bir on muhasebe ciktisidir; yasal e-fatura / e-arsiv belgesi DEGILDIR.';

const QUOTE_FOOTNOTE = 'Bu belge bir fiyat teklifidir; fatura yerine gecmez.';

export function buildPdfModel(view: SalesDocumentView): PdfDocumentModel {
  const { document, lines, totals } = view;

  return {
    title: TITLES[document.kind],
    number: document.number,
    meta: buildMeta(view),
    // ⚠️ BELGEYE BASILAN AD (§1.5) — `linkedCompanyName` DEGIL. Ikisi farkli
    // olabilir ve kagida basilan DAIMA donmus olandir; dizinden okunan ad
    // "bugunku musteri"dir ve gecmis bir belgeyi GERIYE DONUK degistiremez.
    customerName: document.customerName,
    customerDetails: buildCustomerDetails(view),
    currency: document.currency,
    lines: lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unit: line.unit,
      unitPrice: line.unitPrice,
      taxRate: line.taxRate,
      lineTotal: computeLineTotals(line).net,
    })),
    totals: [
      { label: 'Ara toplam', value: `${totals.subtotal} ${document.currency}` },
      { label: 'Vergi', value: `${totals.taxTotal} ${document.currency}` },
      { label: 'Genel toplam', value: `${totals.total} ${document.currency}` },
    ],
    notes: document.notes,
    footnote: document.kind === 'invoice' ? INVOICE_FOOTNOTE : QUOTE_FOOTNOTE,
  };
}

function buildMeta(view: SalesDocumentView): PdfMetaField[] {
  const { document } = view;
  const meta: PdfMetaField[] = [{ label: 'Tarih', value: document.issuedOn }];

  // ⚠️ TUR-BAGIMLI ALANLAR: `validUntil` yalnizca teklifte, `dueOn` yalnizca
  // faturada DOLU olabilir (entity bunu zaten temizliyor). Burada `null`
  // kontrolu yeterlidir; tur kontrolu IKINCI bir kural kaynagi olurdu.
  if (document.validUntil !== null) {
    meta.push({ label: 'Gecerlilik', value: document.validUntil });
  }

  if (document.dueOn !== null) {
    meta.push({ label: 'Vade', value: document.dueOn });
  }

  return meta;
}

/**
 * Musteri alti satirlari.
 *
 * ⚠️ `linkedCompanyName` BURAYA GIRMEZ ve bu bilincli: kagitta iki ad gormek
 * ("Yildiz Ltd." ve altinda "bugun: Yildiz A.S.") okuyani karistirirdi. Ayrim
 * EKRANDA anlamlidir — orada kullanici baglantiyi duzeltebilir; kagitta
 * yalnizca donmus gercek vardir.
 */
function buildCustomerDetails(view: SalesDocumentView): string[] {
  const details: string[] = [];

  if (view.linkedContactName !== null) {
    details.push(`Ilgili kisi: ${view.linkedContactName}`);
  }

  return details;
}
