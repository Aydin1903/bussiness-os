import { CampaignListScreen } from '@/components/marketing/campaign-list-screen';

/**
 * `/app/marketing` — kampanya odasının çalışma yüzeyi (ADR-0047 §9).
 *
 * ⚠️ İKİNCİ BİR ROTA YOKTUR: Tedarikçi'nin ve İK'nın ikinci yüzeyleri AYRI BİR
 * SORUYU cevaplıyordu. Burada tek soru var — _"hangi kampanyalar var ve ne
 * oldu"_ — ve tek liste onu cevaplıyor.
 *
 * ⚠️ AMA BİR DETAY ROTASI VARDIR ve bu, Geri Bildirim'den AYRILDIĞIMIZ YER:
 * orada kayıt DÜZENLENMEZDİ, yani detayda gösterilecek bir form yoktu. Burada
 * kayıt HER DURUMDA düzenlenebilir (ADR-0047 §2) — özellikle sonuç notu,
 * kampanya BİTTİKTEN SONRA yazılır. Detay sayfası tam olarak o iş içindir.
 */
export default function MarketingPage() {
  return <CampaignListScreen />;
}
