import { LoyaltyAccountListScreen } from '@/components/loyalty/account-list-screen';

/**
 * `/app/loyalty` — sadakat odasının çalışma yüzeyi (ADR-0051 §9).
 *
 * ⚠️ İKİNCİ BİR ROTA YOKTUR: Tedarikçi'nin ve İK'nın ikinci yüzeyleri AYRI BİR
 * SORUYU cevaplıyordu ("onay kuyruğunda ne var"). Burada tek soru var —
 * _"kimin kaç puanı var"_ — ve tek liste onu cevaplıyor.
 *
 * ⚠️ BİR DETAY ROTASI VARDIR ve sebebi Kampanya'nınkinden FARKLIDIR: orada
 * detay bir DÜZENLEME formuydu. Burada düzenlenecek hiçbir alan yoktur
 * (§2.2); detay sayfası **DEFTER** içindir — bir hesabın puan geçmişi bir
 * liste satırına sığmaz.
 */
export default function LoyaltyPage() {
  return <LoyaltyAccountListScreen />;
}
