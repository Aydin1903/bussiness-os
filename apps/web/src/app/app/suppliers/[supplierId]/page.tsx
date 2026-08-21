import { SupplierDetailScreen } from '@/components/suppliers/supplier-detail-screen';

/**
 * `/app/suppliers/<id>` — tedarikçi detayı.
 *
 * ⚠️ BU SAYFANIN DUVARI YOKTUR ve sekme şeridi de yoktur (ADR-0038 §6.5):
 * özetlenecek bir durum değil, TEK BİR KAYIT var.
 */
export default async function SupplierDetailPage({
  params,
}: {
  params: Promise<{ supplierId: string }>;
}) {
  const { supplierId } = await params;
  return <SupplierDetailScreen supplierId={supplierId} />;
}
