/** DI token'i. */
export const OAUTH_STATE_GENERATOR = Symbol('OAUTH_STATE_GENERATOR');

/**
 * OAuth akisinin opak rastgele degerlerini uretir: `state` ve `nonce`.
 *
 * ============================================================================
 * ⚠️ NEDEN BIR PORT — VE BU KUSURU LINT YAKALADI
 * ============================================================================
 * Ilk yazimda `BeginOAuthUseCase` bu degerleri dogrudan
 * `infrastructure/oauth/pkce`ten cagiriyordu ve `import/no-restricted-paths`
 * kurali onu REDDETTI: _"bagimlilik yonu daima iceri dogrudur; application
 * katmani infrastructure katmanini import edemez"_ (ARCHITECTURE 4).
 *
 * ⚠️ Kural burada bir bicimsellik degil: `randomBytes` bir NODE API'sidir ve
 * use case'i platforma baglar — testte determinize edilemez, tarayici/worker
 * gibi baska bir calisma ortamina tasinamaz. Port'lasinca ikisi de cozulur.
 *
 * ⚠️ PKCE `code_verifier`i BU PORT'TA DEGILDIR ve olmamalidir: onu SAGLAYICI
 * ADAPTER'I uretir (`buildAuthorization`), cunku `code_challenge`i hesaplayip
 * yetkilendirme URL'ine koyan da odur. Ikisini ayirmak, dogrulayici ile
 * challenge'in ayni yerde uretilmesini garanti eder — ayri yerlerde
 * uretilselerdi bir gun ayrisabilir ve PKCE SESSIZCE bozulurdu.
 * ============================================================================
 */
export interface OAuthStateGenerator {
  /**
   * Tahmin EDILEMEZ bir deger uretir.
   *
   * ⚠️ Sozlesme "rastgele" degil **KRIPTOGRAFIK OLARAK GUVENLI**dir: tahmin
   * edilebilir bir `state` CSRF korumasini, tahmin edilebilir bir `nonce`
   * replay korumasini tumuyle anlamsiz kilar. `Math.random()` tabanli bir
   * implementasyon bu sozlesmeyi IHLAL EDER.
   */
  generate(): string;
}
