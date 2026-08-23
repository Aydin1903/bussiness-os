import { DocumentsListScreen } from '@/components/invoicing/documents-list-screen';

/**
 * `/app/invoicing` — satış evrakı odasının BİRİNCİL çalışma yüzeyi
 * (ADR-0041 §11.2).
 *
 * ⚠️ İkinci rota (`/app/invoicing/invoices`) AYRI BİR ODA DEĞİLDİR: aynı
 * duvarı paylaşır çünkü aynı soruyu cevaplar — "satış evrakımız ne durumda"
 * (ADR-0038 §6.5).
 */
export default function InvoicingPage() {
  return <DocumentsListScreen kind="quote" />;
}
