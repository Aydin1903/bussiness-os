import { ProjectsScreen } from '@/components/projects/projects-screen';

/**
 * `/app/projects` — Projeler.
 *
 * `OnboardingGate` ile SARILMAZ (`/app/crm` ile aynı gerekçe): o kapı "hiç
 * notunuz yok" koşuluna bakar ve kullanıcıyı Knowledge sihirbazına yollar.
 * Projelerine bakmak isteyen birini not yazma sihirbazına düşürmek, ayrı bir
 * modülün boşluğunu bu modülün önüne koymak olurdu.
 *
 * Sayfa Server Component kalır; ekranın tamamı Client'tır (oturum token'ı
 * memory'de, veri istemciden çekilir) — `/app` ve `/app/crm` ile aynı bölünme.
 */
export default function ProjectsPage() {
  return <ProjectsScreen />;
}
