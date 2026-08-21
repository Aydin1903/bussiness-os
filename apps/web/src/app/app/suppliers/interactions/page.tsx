import { InteractionsScreen } from '@/components/suppliers/interactions-screen';

/**
 * `/app/suppliers/interactions` — görüşme akışı.
 *
 * ⚠️ AYNI ODANIN İKİNCİ TEZGAHI: duvar ORTAKTIR (`SuppliersWall`) ve
 * kopyalanmaz.
 *
 * ⚠️ Akış SALT OKUNURDUR: düzenle/sil yoktur (ADR-0040 §1 — günlük
 * EKLEME-YALNIZ). Bu, Stok'un değiştirilemez defteriyle AYNI GÖRÜNÜR ama aynı
 * şey DEĞİLDİR: orada bugünkü miktar o defterden türetiliyordu, burada
 * türetilen hiçbir sayı yok.
 */
export default function SupplierInteractionsPage() {
  return <InteractionsScreen />;
}
