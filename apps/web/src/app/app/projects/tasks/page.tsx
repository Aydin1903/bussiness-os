import { TasksScreen } from '@/components/projects/tasks-screen';

/**
 * `/app/projects/tasks` — Yapılacaklar.
 *
 * ⚠️ ROTA ÇAKIŞMASI YOK: `tasks` STATİK bir segment, kardeşi `[projectId]`
 * DİNAMİK. Next.js App Router statik segmente öncelik verir, dolayısıyla bu
 * sayfa hiçbir zaman proje detayına düşmez.
 *
 * Aynı çakışma NestJS tarafında dokuz satırlık bir uyarı, bir kayıt sırası
 * kuralı ve bir entegrasyon testi gerektirmişti (orada eşleşme controller
 * KAYIT SIRASINA bağlıdır). Burada framework doğru olanı kendiliğinden yapıyor
 * — iki tarafın aynı problemi farklı çözmesi, her ikisinin de kayda geçmesini
 * gerektirdi.
 *
 * Sayfa Server Component kalır; ekranın tamamı Client'tır — `/app/projects`
 * ile aynı bölünme.
 */
export default function TasksPage() {
  return <TasksScreen />;
}
