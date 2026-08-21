import { MovementsScreen } from '@/components/inventory/movements-screen';

/**
 * `/app/inventory/movements` — hareket defteri.
 *
 * ⚠️ AYNI ODANIN İKİNCİ TEZGAHI: duvar ORTAKTIR (`InventoryWall`) ve
 * kopyalanmaz. ADR-0038 §6.5'in karar noktası — "bu rota hangi soruyu
 * cevaplıyor?" — burada "aynı soru" cevabını verir.
 *
 * ⚠️ Defter SALT OKUNURDUR: düzenle/sil yoktur (ADR-0039 §3.3).
 */
export default function InventoryMovementsPage() {
  return <MovementsScreen />;
}
