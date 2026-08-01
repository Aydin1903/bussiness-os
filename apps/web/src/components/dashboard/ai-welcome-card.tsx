import { SparkleIcon } from '@/components/icons';

/**
 * AI karşılama kartı.
 *
 * ============================================================================
 * PLACEHOLDER — GERÇEK AI ENTEGRASYONU YOK
 * ============================================================================
 * Buradaki metin ve "öneriler" TAMAMEN SABİTTİR (örnektir). Hiçbir LLM çağrısı,
 * hiçbir tenant verisi kullanılmaz. Ürün vizyonu (CLAUDE.md: "AI merkezde,
 * modüller ona bağlam sağlar") görsel olarak temsil edilir; gerçek AI katmanı
 * (LLMPort + adapter, ARCHITECTURE §8) ayrı bir fazda gelir.
 * ============================================================================
 */
const EXAMPLE_PROMPTS: readonly string[] = [
  'Son 6 ayı analiz et',
  'Nakit akışını özetle',
  'Riskli müşterileri göster',
];

export function AiWelcomeCard() {
  return (
    <section className="rounded-card border border-border bg-surface p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-fg">
          <SparkleIcon width={18} height={18} />
        </span>
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">İyi çalışmalar</h2>
          <p className="max-w-xl text-sm text-fg-muted">
            Ben Business OS asistanınım. Şirketinizin müşterilerini, finansını ve projelerini
            birbirine bağladıkça size gerçek analizler ve gerekçeli öneriler sunacağım.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {EXAMPLE_PROMPTS.map((prompt) => (
          <span
            key={prompt}
            className="rounded-full border border-border bg-bg px-3 py-1.5 text-xs text-fg-muted"
          >
            {prompt}
          </span>
        ))}
      </div>

      <p className="mt-4 text-xs text-fg-muted/70">
        Örnek önerilerdir — AI yanıtları modüller bağlandıkça etkinleşecek.
      </p>
    </section>
  );
}
