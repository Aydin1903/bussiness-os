import { OnboardingWizard } from './wizard';

/**
 * `/app/onboarding` — ilk kurulum sihirbazı (ADR-0030 §3).
 *
 * Sayfa Server Component kalır ve yalnızca sarar; akışın tamamı bir Client
 * Component olan `OnboardingWizard`'tadır (adım durumu, ağ çağrıları,
 * yönlendirme). `/app/change-password` ile aynı desen.
 *
 * Rota KORUMALI DEĞİLDİR: doğrudan gelinirse wizard yine çalışır ve verilen
 * cevaplar not olur. Bu bilinçli — burada korunacak bir şey yok; yazma yetkisi
 * zaten `POST /knowledge/notes`'un `note:create` kontrolündedir ve viewer rolü
 * ilk cevapta `403` alır.
 */
export default function OnboardingPage() {
  return <OnboardingWizard />;
}
