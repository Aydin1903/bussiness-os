import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DrizzleTransactionManager } from '../../src/infrastructure/database/drizzle-transaction-manager.adapter';
import { DrizzleConversationRepository } from '../../src/platform/context/infrastructure/drizzle-conversation.repository';
import { startTestDatabase, type TestDatabase } from './support/test-database';

/**
 * `DrizzleConversationRepository` — GERCEK PostgreSQL, SAHTE saglayici YOK,
 * API anahtari GEREKMEZ.
 *
 * ============================================================================
 * NEDEN AYRI BIR SPEC — kirmizi/yesil karari gercek modele birakilmaz
 * ============================================================================
 * "Konusma hafizasi calisiyor" iddiasi bes halkali bir zincir:
 *
 *   1. mesajlar yaziliyor            -> ask-knowledge.integration
 *   2. GERI OKUNUYOR (sira + limit)  -> BU SPEC
 *   3. use case `history` geciriyor  -> ask-knowledge.use-case.spec (birim)
 *   4. adapter govdeye koyuyor       -> deepseek-llm.adapter.spec (birim)
 *   5. model gecmisi kullaniyor      -> ask-knowledge.integration (gercek model)
 *
 * 2. halka daha once HICBIR YERDE dogrulanmiyordu; tek kaniti 5. halkayi olcen
 * gercek-model testiydi. O test, modelin sistem promptundaki 2. kurala ("baglamda
 * yoksa yonlendir") kaymasi yuzunden KARARSIZ cikti — ve kararsiz oldugu icin
 * 2. halkanin kirilmasini da guvenilir sekilde yakalayamazdi.
 *
 * Burasi determinist katman: her CI kosusunda calisir, anahtar istemez, para
 * harcamaz. Gercek-model testi kaldirilmadi — ama artik tek basina karar vermiyor.
 * ============================================================================
 */

const TENANT_A = '018f3a2b-7c4d-7e1f-8a2b-0000000000a1';
const TENANT_B = '018f3a2b-7c4d-7e1f-8a2b-0000000000b1';
const USER_A = '018f3a2b-7c4d-7e1f-9b3c-00000000000a';
const USER_B = '018f3a2b-7c4d-7e1f-9b3c-00000000000b';

/** Ardisik, MONOTON id — UUID v7'nin zaman-sirali olma ozelligini taklit eder. */
let seq = 0;
function nextId(): string {
  seq += 1;
  return `018f3a2b-7c4d-7e1f-7c1d-${String(seq).padStart(12, '0')}`;
}

describe('DrizzleConversationRepository (gercek PostgreSQL)', () => {
  let database: TestDatabase;
  let transactionManager: DrizzleTransactionManager;
  let repository: DrizzleConversationRepository;

  beforeAll(async () => {
    database = await startTestDatabase();
    transactionManager = new DrizzleTransactionManager(database.appPool);
    repository = new DrizzleConversationRepository();
  }, 180_000);

  afterAll(async () => {
    await database.stop();
  });

  beforeEach(async () => {
    await database.ownerPool.query('TRUNCATE platform.messages, platform.conversations CASCADE');
    await database.ownerPool.query('TRUNCATE platform.memberships, platform.tenants CASCADE');
    await seedTenant(TENANT_A, 'acme');
    await seedTenant(TENANT_B, 'globex');
  });

  /** `platform.tenants` FORCE TASIMAZ (MT §12.4.1); sahip rol dogrudan yazar. */
  async function seedTenant(id: string, slug: string): Promise<void> {
    await database.ownerPool.query(
      `INSERT INTO platform.tenants (id, name, slug, status, owner_user_id, created_at)
       VALUES ($1, $2, $3, 'active', $4, now())`,
      [id, slug.toUpperCase(), slug, USER_A],
    );
  }

  /** Bir tur (soru + cevap) yazar; use case'in T2'siyle ayni cagri. */
  async function appendTurn(options: {
    tenantId: string;
    userId: string;
    conversationId: string | null;
    question: string;
    answer: string;
  }): Promise<string> {
    const { conversationId } = await transactionManager.runInTenantTransaction(
      options.tenantId,
      () =>
        repository.appendTurn({
          tenantId: options.tenantId,
          userId: options.userId,
          conversationId: options.conversationId,
          newConversationId: nextId(),
          messages: [
            { id: nextId(), role: 'user', content: options.question },
            { id: nextId(), role: 'assistant', content: options.answer },
          ],
        }),
    );
    return conversationId;
  }

  function readHistory(
    tenantId: string,
    conversationId: string,
    limit: number,
  ): Promise<{ role: string; content: string }[]> {
    return transactionManager.runInTenantTransaction(tenantId, () =>
      repository.findRecentMessages({ conversationId, limit }),
    );
  }

  // --- Gidis-donus: yazilan gecmis GERI OKUNUYOR mu -------------------------

  it('bir turdan sonra soru ve cevap KRONOLOJIK sirada geri okunur', async () => {
    const conversationId = await appendTurn({
      tenantId: TENANT_A,
      userId: USER_A,
      conversationId: null,
      question: 'Fatura surecini kim yonetiyor?',
      answer: 'Ayse Yilmaz yonetiyor.',
    });

    expect(await readHistory(TENANT_A, conversationId, 8)).toEqual([
      { role: 'user', content: 'Fatura surecini kim yonetiyor?' },
      { role: 'assistant', content: 'Ayse Yilmaz yonetiyor.' },
    ]);
  });

  it('AYNI transaction da yazilan iki mesaj bile dogru siralanir', async () => {
    // Ikisi de TEK insert ile yazilir, yani `created_at` AYNIDIR. Siralamayi
    // ayakta tutan sey `id` tie-breaker'i; o olmasaydi soru-cevap sirasi
    // rastgele donebilir ve model kendi cevabini kullanicinin sorusu sanabilirdi.
    const conversationId = await appendTurn({
      tenantId: TENANT_A,
      userId: USER_A,
      conversationId: null,
      question: 'ilk',
      answer: 'ikinci',
    });

    const rows = await database.ownerPool.query<{ created_at: Date }>(
      'SELECT created_at FROM platform.messages WHERE conversation_id = $1',
      [conversationId],
    );
    const stamps = new Set(rows.rows.map((row) => row.created_at.toISOString()));
    expect(stamps.size).toBe(1);

    const history = await readHistory(TENANT_A, conversationId, 8);
    expect(history.map((message) => message.content)).toEqual(['ilk', 'ikinci']);
  });

  it('iki tur sonra DORT mesaj, tur sirasi bozulmadan doner', async () => {
    const conversationId = await appendTurn({
      tenantId: TENANT_A,
      userId: USER_A,
      conversationId: null,
      question: 'birinci soru',
      answer: 'birinci cevap',
    });
    await appendTurn({
      tenantId: TENANT_A,
      userId: USER_A,
      conversationId,
      question: 'ikinci soru',
      answer: 'ikinci cevap',
    });

    expect((await readHistory(TENANT_A, conversationId, 8)).map((m) => m.content)).toEqual([
      'birinci soru',
      'birinci cevap',
      'ikinci soru',
      'ikinci cevap',
    ]);
  });

  // --- `limit`: EN YENI n, en eski n DEGIL ---------------------------------

  it('limit asilinca EN YENI mesajlar tutulur, en eskiler DUSER', async () => {
    // Repository'nin sinif yorumundaki asil iddia: `ASC LIMIT n` en ESKI n'i
    // verirdi ve uzun bir konusmada model gecmisin basini gorup SONUNU
    // kacirirdi — yani takip sorusu cozulemezdi.
    const conversationId = await appendTurn({
      tenantId: TENANT_A,
      userId: USER_A,
      conversationId: null,
      question: 'eski soru',
      answer: 'eski cevap',
    });
    await appendTurn({
      tenantId: TENANT_A,
      userId: USER_A,
      conversationId,
      question: 'yeni soru',
      answer: 'yeni cevap',
    });

    expect((await readHistory(TENANT_A, conversationId, 2)).map((m) => m.content)).toEqual([
      'yeni soru',
      'yeni cevap',
    ]);
  });

  it('limit=0 ise bos doner (sorgu yine de patlamaz)', async () => {
    const conversationId = await appendTurn({
      tenantId: TENANT_A,
      userId: USER_A,
      conversationId: null,
      question: 'soru',
      answer: 'cevap',
    });

    expect(await readHistory(TENANT_A, conversationId, 0)).toEqual([]);
  });

  // --- Karisma yok: konusma · kullanici · tenant ---------------------------

  it('BASKA konusmanin mesajlari KARISMAZ', async () => {
    const first = await appendTurn({
      tenantId: TENANT_A,
      userId: USER_A,
      conversationId: null,
      question: 'birinci konusma sorusu',
      answer: 'birinci konusma cevabi',
    });
    await appendTurn({
      tenantId: TENANT_A,
      userId: USER_A,
      conversationId: null,
      question: 'ikinci konusma sorusu',
      answer: 'ikinci konusma cevabi',
    });

    const history = await readHistory(TENANT_A, first, 8);
    expect(history).toHaveLength(2);
    expect(history.map((m) => m.content)).not.toContain('ikinci konusma sorusu');
  });

  it('ayni tenant taki BASKA kullanicinin konusmasi ayri kalir', async () => {
    const mine = await appendTurn({
      tenantId: TENANT_A,
      userId: USER_A,
      conversationId: null,
      question: 'benim sorum',
      answer: 'benim cevabim',
    });
    await appendTurn({
      tenantId: TENANT_A,
      userId: USER_B,
      conversationId: null,
      question: 'meslektasimin sorusu',
      answer: 'meslektasimin cevabi',
    });

    expect((await readHistory(TENANT_A, mine, 8)).map((m) => m.content)).toEqual([
      'benim sorum',
      'benim cevabim',
    ]);
  });

  it('BASKA tenant in mesajlari RLS e takilir', async () => {
    const foreign = await appendTurn({
      tenantId: TENANT_B,
      userId: USER_B,
      conversationId: null,
      question: 'B nin sorusu',
      answer: 'B nin cevabi',
    });

    // Id BILINSE bile: daraltmayi elle `WHERE tenant_id` degil RLS yapiyor.
    expect(await readHistory(TENANT_A, foreign, 8)).toEqual([]);
  });

  // --- `findOwnerUserId` — sahiplik kontrolunun veri kaynagi ---------------

  it('findOwnerUserId konusmayi acan kullaniciyi doner', async () => {
    const conversationId = await appendTurn({
      tenantId: TENANT_A,
      userId: USER_B,
      conversationId: null,
      question: 'soru',
      answer: 'cevap',
    });

    const owner = await transactionManager.runInTenantTransaction(TENANT_A, () =>
      repository.findOwnerUserId(conversationId),
    );

    expect(owner).toBe(USER_B);
  });

  it('findOwnerUserId BASKA tenant in konusmasi icin null doner (RLS)', async () => {
    const foreign = await appendTurn({
      tenantId: TENANT_B,
      userId: USER_B,
      conversationId: null,
      question: 'soru',
      answer: 'cevap',
    });

    const owner = await transactionManager.runInTenantTransaction(TENANT_A, () =>
      repository.findOwnerUserId(foreign),
    );

    expect(owner).toBeNull();
  });

  it('findOwnerUserId VAR OLMAYAN konusma icin null doner', async () => {
    const owner = await transactionManager.runInTenantTransaction(TENANT_A, () =>
      repository.findOwnerUserId('018f3a2b-7c4d-7e1f-7c1d-0000000000ff'),
    );

    expect(owner).toBeNull();
  });

  // --- Transaction zorunlulugu (MT §11.4 kural 2) --------------------------

  it('transaction disinda cagrilan repository hata verir', async () => {
    // Fail closed: `SET LOCAL`siz bir baglantida sorgu ya RLS'e takilir ya da
    // filtresiz calisir. Ikincisi butun tenant'lari acardi.
    await expect(
      repository.findRecentMessages({ conversationId: TENANT_A, limit: 8 }),
    ).rejects.toThrow(/Aktif transaction yok/);
  });
});
