import { OnboardingGate } from '@/components/dashboard/onboarding-gate';
import { PanelScreen } from '@/components/panel/panel-screen';

/**
 * `/app` — Panel.
 *
 * Tasarım sürüm 2 (2026-08-05): "Genel Bakış" ile "Bilgi Bankası" tek yüzeyde
 * BİRLEŞTİ. AI sayfaya girer girmez kendiliğinden konuşur (günlük özet),
 * altında soru sorulur, not eklenir; modüller sol menüde sakin durur.
 *
 * Eski dashboard (statik karşılama kartı + dört "yakında" modül kartı)
 * KALDIRILDI: hiçbiri gerçek veri göstermiyordu ve sayfanın tamamını
 * placeholder'la dolduruyordu.
 *
 * Sayfa Server Component kalır; ekranın tamamı Client'tır (oturum token'ı
 * memory'de, veri istemciden çekilir).
 */
export default function PanelPage() {
  return (
    <OnboardingGate>
      <PanelScreen />
    </OnboardingGate>
  );
}
