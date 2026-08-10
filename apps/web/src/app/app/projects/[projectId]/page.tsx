import { ProjectDetailScreen } from '@/components/projects/project-detail-screen';

/**
 * `/app/projects/[projectId]` — proje detayı.
 *
 * ⚠️ Next.js 15'te `params` bir Promise'tir ve `await` edilmeden okunamaz.
 * Doğrulama BURADA yapılmaz: id geçersizse backend zaten 400/404 döner ve
 * ekran onu ölümcül hata olarak gösterir. Bir UUID kontrolünü istemciye
 * kopyalamak, sunucunun kuralını ikinci bir yerde tekrarlamak olurdu
 * (`[companyId]` ile aynı karar).
 *
 * ⚠️ ROTA ÇAKIŞMASI YOK: `/app/projects/tasks` (statik) ile bu dinamik segment
 * aynı seviyede yaşayacak ve Next.js App Router STATİK segmente öncelik verir.
 * Aynı çakışma NestJS tarafında dokuz satırlık bir uyarı ve bir entegrasyon
 * testi gerektirmişti (orada eşleşme KAYIT SIRASINA bağlı); burada framework
 * doğru olanı kendiliğinden yapıyor.
 */
export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  return <ProjectDetailScreen projectId={projectId} />;
}
