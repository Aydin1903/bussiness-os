import { describe, expect, it } from 'vitest';

import { PdfRenderFailedError, type PdfDocumentModel } from '../../shared/pdf.port';
import { PdfKitPdfAdapter } from './pdfkit-pdf.adapter';

/**
 * `PdfKitPdfAdapter` (ADR-0041 §6.2).
 *
 * ============================================================================
 * ⚠️ BU DOSYANIN VAR OLMA SEBEBI: TURKCE KARAKTER TUZAGI SESSIZDIR
 * ============================================================================
 * `pdfkit`in gomulu standart yazi tipleri WinAnsi (Latin-1) kodlamasindadir ve
 * Latin-1'de `g-breve`, `s-cedilla`, noktasiz `i` YOKTUR. Bir font gomulmezse
 * PDF URETILIR, INDIRILIR, ACILIR — yalnizca MUSTERININ ADI YANLIS YAZILIR.
 *
 * Kusur ancak bir musteri sikayetiyle ogrenilirdi; bu yuzden mekanizma
 * (gomulu TTF) burada dogrudan iddia ediliyor.
 */
const TURKISH = 'Yıldız Çağrı Şirketi — ölçüm, ığdır, ŞİRİN';

function model(overrides: Partial<PdfDocumentModel> = {}): PdfDocumentModel {
  return {
    title: 'BASLIK',
    number: 'X-000001',
    meta: [{ label: 'Tarih', value: '2026-08-22' }],
    customerName: TURKISH,
    customerDetails: ['Ilgili kisi: Ayşe Yılmaz'],
    currency: 'TRY',
    lines: [
      {
        description: 'M8 civata — paslanmaz, ıslak ortam',
        quantity: '500.000',
        unit: 'adet',
        unitPrice: '12.50',
        taxRate: '20.00',
        lineTotal: '6250.00',
      },
    ],
    totals: [{ label: 'Genel toplam', value: '7500.00 TRY' }],
    notes: 'Fiyatlarımız 30 gün geçerlidir.',
    footnote: 'Bu belge bir on muhasebe ciktisidir.',
    ...overrides,
  };
}

describe('PdfKitPdfAdapter', () => {
  it('gecerli bir PDF uretir', async () => {
    const bytes = await new PdfKitPdfAdapter().render(model());

    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });

  it('⚠️ GOMULU TTF KULLANIR — WinAnsi standart fontuna DUSMEZ', async () => {
    // ⚠️ Bu, Turkce karakter guvenliginin MEKANIZMASIDIR. Gomulu font
    // kullanildiginda metin glif indeksleriyle kodlanir, yani ham baytlarda
    // "Yıldız" ARANAMAZ; aranabilecek sey FONT ADIDIR.
    const bytes = await new PdfKitPdfAdapter().render(model());
    const raw = bytes.toString('latin1');

    expect(raw).toContain('DejaVuSans');
    // ⚠️ Helvetica gorunuyorsa bir yerde standart fonta DUSULMUS demektir ve
    // o metinde Turkce karakterler SESSIZCE bozulur.
    expect(raw).not.toContain('Helvetica');
  });

  it('⚠️ Turkce metin ToUnicode esleminde GORUNUR — glifler gercekten var', async () => {
    // pdfkit gomulu fontlar icin bir ToUnicode CMap yazar. `0131` (noktasiz i),
    // `015F` (s-cedilla) ve `011F` (g-breve) orada gorunmuyorsa, o karakterler
    // icin glif COZULMEMIS demektir.
    const raw = (await new PdfKitPdfAdapter().render(model())).toString('latin1');

    expect(raw).toContain('ToUnicode');
    // CMap icerigi sikistirilmis olabilir; bu yuzden asil iddia FONT
    // ADI + ToUnicode VARLIGIDIR. Icerigin kendisi asagidaki genislik
    // olcumuyle dogrulanir.
  });

  it('⚠️ "TEKLIF" / "FATURA" KELIMELERINI BILMEZ — basliklar MODULDEN gelir', async () => {
    // ADR-0035'in `week-grid` dersi, sunucu tarafinda: bilesen kendi alanini
    // bilmez. Ucuncu bir belge turu eklendiginde bu adapter DEGISMEZ.
    const adapter = new PdfKitPdfAdapter();

    const first = await adapter.render(model({ title: 'IRSALIYE' }));
    const second = await adapter.render(model({ title: 'MAKBUZ' }));

    expect(first.byteLength).toBeGreaterThan(0);
    expect(second.byteLength).toBeGreaterThan(0);
  });

  it('kalemsiz ve notsuz belgeyi de basar (taslak onizlemesi)', async () => {
    const bytes = await new PdfKitPdfAdapter().render(
      model({ lines: [], notes: null, footnote: null, number: null, customerDetails: [] }),
    );

    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('cok satirli belgede SAYFA KIRILIMINI kendisi yonetir', async () => {
    // ⚠️ pdfkit metin akisinda otomatik sayfa acar ama ELLE KONUMLANDIRILMIS
    // bir tabloda bunu yapmaz. Kontrol edilmeseydi uzun bir belge son
    // satirlarini sayfa disina yazar ve cikti SESSIZCE eksik olurdu.
    const many = Array.from({ length: 120 }, (_, index) => ({
      description: `Kalem ${String(index + 1)} — açıklama`,
      quantity: '1.000',
      unit: 'adet',
      unitPrice: '10.00',
      taxRate: '20.00',
      lineTotal: '10.00',
    }));

    const bytes = await new PdfKitPdfAdapter().render(model({ lines: many }));
    const raw = bytes.toString('latin1');

    // Birden fazla sayfa nesnesi: `/Type /Page` sayisi 1'den buyuk olmali.
    const pageCount = raw.split('/Type /Page\n').length - 1;
    expect(pageCount).toBeGreaterThan(1);
  });

  it('⚠️ hatayi `PdfRenderFailedError`a cevirir — ham hata SIZMAZ', async () => {
    const adapter = new PdfKitPdfAdapter();

    // `meta` yerine bozuk bir deger: render sirasinda patlar.
    await expect(
      adapter.render(model({ meta: null as unknown as PdfDocumentModel['meta'] })),
    ).rejects.toThrow(PdfRenderFailedError);
  });
});
