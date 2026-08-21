import { ItemDetailScreen } from '@/components/inventory/item-detail-screen';

/**
 * `/app/inventory/<itemId>` — kalem detayı.
 *
 * ⚠️ DETAYIN DUVARI YOKTUR (ADR-0038 §6.5): özetlenecek bir durum değil, tek
 * bir kayıt var. Sekme şeridi de yoktur — detay hiçbir çalışma yüzeyine ait
 * değildir.
 */
export default async function InventoryItemPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await params;
  return <ItemDetailScreen itemId={itemId} />;
}
