import { DocumentDetailScreen } from '@/components/invoicing/document-detail-screen';

/**
 * `/app/invoicing/invoices/<id>` — fatura detayı.
 *
 * ⚠️ Türün rotada taşınma gerekçesi `quotes/[quoteId]/page.tsx`te yazılı ve
 * burada tekrarlanmıyor: tek cümlesi, sunucunun `kind`i sorgunun içinde
 * tutmasının bir SIZINTIYI kapatmak için olduğudur.
 */
export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const { invoiceId } = await params;
  return <DocumentDetailScreen kind="invoice" documentId={invoiceId} />;
}
