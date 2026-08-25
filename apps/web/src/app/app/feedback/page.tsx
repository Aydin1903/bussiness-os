import { FeedbackListScreen } from '@/components/feedback/feedback-list-screen';

/**
 * `/app/feedback` — geri bildirim odasının TEK çalışma yüzeyi (ADR-0045 §9).
 *
 * ⚠️ İKİNCİ BİR ROTA YOKTUR ve bu bir eksik değil: Tedarikçi'nin
 * (`/suppliers` + `/suppliers/interactions`) ve İK'nın (`/hr` + `/hr/leave`)
 * ikinci yüzeyleri AYRI BİR SORUYU cevaplıyordu. Burada tek soru var —
 * _"müşteriler ne diyor"_ — ve tek liste onu cevaplıyor.
 *
 * ⚠️ BİR DETAY ROTASI DA YOKTUR: kayıt DÜZENLENMEZ (§2), yani detay
 * sayfasında gösterilecek bir form yoktur. Kartın kendisi kaydın tamamını
 * taşır (puan · kanal · kişi · tarih · yorum). Detay açmak, olmayan bir
 * derinliği İMA EDERDİ.
 */
export default function FeedbackPage() {
  return <FeedbackListScreen />;
}
