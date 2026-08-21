import { ItemsListScreen } from '@/components/inventory/items-list-screen';

/**
 * `/app/inventory` — stok odasının BİRİNCİL çalışma yüzeyi (ADR-0039 §11.2).
 *
 * ⚠️ İkinci rota (`/app/inventory/movements`) AYRI BİR ODA DEĞİLDİR: aynı
 * duvarı paylaşır çünkü aynı soruyu cevaplar — "stok durumu ne"
 * (ADR-0038 §6.5).
 */
export default function InventoryPage() {
  return <ItemsListScreen />;
}
