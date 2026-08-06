/**
 * Context Engine hatalari (ADR-0031 §5).
 *
 * Knowledge'in `knowledge.error.ts`'inden AYRILDI: `/ask` artik bir PLATFORM
 * ucudur ve konusma sahipligi hicbir is moduluna ait degildir.
 */
export abstract class ContextDomainError extends Error {
  abstract readonly code: string;
}

/**
 * Baskasinin konusmasina erisim denemesi.
 *
 * ============================================================================
 * RLS TENANT'I KORUR, KULLANICIYI KORUMAZ
 * ============================================================================
 * `platform.conversations` politikasi `tenant_id` uzerindedir. AYNI
 * tenant'taki BASKA bir kullanicinin konusma id'si RLS'e TAKILMAZ ve gecmisi
 * baglama girerdi — yani bir kullanici, meslektasinin gecmis sorularini modele
 * okutabilirdi. Kullanici siniri bu yuzden uygulama katmaninda uygulanir.
 *
 * UC DURUM AYNI SONUCU verir (P2): konusma yok · baska tenant · baska
 * kullanici. Ayirt etmek "bu id gercek mi" sorusuna cevap vermek olurdu.
 * ============================================================================
 */
export class ConversationAccessDeniedError extends ContextDomainError {
  readonly code = 'CONVERSATION_ACCESS_DENIED';

  constructor() {
    super('Bu konusmaya erisiminiz yok.');
  }
}
