import { CampaignDetailScreen } from '@/components/marketing/campaign-detail-screen';

/**
 * `/app/marketing/<id>` — tek kampanya, DÜZENLENEBİLİR.
 *
 * ⚠️ Detay sayfalarının DUVARI YOKTUR (ADR-0038): özetlenecek bir durum değil,
 * tek bir kayıt var.
 */
export default async function CampaignDetailPage({
  params,
}: {
  readonly params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;
  return <CampaignDetailScreen campaignId={campaignId} />;
}
