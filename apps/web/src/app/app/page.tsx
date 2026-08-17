import { OnboardingGate } from '@/components/dashboard/onboarding-gate';
import { BriefingScreen } from '@/components/panel/briefing-screen';

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
/**
 * ⚠️ SOHBET BURADAN ÇIKTI (Product Owner kararı, 2026-08-17).
 *
 * Yukarıdaki "tek yüzeyde BİRLEŞTİ" kararı geri alındı: günlük özet ile sohbet
 * aynı ekranda yarışıyor ve ekranı karmaşıklaştırıyordu. Panel artık yalnızca
 * BRİFİNGdir (oku + not al); konuşma `/app/chat`e taşındı ve oraya buradaki
 * "Sohbet et" düğmesiyle gidilir.
 */
export default function PanelPage() {
  return (
    <OnboardingGate>
      <BriefingScreen />
    </OnboardingGate>
  );
}
