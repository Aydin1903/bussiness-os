import { LeaveQueueScreen } from '@/components/hr/leave-queue-screen';

/**
 * `/app/hr/leave` — İK odasının İKİNCİ çalışma yüzeyi (ADR-0044 §2).
 *
 * ⚠️ Ayrı bir ODA DEĞİL, aynı odanın ikinci tezgahı: sidebar'a ikinci bir
 * satır eklenmedi, sekme şeridi hiyerarşiyi doğru gösterir (`ProjectTabs`
 * deseni).
 *
 * ⚠️ Ücret defteri için böyle bir rota AÇILMAMIŞTI ve fark izin genişliğidir:
 * `compensation:read` DAR, `leave:read` ise DÖRT ROLE de açık — yani bu sekme
 * kimseye kapalı bir kapı göstermez.
 */
export default function HrLeavePage() {
  return <LeaveQueueScreen />;
}
