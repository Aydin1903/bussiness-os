import { DocumentDetailScreen } from '@/components/invoicing/document-detail-screen';

/**
 * `/app/invoicing/quotes/<id>` — teklif detayı.
 *
 * ⚠️ BU SAYFANIN DUVARI YOKTUR ve sekme şeridi de yoktur (ADR-0038 §6.5):
 * özetlenecek bir durum değil, TEK BİR KAYIT var.
 *
 * ============================================================================
 * ⚠️ TÜR ROTADA TAŞINIR — ve bu SUNUCUNUN SÖZLEŞMESİNİN sonucudur
 * ============================================================================
 * ADR §11.2 detay rotasını `/app/invoicing/<id>` diye yazmıştı; uygulamada
 * `/quotes/<id>` ve `/invoices/<id>` olarak AYRILDI.
 *
 * Sebep: sunucuda `kind` SORGUNUN İÇİNDEDİR ve yanlış türde bir id **404**
 * döner (§ `SalesDocumentNotFoundError`). Bu, kasıtlı bir sızıntı kapatmadır —
 * `invoice:read` taşımayan biri `/quotes/<fatura-id>` ile bir faturanın
 * varlığını yoklayamasın diye. Tek bir arayüz rotası, türü bilmediği için
 * "önce teklif dene, olmazsa fatura" yapmak zorunda kalırdı: yani her fatura
 * açılışında KASITLI BİR 404 üretir ve sunucunun kapattığı ayrımı istemcide
 * GERİ AÇARDI.
 */
export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ quoteId: string }>;
}) {
  const { quoteId } = await params;
  return <DocumentDetailScreen kind="quote" documentId={quoteId} />;
}
