import { Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';

import { conversations, messages } from '../../../infrastructure/database/schema';
import { requireTransaction } from '../../../infrastructure/database/transaction-context';
import type {
  ConversationRepository,
  NewMessage,
} from '../application/conversation.repository.port';
import type { LlmMessage } from '../../../shared/llm.port';
import type { TenantId } from '../domain/tenant-id.value-object';

/** `role` kolonu `text`; domain yalnizca iki degeri kabul eder. */
function toRole(value: string): 'user' | 'assistant' {
  return value === 'assistant' ? 'assistant' : 'user';
}

/**
 * `ConversationRepository`'nin Drizzle implementasyonu (ADR-0030 §1.1).
 *
 * Kendi transaction'ini ACMAZ: sinir use case'tedir (MT §13.3 kural 2).
 * Tenant daraltmasi RLS'tedir — `DrizzleNoteChunkSearchRepository` ile ayni
 * gerekce, orada ayrintili.
 */
@Injectable()
export class DrizzleConversationRepository implements ConversationRepository {
  /**
   * Konusmanin sahibini dondurur; RLS tenant'i zaten daraltir.
   *
   * Baska TENANT'in konusmasi politikaya takilir ve satir hic gelmez -> `null`.
   * Ayni tenant'taki baska KULLANICININ konusmasi ise gelir; ayrimi cagiran
   * yapar (`AskKnowledgeUseCase`).
   */
  async findOwnerUserId(conversationId: string): Promise<string | null> {
    const { db } = requireTransaction();

    const rows = await db
      .select({ userId: conversations.userId })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);

    return rows[0]?.userId ?? null;
  }

  /**
   * Son `limit` mesaji KRONOLOJIK sirada dondurur.
   *
   * Sorgu `DESC` siralar (en yeniler), sonra dizi TERS CEVRILIR. "Son N" ile
   * "kronolojik sira" ancak boyle birlikte saglanir: `ASC LIMIT n` en ESKI
   * n mesaji verirdi ve uzun bir konusmada model gecmisin basini gorup sonunu
   * kacirirdi.
   */
  async findRecentMessages(input: {
    readonly conversationId: string;
    readonly limit: number;
  }): Promise<LlmMessage[]> {
    const { db } = requireTransaction();

    const rows = await db
      .select({ role: messages.role, content: messages.content })
      .from(messages)
      .where(eq(messages.conversationId, input.conversationId))
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(input.limit);

    return rows.reverse().map((row) => ({ role: toRole(row.role), content: row.content }));
  }

  async appendTurn(input: {
    readonly tenantId: TenantId;
    readonly userId: string;
    readonly conversationId: string | null;
    readonly newConversationId: string;
    readonly messages: readonly NewMessage[];
  }): Promise<{ readonly conversationId: string }> {
    const { db } = requireTransaction();

    const conversationId = input.conversationId ?? input.newConversationId;

    if (input.conversationId === null) {
      // Konusma mesajlarla AYNI transaction'da acilir: LLM cagrisi basarili
      // olduktan sonra yazildigi icin BOS (mesajsiz) bir konusma satiri hic
      // olusmaz (bkz. `AskKnowledgeUseCase` sinif yorumu).
      await db.insert(conversations).values({
        id: conversationId,
        tenantId: input.tenantId.value,
        userId: input.userId,
      });
    }

    // TEK insert: soru ve cevap ya birlikte yazilir ya hic. Cevapsiz bir soru,
    // bir sonraki istegin gecmisini kirletirdi.
    await db.insert(messages).values(
      input.messages.map((message) => ({
        id: message.id,
        tenantId: input.tenantId.value,
        conversationId,
        role: message.role,
        content: message.content,
      })),
    );

    return { conversationId };
  }
}
