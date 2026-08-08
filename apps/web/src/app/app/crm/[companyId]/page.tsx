import { CompanyDetailScreen } from '@/components/crm/company-detail-screen';

/**
 * `/app/crm/[companyId]` — şirket detayı.
 *
 * ⚠️ Next.js 15'te `params` bir Promise'tir ve `await` edilmeden okunamaz.
 * Doğrulama BURADA yapılmaz: id geçersizse backend zaten 400/404 döner ve
 * ekran onu `fatalError` olarak gösterir. Bir UUID kontrolünü istemciye
 * kopyalamak, sunucunun kuralını ikinci bir yerde tekrarlamak olurdu.
 */
export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;

  return <CompanyDetailScreen companyId={companyId} />;
}
