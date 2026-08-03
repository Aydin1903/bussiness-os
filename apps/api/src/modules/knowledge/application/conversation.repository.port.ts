import { type LlmMessage } from './llm.port';
import { type TenantId } from '../domain/tenant-id.value-object';

/** DI token'i. */
export const CONVERSATION_REPOSITORY = Symbol('CONVERSATION_REPOSITORY');

/** Bir konusmaya yazilacak tur. */
export interface NewMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

/**
 * `knowledge.conversations` + `knowledge.messages` kaliciligi (ADR-0030 §1.1).
 *
 * Iki tablo TEK port'ta: mesaj bir konusma OLMADAN var olamaz ve ikisi daima
 * birlikte yazilir. Ayri port'lar, cagirani "once hangisini yaz" kararina
 * zorlardi — ve o karar burada tek bir yerde, `appendTurn`'de veriliyor.
 */
export interface ConversationRepository {
  /**
   * Konusmanin SON `limit` mesajini KRONOLOJIK sirada dondurur.
   *
   * Konusma yoksa veya baska bir tenant'a aitse bos dizi doner — RLS zaten
   * gormeyecegi icin ayrica kontrol GEREKMEZ. Bu, "var olmayan
   * `conversation_id`" ile "baska tenant'in `conversation_id`'si" arasinda
   * FARK OLMAMASI demektir; ikisi de sessizce bos gecmise duser (P2 ile ayni
   * ilke: varlik sizdirilmaz).
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
    readonly tenantId: TenantId;
    readonly userId: string;
    /** `null` ise yeni konusma acilir. */
    readonly conversationId: string | null;
    /** Yeni konusma acilacaksa kullanilacak id. */
    readonly newConversationId: string;
    readonly messages: readonly NewMessage[];
  }): Promise<{ readonly conversationId: string }>;
}
