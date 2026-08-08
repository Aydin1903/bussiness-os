import { FollowUpsScreen } from '@/components/crm/follow-ups-screen';

/**
 * `/app/crm/follow-ups` — takipler.
 *
 * Görünümün kendi verisi yoktur; `crm.opportunities` üzerinde türetilmiş bir
 * sorgudur (ADR-0031 §3). Statik segment, `[companyId]`den önce eşleşir.
 */
export default function FollowUpsPage() {
  return <FollowUpsScreen />;
}
