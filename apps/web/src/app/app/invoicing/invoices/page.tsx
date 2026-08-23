import { DocumentsListScreen } from '@/components/invoicing/documents-list-screen';

/**
 * `/app/invoicing/invoices` — aynı odanın İKİNCİ çalışma yüzeyi.
 *
 * ⚠️ Next.js'te statik segment (`invoices`) dinamik olandan ÖNCE eşleşir, yani
 * burada Express tarafındaki rota gölgelemesi riski YOKTUR. Yine de kural
 * korunuyor: `/app/invoicing` altında DOĞRUDAN bir `[id]` rotası AÇILMAZ —
 * açılsaydı `invoices` bir UUID sanılabilir ve hiçbir test kırmızı yanmazdı.
 */
export default function InvoicesPage() {
  return <DocumentsListScreen kind="invoice" />;
}
