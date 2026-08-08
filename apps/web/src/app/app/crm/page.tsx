import { CompaniesScreen } from '@/components/crm/companies-screen';

/**
 * `/app/crm` — Müşteriler.
 *
 * `OnboardingGate` ile SARILMAZ (Panel'den farkı budur): o kapı "hiç notunuz
 * yok" koşuluna bakar ve kullanıcıyı Knowledge sihirbazına yollar. CRM'e
 * girmek isteyen birini not yazma sihirbazına düşürmek, ayrı bir modülün
 * boşluğunu bu modülün önüne koymak olurdu.
 *
 * Sayfa Server Component kalır; ekranın tamamı Client'tır (oturum token'ı
 * memory'de, veri istemciden çekilir) — `/app` ile aynı bölünme.
 */
export default function CrmPage() {
  return <CompaniesScreen />;
}
