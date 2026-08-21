import { SuppliersListScreen } from '@/components/suppliers/suppliers-list-screen';

/**
 * `/app/suppliers` — tedarikçi odasının BİRİNCİL çalışma yüzeyi
 * (ADR-0040 §8.2).
 *
 * ⚠️ İkinci rota (`/app/suppliers/interactions`) AYRI BİR ODA DEĞİLDİR: aynı
 * duvarı paylaşır çünkü aynı soruyu cevaplar — "tedarikçi ilişkilerimiz ne
 * durumda" (ADR-0038 §6.5).
 */
export default function SuppliersPage() {
  return <SuppliersListScreen />;
}
