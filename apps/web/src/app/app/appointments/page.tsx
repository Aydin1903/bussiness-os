import { AppointmentsWeekScreen } from '@/components/appointments/appointments-week-screen';

/**
 * `/app/appointments` — HAFTALIK TAKVİM (varsayılan görünüm).
 *
 * ⚠️ Varsayılanın liste değil TAKVİM olması bir tercih değil, modülün
 * tanımıdır: "bu hafta ne var" sorusu bu modülün birincil sorusudur (ADR-0035
 * §7d). Aylık görünüm v2'ye ertelendi — farklı bir bileşendir (blok değil gün
 * hücresi + taşma sayacı) ve ikisini birden yazmak ikisini de yarım yazmak
 * olurdu.
 *
 * `OnboardingGate` ile SARILMAZ (`/app/crm`, `/app/projects`, `/app/finance`
 * ile aynı gerekçe): o kapı "hiç notunuz yok" koşuluna bakar ve kullanıcıyı
 * Knowledge sihirbazına yollar. Takvimine bakmak isteyen birini not yazma
 * sihirbazına düşürmek, ayrı bir modülün boşluğunu bu modülün önüne koymak
 * olurdu.
 *
 * Sayfa Server Component kalır; ekranın tamamı Client'tır.
 */
export default function AppointmentsPage() {
  return <AppointmentsWeekScreen />;
}
