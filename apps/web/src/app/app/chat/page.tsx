import { ChatScreen } from '@/components/panel/chat-screen';

/**
 * `/app/chat` — Sohbet odası (Product Owner kararı, 2026-08-17).
 *
 * ⚠️ `OnboardingGate` SARMALAMAZ — ve bu bilinçli.
 *
 * Gate, hiç notu olmayan kullanıcıyı sihirbaza yönlendirir. Burada o davranış
 * yanlış olurdu: sohbet, kayıtları OLMAYAN bir kullanıcının da girebileceği
 * bir yerdir (asistan "henüz kaydınız yok" der ve bu doğru bir cevaptır).
 * Ayrıca kullanıcı buraya Panel'deki düğmeden gelir; Panel zaten gate'in
 * arkasındadır, yani kapıyı ikinci kez kurmak yalnızca bir yönlendirme
 * döngüsü riski üretirdi.
 *
 * Rota anahtarı İNGİLİZCE (`chat`), etiket Türkçe ("Sohbet") — on iki modülün
 * tamamında geçerli olan kural.
 */
export default function ChatPage() {
  return <ChatScreen />;
}
