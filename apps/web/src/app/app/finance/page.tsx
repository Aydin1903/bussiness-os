import { TransactionsScreen } from '@/components/finance/transactions-screen';

/**
 * `/app/finance` — gelir/gider kayıtları.
 *
 * `OnboardingGate` ile SARILMAZ (`/app/crm` ve `/app/projects` ile aynı
 * gerekçe): o kapı "hiç notunuz yok" koşuluna bakar ve kullanıcıyı Knowledge
 * sihirbazına yollar. Finans kayıtlarına bakmak isteyen birini not yazma
 * sihirbazına düşürmek, ayrı bir modülün boşluğunu bu modülün önüne koymak
 * olurdu.
 *
 * Sayfa Server Component kalır; ekranın tamamı Client'tır.
 */
export default function FinancePage() {
  return <TransactionsScreen />;
}
