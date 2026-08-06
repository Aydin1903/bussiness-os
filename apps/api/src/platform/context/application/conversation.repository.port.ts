import { type LlmMessage } from '../../../shared/llm.port';

/** DI token'i. */
export const CONVERSATION_REPOSITORY = Symbol('CONVERSATION_REPOSITORY');

/** Bir konusmaya yazilacak tur. */
export interface NewMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

/**
 * `platform.conversations` + `platform.messages` kaliciligi (ADR-0030 §1.1).
 *
 * Iki tablo TEK port'ta: mesaj bir konusma OLMADAN var olamaz ve ikisi daima
 * birlikte yazilir. Ayri port'lar, cagirani "once hangisini yaz" kararina
 * zorlardi — ve o karar burada tek bir yerde, `appendTurn`'de veriliyor.
 */
export interface ConversationRepository {
  /**
   * Konusmanin SAHIBI olan kullanicinin id'si; konusma GORUNMUYORSA `null`.
   *
   * `null` uc farkli durumu birden temsil eder ve bu BILINCLIDIR (P2): konusma
   * hic yok · baska tenant'a ait (RLS gizler) · silinmis. Cagiran taraf ucunu
   * de AYNI sekilde reddeder; ayirt etmek "bu id gercek mi" sorusuna cevap
   * vermek olurdu.
   *
   * Kullanici karsilastirmasi CAGIRANDA yapilir, burada degil: repository veri
   * dondurur, YETKI KARARI vermez.
   */
  findOwnerUserId(conversationId: string): Promise<string | null>;

  /**
   * Konusmanin SON `limit` mesajini KRONOLOJIK sirada dondurur.
   *
   * Bu metot cagrildiginda sahiplik ZATEN dogrulanmis olmalidir
   * (`findOwnerUserId`): erisimi olmayan bir konusma buraya hic gelmez.
   */
  findRecentMessages(input: {
    readonly conversationId: string;
    readonly limit: number;
  }): Promise<LlmMessage[]>;

  /**
   * Bir soru-cevap turunu yazar; konusma yoksa AYNI transaction'da olusturur.
   *
   * `conversationId` verilmezse yeni bir konusma acilir ve id'si doner. Konusma
   * kaydinin mesajlarla AYNI transaction'da olusmasi bilinclidir: LLM cagrisi
   * BASARILI olduktan sonra yazilir, dolayisiyla bos (mesajsiz) bir konusma
   * satiri hic olusmaz.
   */
  appendTurn(input: {
    /**
     * Ham tenant kimligi.
     *
     * Knowledge'in `TenantId` value object'i BILEREK kullanilmiyor: konusma
     * artik platformun ve platform bir is modulunun domain tipine baglanamaz.
     */
    readonly tenantId: string;
    readonly userId: string;
    /** `null` ise yeni konusma acilir. */
    readonly conversationId: string | null;
    /** Yeni konusma acilacaksa kullanilacak id. */
    readonly newConversationId: string;
    readonly messages: readonly NewMessage[];
  }): Promise<{ readonly conversationId: string }>;
}
