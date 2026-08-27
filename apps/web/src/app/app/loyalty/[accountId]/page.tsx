import { LoyaltyAccountDetailScreen } from '@/components/loyalty/account-detail-screen';

/**
 * `/app/loyalty/<id>` — tek hesabın defteri (ADR-0051 §9).
 *
 * ⚠️ Detay sayfalarının DUVARI YOKTUR (ADR-0038): özetlenecek bir durum değil,
 * tek bir kayıt var.
 */
export default async function LoyaltyAccountPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  return <LoyaltyAccountDetailScreen accountId={accountId} />;
}
