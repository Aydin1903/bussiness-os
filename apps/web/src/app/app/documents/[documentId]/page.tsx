import { DocumentDetailScreen } from '@/components/documents/document-detail-screen';

/**
 * `/app/documents/[documentId]` — tek belgenin künyesi.
 *
 * ⚠️ DUVARI YOKTUR (ADR-0038): _"detay sayfalarının duvarı yoktur — özetlenecek
 * bir durum değil, tek bir kayıt var."_
 */
export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;

  return <DocumentDetailScreen documentId={documentId} />;
}
