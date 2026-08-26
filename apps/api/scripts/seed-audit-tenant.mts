import { existsSync } from 'node:fs';

import { hash as argon2Hash } from '@node-rs/argon2';
import { Client } from 'pg';

/**
 * DENETIM TENANT'I — `POST /ask` dagilimini OLCULEBILIR kilan tohumlama araci
 * (ADR-0048).
 *
 * ============================================================================
 * NEDEN VAR — ADR-0046 ALETI KURDU, OLCULECEK SEY YOKTU
 * ============================================================================
 * ADR-0046 `retrieval.select` satirini yazdi ve T2'nin girdisi ILK KEZ
 * olculebilir hale geldi. Ama o gun alinan TEK olcum bos bir tenant'taydi:
 *
 *     kayitli yapisal kaynak 6 · satir donduren 0 · bos donen 6
 *
 * ⚠️ Bu sayi T2 hakkinda HICBIR SEY soylemez — alti kaynagin konusacak verisi
 * yoktu. ADR-0045 ve ADR-0047'nin askiya aldigi IKI yapisal katkici
 * (`feedback-satisfaction`, `campaign-gap`) tam olarak bu boslugu bekliyor.
 *
 * Bu betik o boslugu kapatir: ON BIR modulun HEPSINDE veri olan, tekrar
 * calistirilabilir bir tenant uretir.
 *
 * ============================================================================
 * ⚠️ BU ARAC PROD'A DOKUNMAZ — VE BUNU KENDISI ZORLAR
 * ============================================================================
 * Betik bilinen parolali bir kullanici yaratir. Bu, yerel bir gelistirme
 * kolayligidir ve uretimde bir GUVENLIK ACIGIDIR. Iki kapi vardir (§ guards):
 *   1. `NODE_ENV=production` ise CALISMAZ,
 *   2. Hedef host yerel degilse CALISMAZ (`SEED_ALLOW_REMOTE_HOST=1` ile
 *      bilincli olarak asilabilir — ama o zaman da 1. kapi durur).
 *
 * ⚠️ Bir migration DEGILDIR: `drizzle/meta/_journal.json`a girmez, prod'un
 * `preDeployCommand`inde kosmaz, `pnpm verify`nin parcasi degildir.
 *
 * ============================================================================
 * IDEMPOTENT — BIRIKMELI DEGIL
 * ============================================================================
 * Her calisma once TENANT'IN KENDI satirlarini siler, sonra yeniden yazar.
 * "Varsa atla" (`ON CONFLICT DO NOTHING`) YETMEZDI: tarihler `now()`a GORELI
 * uretilir (§ relative dates) ve eski bir tohumlama, bugun artik alarm bandini
 * tetiklemeyen bayat tarihler birakirdi — yani arac sessizce ise yaramaz hale
 * gelirdi.
 *
 * ⚠️ Silme YALNIZCA bu tenant'in `tenant_id`si icindir. Baska hicbir tenant'in
 * verisine dokunmaz ve dokunamaz: baglanti `businessos_owner` ile kurulur ve
 * ⚠️ **o rol `rolbypassrls = false` tasir**, tablolar da `FORCE RLS`tir — yani
 * betik uygulamanin kendisiyle AYNI izolasyona tabidir.
 *
 * Calistirma:
 *   pnpm seed:audit-tenant                    (embedding YOK — bedava, hizli)
 *   pnpm seed:audit-tenant -- --with-embeddings   (anlamsal kaynaklar da dolar)
 */

// ===========================================================================
// Sabitler
// ===========================================================================

const TENANT_SLUG = 'denetim-tenant';
const OWNER_EMAIL = 'audit-owner@business-os.local';
const MEMBER_EMAIL = 'audit-member@business-os.local';

/**
 * ⚠️ BILINEN PAROLA — ve tam olarak bu yuzden § guards var.
 * ADR-0018'in politikasini karsilar (uzunluk + karisiklik).
 */
const SEED_PASSWORD = 'DenetimTenant!2026';

/**
 * ADR-0017'nin Argon2id parametreleri — `ADR_0017_ARGON2_PARAMETERS`in kopyasi.
 *
 * ============================================================================
 * ⚠️ NEDEN KOPYA KABUL EDILEBILIR — DRIFT SESSIZ DEGIL, KENDI KENDINI ONARIR
 * ============================================================================
 * Ilk tasarimda bu sabit `src/`ten import ediliyordu, gerekce "ayrisirlarsa
 * giris sessizce kirilir" idi. ⚠️ **O gerekce YANLISTI ve olcerek duzeltildi:**
 *
 *   * Argon2 bir **PHC dizesi** uretir ve parametreleri (`m`, `t`, `p`) dizenin
 *     ICINDE tasir. `argon2Verify` dogrularken YAPILANDIRILMIS degil
 *     HASH'TEKI parametreleri kullanir — yani farkli parametreyle uretilmis
 *     bir hash de **sorunsuz dogrulanir**.
 *   * `LoginUseCase` zaten `needsRehash` kontrolu yapar ve gerekiyorsa parolayi
 *     **ilk giriste seffafca yeniden hash'ler** (`login.use-case.ts` §6.3).
 *
 * Yani ayrismanin en kotu sonucu, denetim kullanicisinin ilk girisinde **bir
 * kez** yeniden hash'lenmesidir. Gorunur bir maliyeti bile yoktur.
 *
 * ⚠️ Buna karsilik import'un bedeli GERCEKTI: `.ts` uzantili bir import
 * `allowImportingTsExtensions` ister, o bayrak `noEmit` ister ve ⚠️ ayni
 * tsconfig ile kosan **`nest build` EMIT EDER** — yani bayrak derlemeyi
 * bozardi. Bir uretim derlemesini bir gelistirme betigi icin riske atmak
 * yanlis takas olurdu.
 *
 * ⚠️ Yine de degerler ayrisirsa burasi ADR-0017'yi degil kendini yanlislar:
 * tek dogruluk kaynagi `src/modules/identity/infrastructure/argon2-parameters.ts`tir.
 */
const SEED_ARGON2_PARAMETERS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
} as const;

/** OpenAI embedding modeli — `env.schema.ts`in varsayilaniyla ayni. */
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;
const EMBEDDING_BATCH = 32;

/**
 * Sabit kimlikler. Idempotentligin dayanagi budur: her calismada AYNI id'ler
 * uretilir, yani silme hedefi de yeniden yazma hedefi de belirlidir.
 */
function id(group: number, index: number): string {
  const tail = `${String(group).padStart(4, '0')}${String(index).padStart(8, '0')}`;
  return `01994800-0000-7000-8000-${tail}`;
}

const TENANT_ID = id(1, 1);
const OWNER_USER_ID = id(1, 2);
const MEMBER_USER_ID = id(1, 3);

// ===========================================================================
// Tarih yardimcilari — ⚠️ HEPSI `now()`A GORELI
// ===========================================================================
//
// ⚠️ SABIT TARIH YAZILMAZ. `today.ts`in ve `context-contributors.integration
// .spec`in ayni tuzagi: bugun alarm bandini tetikleyen sabit bir tarih, uc ay
// sonra tetiklemez ve arac SESSIZCE ise yaramaz hale gelir — betik calisir,
// satirlar yazilir, ama olcum "her sey saglikli" der.

const NOW = new Date();

function at(offsetDays: number, hour = 10): Date {
  const value = new Date(NOW);
  value.setUTCDate(value.getUTCDate() + offsetDays);
  value.setUTCHours(hour, 0, 0, 0);
  return value;
}

function day(offsetDays: number): string {
  return at(offsetDays).toISOString().slice(0, 10);
}

// ===========================================================================
// Giris noktasi
// ===========================================================================

interface Options {
  readonly withEmbeddings: boolean;
}

async function main(): Promise<void> {
  loadEnv();

  const options: Options = { withEmbeddings: process.argv.includes('--with-embeddings') };
  const url = migrationUrl();

  assertNotProduction();
  assertLocalHost(url);

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    await seedPlatform(client);
    const embeddings = await buildEmbeddings(options);
    await seedTenantData(client, embeddings);
    await report(client, options);
  } finally {
    await client.end();
  }
}

// ===========================================================================
// § guards — betigin PROD'DA CALISMAYI REDDETMESI
// ===========================================================================

function assertNotProduction(): void {
  if (process.env.NODE_ENV === 'production') {
    fail(
      'NODE_ENV=production. Bu betik bilinen parolali kullanici yaratir ve ' +
        'uretimde CALISTIRILAMAZ. Bir bayrakla asilamaz — kapi bilerek kosulsuzdur.',
    );
  }
}

/**
 * Hedef host yerel mi?
 *
 * ⚠️ `NODE_ENV` tek basina yetmez: bir gelistiricinin makinesinde
 * `NODE_ENV=development` iken UZAK bir veritabanina isaret eden bir
 * `DATABASE_MIGRATION_URL` bulunabilir (ornegin bir hata ayiklama oturumundan
 * kalan). Iki kapi BIRLIKTE anlamlidir.
 */
function assertLocalHost(url: string): void {
  const host = new URL(url).hostname;
  const local = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === 'db';

  if (!local && process.env.SEED_ALLOW_REMOTE_HOST !== '1') {
    fail(
      `Hedef host yerel degil (${host}). Tohumlama YEREL/TEST icindir. ` +
        'Bilincli olarak devam etmek icin SEED_ALLOW_REMOTE_HOST=1 verilmelidir.',
    );
  }
}

// ===========================================================================
// Platform: tenant + iki kullanici + uyelikler
// ===========================================================================

/**
 * ⚠️ IKI ROL, TEK TENANT — ve bu bir suslemenin degil OLCUMUN gerekliligi.
 *
 * `owner` on bes katkicinin HEPSINI cagirtir (`returned` / `empty` ayrimi
 * gorunur). `member` ise ADR-0034'un dar katalogu yuzunden `cashflow:read`
 * TASIMAZ — yani ayni tenant'ta `forbidden` durumu da uretilebilir.
 * ADR-0046'nin dort durumunun ucu tek bir tohumlamayla gozlenebilir olur.
 */
async function seedPlatform(client: Client): Promise<void> {
  const passwordHash = await argon2Hash(SEED_PASSWORD.normalize('NFKC'), {
    memoryCost: SEED_ARGON2_PARAMETERS.memoryCost,
    timeCost: SEED_ARGON2_PARAMETERS.timeCost,
    parallelism: SEED_ARGON2_PARAMETERS.parallelism,
    outputLen: SEED_ARGON2_PARAMETERS.hashLength,
  });

  await client.query('BEGIN');
  try {
    for (const [userId, email] of [
      [OWNER_USER_ID, OWNER_EMAIL],
      [MEMBER_USER_ID, MEMBER_EMAIL],
    ] as const) {
      await client.query(
        `INSERT INTO platform.users (id, email, email_verified, status, created_at)
         VALUES ($1, $2, true, 'active', now())
         ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email,
                                        email_verified = true,
                                        status = 'active'`,
        [userId, email],
      );
      await client.query(
        `INSERT INTO platform.credentials (user_id, password_hash, password_changed_at)
         VALUES ($1, $2, now())
         ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash,
                                             password_changed_at = now()`,
        [userId, passwordHash],
      );
    }

    await client.query(
      `INSERT INTO platform.tenants (id, slug, name, status, owner_user_id, created_at, updated_at)
       VALUES ($1, $2, 'Denetim Tenanti (yerel)', 'active', $3, now(), now())
       ON CONFLICT (id) DO UPDATE SET slug = EXCLUDED.slug,
                                      status = 'active',
                                      updated_at = now()`,
      [TENANT_ID, TENANT_SLUG, OWNER_USER_ID],
    );

    // ⚠️ `platform.memberships` FORCE RLS tasir — tenant baglami SET edilmeden
    // yazilamaz. Betik burada uygulamanin kendi kuralina uyar.
    await client.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', TENANT_ID]);

    for (const [membershipId, userId, role] of [
      [id(1, 4), OWNER_USER_ID, 'owner'],
      [id(1, 5), MEMBER_USER_ID, 'member'],
    ] as const) {
      await client.query(
        `INSERT INTO platform.memberships
           (id, tenant_id, user_id, role, status, joined_at, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'active', now(), now(), now())
         ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, status = 'active', updated_at = now()`,
        [membershipId, TENANT_ID, userId, role],
      );
    }

    await client.query('COMMIT');
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    throw error;
  }
}

// ===========================================================================
// Anlatisal metinler — embedding uretilecek olanlar TEK YERDE toplanir
// ===========================================================================
//
// ⚠️ Metinler ve embedding'ler AYNI SIRAYI paylasir. Ayri ayri yazilsalardi
// bir metin eklendiginde vektor kaymasi SESSIZ olurdu: her kayit yanlis
// vektorle eslesir, arama sacmalar, hicbir test kirmizi yanmaz.

const KNOWLEDGE_NOTES = [
  {
    title: 'Fatura kesim politikasi',
    body: 'Faturalar ayin son is gunu kesilir. Vadesi gecen alacaklar icin muhasebe her cuma hatirlatma gonderir; iki hatirlatmadan sonra satis ekibi devreye girer.',
  },
  {
    title: 'Tedarik gecikmelerinde izlenecek yol',
    body: 'Bir tedarikci teslimati bir haftadan fazla gecikirse alternatif tedarikciden teklif alinir ve musteriye proaktif bilgi verilir. Gecikmeyi musteriden ogrenmek en kotu senaryodur.',
  },
  {
    title: 'Yeni musteri karsilama akisi',
    body: 'Sozlesme imzalandiktan sonraki uc is gunu icinde tanisma toplantisi yapilir, proje ekibi tanitilir ve ilk teslim tarihi yaziyla teyit edilir.',
  },
];

const CRM_INTERACTION_BODIES = [
  'Kuzey Yapi ile butce toplantisi yapildi. Teklifi begendiler ama odeme vadesini 60 gune cikarmak istiyorlar; finans tarafiyla gorusulecek.',
  'Ege Tekstil satin alma muduru aradi: mevcut tedarikcilerinden memnun degiller, gecis maliyetini soruyorlar. Sicak firsat.',
  'Marmara Lojistik ile yapilan gorusmede projenin ikinci fazinin butcesi henuz onaylanmadi. Karar ay sonunu bulacak.',
  'Kuzey Yapi teknik ekibi entegrasyon icin ek gun istedi. Takvim baskisi var, teslim tarihi riske girebilir.',
];

const PROJECT_NOTE_BODIES = [
  'Tasarim onaylandi, kodlamaya gecildi. Ancak API tarafinda beklenmedik bir bagimlilik cikti ve iki gunluk gecikme olustu.',
  'Musteri demo sonrasi kapsam degisikligi istedi. Ek is olarak fiyatlandirilacak, mevcut teslim tarihi korunacak.',
  'Test ortami kuruldu. Yuk testinde yanit sureleri hedefin uzerinde cikti; onbellek stratejisi gozden geciriliyor.',
];

const FINANCE_COMMENTARY_BODIES = [
  'Bu ay nakit sikisti: iki buyuk musteri odemeyi geciktirdi ve ayni doneme kira ile sigorta odemesi denk geldi.',
  'Gider tarafinda en buyuk kalem yazilim lisanslari oldu. Yillik odemeye gecmek nakit akisini rahatlatabilir.',
  'Gelir gecen aya gore dustu. Sebep tek seferlik bir proje tesliminin bir sonraki aya kaymasi; yapisal bir sorun degil.',
];

const SUPPLIER_INTERACTION_BODIES = [
  'Anadolu Metal ile fiyat gorusmesi: ton basi fiyati %8 artirmak istiyorlar, hacim taahhudu karsiliginda %4te anlasabiliriz.',
  'Ege Ambalaj son iki teslimati gec yapti. Uyari verildi, bir sonraki gecikmede alternatif tedarikciye gecilecek.',
  'Trakya Kimya odeme vadesini 30 gunden 45 gune cikarmayi kabul etti. Nakit akisi acisindan olumlu.',
];

const FEEDBACK_ENTRIES = [
  {
    rating: 2,
    channel: 'Google',
    comment: 'Siparisim iki hafta gecikti ve kimse geri donmedi. Takip etmek zorunda kaldim.',
  },
  {
    rating: 1,
    channel: 'telefon',
    comment: 'Urun hasarli geldi. Degisim sureci cok yavas isledi, bir daha dusunurum.',
  },
  {
    rating: 5,
    channel: 'Google',
    comment: 'Ekip cok ilgiliydi, kurulum sozlesmede yazandan once tamamlandi.',
  },
  {
    rating: 4,
    channel: 'e-posta',
    comment: 'Genel olarak memnunuz. Raporlama ekraninin biraz daha detayli olmasini isterdik.',
  },
  { rating: 3, channel: 'anket', comment: null },
  { rating: 5, channel: 'anket', comment: null },
];

const DOCUMENT_ENTRIES = [
  {
    filename: 'kuzey-yapi-cerceve-sozlesme.pdf',
    label: 'Kuzey Yapi cerceve sozlesme',
    chunk:
      'Isbu cerceve sozlesme kapsaminda taraflar, hizmet bedelinin her ayin besinci is gunune kadar odenmesi ve gecikme halinde aylik yuzde iki gecikme faizi uygulanmasi konusunda mutabik kalmislardir.',
  },
  {
    filename: 'ege-tekstil-gizlilik-sozlesmesi.pdf',
    label: 'Ege Tekstil gizlilik sozlesmesi',
    chunk:
      'Taraflar, isbu sozlesme suresince ve sona ermesinden itibaren bes yil boyunca ogrendikleri ticari sirlari ucuncu kisilerle paylasmayacaklarini kabul ve taahhut ederler.',
  },
];

const APPOINTMENT_NOTES = [
  'Dis temizligi ve implant kontrolu yapildi. Alt cene icin ikinci seans onerildi.',
  'Ilk tanisma gorusmesi: musteri mevcut sistemden gocu soruyor, veri aktarimi kritik.',
  'Servis bakimi tamamlandi, fren balatalari bir sonraki bakimda degisecek.',
];

const CAMPAIGN_RESULT_NOTES = [
  'Sonbahar indirimi beklentinin uzerinde donus getirdi; 40 form geldi, en cok pazar gunu.',
  'E-posta kampanyasi zayif kaldi: acilma orani dusuk, konu basligi yeniden yazilmali.',
];

const INVENTORY_NOTES = [
  'Kritik parca — tedarik suresi uc hafta, stok dusmeden siparis verilmeli.',
  'Sezonluk urun, yaz aylarinda tuketim iki katina cikiyor.',
];

// ===========================================================================
// Embedding uretimi
// ===========================================================================

interface Embeddings {
  readonly enabled: boolean;
  readonly byText: ReadonlyMap<string, number[]>;
}

/**
 * ⚠️ EMBEDDING VARSAYILAN OLARAK KAPALIDIR — ve bu bir kolaylik degil bir
 * karardir: arac API anahtari OLMADAN da calismali, cunku ASIL isi
 * (yapisal kaynaklarin `returned` donmesi) embedding GEREKTIRMEZ. Yapisal
 * katkicilar veritabanini dogrudan sorgular.
 *
 * ⚠️ Bedeli acikca yazilir: bayraksiz calistirmada anlamsal kaynaklar `empty`
 * doner ve dagilim YARIM olculur.
 */
async function buildEmbeddings(options: Options): Promise<Embeddings> {
  if (!options.withEmbeddings) {
    console.log(
      '[seed] embedding ATLANIYOR (--with-embeddings verilmedi) — ' +
        'anlamsal kaynaklar `empty` donecek.',
    );
    return { enabled: false, byText: new Map() };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey === undefined || apiKey.trim() === '') {
    fail('--with-embeddings verildi ama OPENAI_API_KEY tanimli degil.');
  }

  const texts = [...new Set(embeddableTexts())];
  console.log(`[seed] ${String(texts.length)} metin icin embedding uretiliyor...`);

  const byText = new Map<string, number[]>();
  for (let offset = 0; offset < texts.length; offset += EMBEDDING_BATCH) {
    const batch = texts.slice(offset, offset + EMBEDDING_BATCH);
    const vectors = await embedBatch(apiKey, batch);
    batch.forEach((text, index) => {
      const vector = vectors[index];
      if (vector?.length !== EMBEDDING_DIMENSIONS) {
        fail(`Beklenen ${String(EMBEDDING_DIMENSIONS)} boyutlu vektor alinamadi.`);
      }
      byText.set(text, vector);
    });
  }

  return { enabled: true, byText };
}

async function embedBatch(apiKey: string, input: readonly string[]): Promise<number[][]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input }),
  });

  if (!response.ok) {
    fail(`OpenAI ${String(response.status)}: ${await response.text()}`);
  }

  const payload: unknown = await response.json();
  return readEmbeddings(payload);
}

/**
 * OpenAI cevabindan vektorleri cikarir.
 *
 * ⚠️ TIP ISARETI (`as`) KULLANILMAZ — `consistent-type-assertions` bunu yasakliyor
 * ve gerekcesi hakli: `as`, gelen JSON'un sekli hakkinda **dogrulanmamis bir
 * iddiadir**. Saglayici cevabinin sekli degistiginde `as` hicbir sey soylemez;
 * asagidaki daraltma ise bos dizi doner ve cagiran onu **boyut kontrolunde**
 * yakalar (`embedBatch` cagiran dongu). `openai-embedding.adapter.ts`in
 * `readEmbeddingField` fonksiyonuyla ayni desen.
 */
function readEmbeddings(payload: unknown): number[][] {
  if (typeof payload !== 'object' || payload === null || !('data' in payload)) {
    return [];
  }

  const { data } = payload;
  if (!Array.isArray(data)) {
    return [];
  }

  return data.map((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null || !('embedding' in entry)) {
      return [];
    }
    const { embedding } = entry;
    return Array.isArray(embedding)
      ? embedding.filter((n): n is number => typeof n === 'number')
      : [];
  });
}

/** Embedding uretilecek metinlerin TAM listesi — sirasi onemli degil, icerigi onemli. */
function embeddableTexts(): string[] {
  return [
    ...KNOWLEDGE_NOTES.map((note) => `${note.title}\n\n${note.body}`),
    ...CRM_INTERACTION_BODIES,
    ...PROJECT_NOTE_BODIES,
    ...FINANCE_COMMENTARY_BODIES,
    ...SUPPLIER_INTERACTION_BODIES,
    ...DOCUMENT_ENTRIES.map((entry) => entry.chunk),
    ...APPOINTMENT_NOTES,
    ...INVENTORY_NOTES,
    ...CAMPAIGN_RESULT_NOTES,
    ...FEEDBACK_ENTRIES.filter((entry) => entry.comment !== null).map((entry) =>
      feedbackVectorText(entry),
    ),
  ];
}

function feedbackVectorText(entry: (typeof FEEDBACK_ENTRIES)[number]): string {
  return `[Geri bildirim · ${day(-3)} · ${String(entry.rating)}/5 · ${entry.channel}] ${entry.comment ?? ''}`;
}

/** pgvector literali. `null` donerse cagiran satiri/parcayi YAZMAZ. */
function vectorLiteral(embeddings: Embeddings, text: string): string | null {
  const vector = embeddings.byText.get(text);
  return vector === undefined ? null : `[${vector.join(',')}]`;
}

// ===========================================================================
// Tenant verisi
// ===========================================================================

async function seedTenantData(client: Client, embeddings: Embeddings): Promise<void> {
  await client.query('BEGIN');
  try {
    // ⚠️ Tenant baglami: FORCE RLS tablolarina yazmanin ON KOSULU. Betik
    // bypass etmez, uygulamayla AYNI kapidan gecer.
    await client.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', TENANT_ID]);

    await wipe(client);

    await seedCrm(client, embeddings);
    await seedProjects(client, embeddings);
    await seedFinance(client, embeddings);
    await seedAppointments(client, embeddings);
    await seedInventory(client, embeddings);
    await seedInvoicing(client);
    await seedSuppliers(client, embeddings);
    await seedDocuments(client, embeddings);
    await seedFeedback(client, embeddings);
    await seedKnowledge(client, embeddings);
    await seedMarketing(client, embeddings);
    await seedHr(client);

    await client.query('COMMIT');
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    throw error;
  }
}

/**
 * Tenant'in TUM is verisini siler.
 *
 * ⚠️ SIRA KEYFI DEGIL — uc kisit onu belirliyor:
 *   1. `inventory.movements -> items` ve `finance.transactions -> categories`
 *      **RESTRICT**: cocuk once silinir.
 *   2. `invoicing.sales_documents.converted_from_id` KENDINE **RESTRICT**:
 *      once faturalar, sonra teklifler.
 *   3. ⚠️ `sales_document_lines`in `assert_document_editable` trigger'i
 *      `draft` olmayan bir belgenin satirlarina dokunmayi REDDEDER — ama
 *      trigger'in kendi yorumu `ON DELETE CASCADE` durumunu ONGORMUS
 *      ("ebeveyn yoksa izin ver"), yani EBEVEYNI silmek yeterlidir.
 *      Satirlari tek tek silmeye CALISILMAZ.
 *
 * ⚠️ `platform.audit_log` BILEREK silinmez: `audit_log_append_only` trigger'i
 * tablo sahibini de baglar (ADR-0043 §4) ve bir denetim izini bir tohumlama
 * betigi silememelidir. Bu tenant'ta zaten uretilmez.
 */
async function wipe(client: Client): Promise<void> {
  const statements = [
    'DELETE FROM inventory.movements WHERE tenant_id = $1',
    'DELETE FROM inventory.items WHERE tenant_id = $1',
    'DELETE FROM finance.transactions WHERE tenant_id = $1',
    'DELETE FROM finance.categories WHERE tenant_id = $1',
    'DELETE FROM finance.commentaries WHERE tenant_id = $1',
    "DELETE FROM invoicing.sales_documents WHERE tenant_id = $1 AND kind = 'invoice'",
    'DELETE FROM invoicing.sales_documents WHERE tenant_id = $1',
    'DELETE FROM invoicing.number_sequences WHERE tenant_id = $1',
    'DELETE FROM projects.tasks WHERE tenant_id = $1',
    'DELETE FROM projects.projects WHERE tenant_id = $1',
    'DELETE FROM crm.companies WHERE tenant_id = $1',
    'DELETE FROM appointments.appointments WHERE tenant_id = $1',
    'DELETE FROM suppliers.suppliers WHERE tenant_id = $1',
    'DELETE FROM documents.documents WHERE tenant_id = $1',
    'DELETE FROM feedback.responses WHERE tenant_id = $1',
    'DELETE FROM knowledge.notes WHERE tenant_id = $1',
    'DELETE FROM marketing.campaigns WHERE tenant_id = $1',
    'DELETE FROM hr.leave_requests WHERE tenant_id = $1',
    'DELETE FROM hr.compensation_records WHERE tenant_id = $1',
    'DELETE FROM hr.employees WHERE tenant_id = $1',
    'DELETE FROM platform.rate_limits WHERE tenant_id = $1',
  ];

  for (const statement of statements) {
    await client.query(statement, [TENANT_ID]);
  }
}

/**
 * CRM — ⚠️ `crm-pipeline`in UC BANDINI birden tetikler.
 *
 * `listOpenPipeline` kapali asamalari (`won`/`lost`) eler, limit 3'tur ve
 * once GECIKMIS takibi siralar. Asagidaki dort firsat sunu uretir:
 *   0.95 gecikmis takip · 0.90 asamada bayat (>= 21 gun) · 0.75 saglikli
 * ve `won` olan DISARIDA kalir — yani filtre de gozlenebilir olur.
 */
async function seedCrm(client: Client, embeddings: Embeddings): Promise<void> {
  const companies = [
    [id(2, 1), 'Kuzey Yapi A.S.', 'insaat'],
    [id(2, 2), 'Ege Tekstil Ltd.', 'tekstil'],
    [id(2, 3), 'Marmara Lojistik', 'lojistik'],
  ] as const;

  for (const [companyId, name, industry] of companies) {
    await client.query(
      `INSERT INTO crm.companies (id, tenant_id, name, industry, created_at, updated_at)
       VALUES ($1, $2, $3, $4, now(), now())`,
      [companyId, TENANT_ID, name, industry],
    );
  }

  const contacts = [
    [id(3, 1), id(2, 1), 'Selin Aydin', 'Satin Alma Muduru'],
    [id(3, 2), id(2, 2), 'Mert Kaya', 'Genel Mudur'],
    [id(3, 3), id(2, 3), 'Deniz Yilmaz', 'Operasyon Sorumlusu'],
  ] as const;

  for (const [contactId, companyId, fullName, title] of contacts) {
    await client.query(
      `INSERT INTO crm.contacts (id, tenant_id, company_id, full_name, title, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, now(), now())`,
      [contactId, TENANT_ID, companyId, fullName, title],
    );
  }

  const opportunities = [
    // Takip 9 gun GECIKMIS -> 0.95
    [
      id(4, 1),
      id(2, 1),
      'Cerceve sozlesme yenileme',
      'proposal_sent',
      '250000.00',
      day(-9),
      at(-12),
    ],
    // 40 gundur ayni asamada (esik 21) -> 0.90
    [id(4, 2), id(2, 2), 'Tedarikci degisimi', 'in_discussion', '120000.00', null, at(-40)],
    // Taze -> 0.75
    [id(4, 3), id(2, 3), 'Ikinci faz genislemesi', 'potential', '45000.00', day(5), at(-3)],
    // KAPALI — havuza girmemeli
    [id(4, 4), id(2, 1), 'Pilot proje', 'won', '30000.00', null, at(-60)],
  ] as const;

  for (const [oppId, companyId, title, stage, value, followUp, stageChangedAt] of opportunities) {
    await client.query(
      `INSERT INTO crm.opportunities
         (id, tenant_id, company_id, title, stage, estimated_value, currency,
          next_follow_up_on, stage_changed_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'TRY', $7, $8, now(), now())`,
      [oppId, TENANT_ID, companyId, title, stage, value, followUp, stageChangedAt],
    );
  }

  for (const [index, body] of CRM_INTERACTION_BODIES.entries()) {
    const interactionId = id(5, index + 1);
    const companyId = id(2, (index % 3) + 1);
    await client.query(
      `INSERT INTO crm.interactions
         (id, tenant_id, company_id, author_user_id, occurred_on, body, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())`,
      [interactionId, TENANT_ID, companyId, OWNER_USER_ID, day(-(index + 2)), body],
    );

    const vector = vectorLiteral(embeddings, body);
    if (vector !== null) {
      await client.query(
        `INSERT INTO crm.interaction_chunks
           (id, tenant_id, interaction_id, chunk_index, content, embedding, created_at)
         VALUES ($1, $2, $3, 0, $4, $5::vector, now())`,
        [id(6, index + 1), TENANT_ID, interactionId, body, vector],
      );
    }
  }
}

/**
 * Projeler — ⚠️ `project-status`in IKI kaynagini birden besler:
 * riskli acik projeler (limit 3) VE en cok gecikmis gorevler (limit 2).
 */
async function seedProjects(client: Client, embeddings: Embeddings): Promise<void> {
  const projects = [
    [id(7, 1), 'Kurumsal site yenileme', 'in_progress', id(2, 1), at(-35)],
    [id(7, 2), 'ERP entegrasyonu', 'in_progress', id(2, 2), at(-20)],
    [id(7, 3), 'Depo otomasyonu', 'planning', null, at(-5)],
    [id(7, 4), 'Logo calismasi', 'completed', null, at(-70)],
  ] as const;

  for (const [projectId, name, status, companyId, statusChangedAt] of projects) {
    await client.query(
      `INSERT INTO projects.projects
         (id, tenant_id, name, status, company_id, started_on, due_on, status_changed_at,
          created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), now())`,
      [projectId, TENANT_ID, name, status, companyId, day(-45), day(10), statusChangedAt],
    );
  }

  const tasks = [
    // GECIKMIS gorevler — en eskisi once siralanir
    [id(8, 1), id(7, 1), 'Icerik gocu tamamlanacak', 'in_progress', day(-12)],
    [id(8, 2), id(7, 1), 'SEO yonlendirmeleri', 'todo', day(-6)],
    [id(8, 3), id(7, 2), 'Test ortami kurulumu', 'todo', day(-2)],
    // Gecikmemis
    [id(8, 4), id(7, 3), 'Ihtiyac analizi', 'todo', day(8)],
    [id(8, 5), id(7, 2), 'Egitim materyali', 'done', day(-1)],
    // ⚠️ PROJESIZ gorev (ADR-0033 §2) — `project_id` NULL
    [id(8, 6), null, 'Ofis internet sozlesmesi yenilenecek', 'todo', day(-4)],
  ] as const;

  for (const [taskId, projectId, title, status, dueOn] of tasks) {
    await client.query(
      `INSERT INTO projects.tasks
         (id, tenant_id, project_id, title, status, due_on, assignee_user_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())`,
      [taskId, TENANT_ID, projectId, title, status, dueOn, OWNER_USER_ID],
    );
  }

  for (const [index, body] of PROJECT_NOTE_BODIES.entries()) {
    const noteId = id(9, index + 1);
    await client.query(
      `INSERT INTO projects.progress_notes
         (id, tenant_id, project_id, author_user_id, body, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [noteId, TENANT_ID, id(7, (index % 3) + 1), OWNER_USER_ID, body, at(-(index + 1))],
    );

    const vector = vectorLiteral(embeddings, body);
    if (vector !== null) {
      await client.query(
        `INSERT INTO projects.progress_note_chunks
           (id, tenant_id, progress_note_id, chunk_index, content, embedding, created_at)
         VALUES ($1, $2, $3, 0, $4, $5::vector, now())`,
        [id(10, index + 1), TENANT_ID, noteId, body, vector],
      );
    }
  }
}

/**
 * Finans — ⚠️ `finance-cashflow`u ALARM bandina (0.95) sokar.
 *
 * Katkici iki 30 gunluk pencereyi karsilastirir. Burada BILINCLI olarak:
 *   * son 30 gun: gider > gelir  -> **NEGATIF NAKIT AKISI** (0.95)
 *   * onceki 30 gun: gelir > gider -> karsilastirma "DUSUS" satirini da uretir
 * Ikinci bir para birimi (EUR) ikinci bir fragman verir — ADR-0034'un
 * "para birimleri toplanmaz" kurali gozlenebilir olur.
 */
async function seedFinance(client: Client, embeddings: Embeddings): Promise<void> {
  const categories = [
    [id(11, 1), 'Hizmet geliri', 'income'],
    [id(11, 2), 'Kira', 'expense'],
    [id(11, 3), 'Yazilim lisanslari', 'expense'],
    [id(11, 4), 'Personel', 'expense'],
  ] as const;

  for (const [categoryId, name, direction] of categories) {
    await client.query(
      `INSERT INTO finance.categories
         (id, tenant_id, name, direction, is_archived, created_at, updated_at)
       VALUES ($1, $2, $3, $4, false, now(), now())`,
      [categoryId, TENANT_ID, name, direction],
    );
  }

  const transactions = [
    // --- son 30 gun: NET NEGATIF (gelir 120.000 / gider 187.500) ---
    [id(12, 1), 'income', '120000.00', 'TRY', day(-8), id(11, 1), 'Bakim sozlesmesi tahsilati'],
    [id(12, 2), 'expense', '95000.00', 'TRY', day(-6), id(11, 4), 'Maas odemeleri'],
    [id(12, 3), 'expense', '62500.00', 'TRY', day(-14), id(11, 2), 'Ofis kirasi'],
    [id(12, 4), 'expense', '30000.00', 'TRY', day(-3), id(11, 3), 'Yillik lisans yenileme'],
    // --- onceki 30 gun: NET POZITIF (gelir 210.000 / gider 90.000) ---
    [id(12, 5), 'income', '210000.00', 'TRY', day(-40), id(11, 1), 'Proje teslim odemesi'],
    [id(12, 6), 'expense', '90000.00', 'TRY', day(-45), id(11, 4), 'Maas odemeleri'],
    // --- ikinci para birimi ---
    [id(12, 7), 'income', '4500.00', 'EUR', day(-11), id(11, 1), 'Yurt disi danismanlik'],
    [id(12, 8), 'expense', '6200.00', 'EUR', day(-5), id(11, 3), 'Bulut altyapi'],
  ] as const;

  for (const [
    txId,
    direction,
    amount,
    currency,
    occurredOn,
    categoryId,
    description,
  ] of transactions) {
    await client.query(
      `INSERT INTO finance.transactions
         (id, tenant_id, direction, amount, currency, occurred_on, description, category_id,
          created_by_user_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), now())`,
      [
        txId,
        TENANT_ID,
        direction,
        amount,
        currency,
        occurredOn,
        description,
        categoryId,
        OWNER_USER_ID,
      ],
    );
  }

  for (const [index, body] of FINANCE_COMMENTARY_BODIES.entries()) {
    const commentaryId = id(13, index + 1);
    await client.query(
      `INSERT INTO finance.commentaries
         (id, tenant_id, author_user_id, occurred_on, body, created_at)
       VALUES ($1, $2, $3, $4, $5, now())`,
      [commentaryId, TENANT_ID, OWNER_USER_ID, day(-(index + 2)), body],
    );

    const vector = vectorLiteral(embeddings, body);
    if (vector !== null) {
      await client.query(
        `INSERT INTO finance.commentary_chunks
           (id, tenant_id, commentary_id, chunk_index, content, embedding, created_at)
         VALUES ($1, $2, $3, 0, $4, $5::vector, now())`,
        [id(14, index + 1), TENANT_ID, commentaryId, body, vector],
      );
    }
  }
}

/**
 * Randevu — ⚠️ `appointment-schedule`i ALARM bandina (0.95) sokar.
 *
 * `MIN_SAMPLE` 5'tir ve varsayilan uyari orani 0,2'dir. Asagidaki 12 gecmis
 * randevunun 4'u `no_show` (%33 > %20) -> yuksek gelmedi orani.
 * Ayrica onumuzdeki 2 gun icinde 3 randevu -> yaklasan fragmanlari.
 */
async function seedAppointments(client: Client, embeddings: Embeddings): Promise<void> {
  const past = [
    ...Array.from({ length: 8 }, (_, index) => ({ offset: -(index + 3), status: 'completed' })),
    ...Array.from({ length: 4 }, (_, index) => ({ offset: -(index + 12), status: 'no_show' })),
  ];

  let counter = 0;
  for (const entry of past) {
    counter += 1;
    const note = APPOINTMENT_NOTES[counter - 1] ?? null;
    const vector = note === null ? null : vectorLiteral(embeddings, note);

    await client.query(
      `INSERT INTO appointments.appointments
         (id, tenant_id, crm_contact_id, service_note, embedding, scheduled_at, duration_minutes,
          status, created_by_user_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5::vector, $6, 45, $7, $8, now(), now())`,
      [
        id(15, counter),
        TENANT_ID,
        id(3, (counter % 3) + 1),
        note,
        vector,
        at(entry.offset, 9 + (counter % 6)),
        entry.status,
        OWNER_USER_ID,
      ],
    );
  }

  // Yaklasan (0-2 gun) — `findUpcoming` penceresi
  for (let index = 0; index < 3; index += 1) {
    counter += 1;
    await client.query(
      `INSERT INTO appointments.appointments
         (id, tenant_id, crm_contact_id, service_note, scheduled_at, duration_minutes,
          status, created_by_user_id, created_at, updated_at)
       VALUES ($1, $2, $3, NULL, $4, 30, 'scheduled', $5, now(), now())`,
      [
        id(15, counter),
        TENANT_ID,
        id(3, (index % 3) + 1),
        new Date(NOW.getTime() + (index + 1) * 8 * 60 * 60 * 1000),
        OWNER_USER_ID,
      ],
    );
  }
}

/**
 * Stok — ⚠️ `inventory-stock`u ALARM bandina (0.95) sokar.
 *
 * Katkici `activeItems === 0` ise HIC konusmaz. Alti kalem acilir; ucunun
 * mevcut miktari `min_quantity`nin ALTINA dusurulur (miktar hareketlerden
 * TURETILIR — ADR-0039 §1, yani kolon yazmak yetmez, hareket yazilir).
 */
async function seedInventory(client: Client, embeddings: Embeddings): Promise<void> {
  const items = [
    [id(16, 1), 'M8 civata', 'ADET', '500', 120, 800],
    [id(16, 2), 'Paslanmaz sac 2mm', 'KG', '300', 90, 500],
    [id(16, 3), 'Ambalaj kutusu L', 'ADET', '1000', 250, 1400],
    [id(16, 4), 'Endustriyel yapistirici', 'LT', '40', 60, 20],
    [id(16, 5), 'Etiket rulosu', 'ADET', '200', 400, 60],
    [id(16, 6), 'Koruyucu eldiven', 'CIFT', '150', 300, 40],
  ] as const;

  for (const [index, [itemId, name, unit, minQuantity, inQty, outQty]] of items.entries()) {
    const note = INVENTORY_NOTES[index] ?? null;
    const vector = note === null ? null : vectorLiteral(embeddings, note);

    await client.query(
      `INSERT INTO inventory.items
         (id, tenant_id, name, sku, unit, min_quantity, note, embedding, created_by_user_id,
          created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector, $9, now(), now())`,
      [
        itemId,
        TENANT_ID,
        name,
        `SKU-${String(index + 1).padStart(4, '0')}`,
        unit,
        minQuantity,
        note,
        vector,
        OWNER_USER_ID,
      ],
    );

    // Giris ve cikis AYRI hareketlerdir; mevcut miktar farktan turetilir.
    await client.query(
      `INSERT INTO inventory.movements
         (id, tenant_id, item_id, direction, quantity, is_correction, occurred_at, note,
          created_by_user_id, created_at)
       VALUES ($1, $2, $3, 'in', $4, false, $5, 'Acilis girisi', $6, now())`,
      [id(17, index * 2 + 1), TENANT_ID, itemId, String(inQty), at(-25), OWNER_USER_ID],
    );
    await client.query(
      `INSERT INTO inventory.movements
         (id, tenant_id, item_id, direction, quantity, is_correction, occurred_at, note,
          created_by_user_id, created_at)
       VALUES ($1, $2, $3, 'out', $4, false, $5, 'Uretime cikis', $6, now())`,
      [id(17, index * 2 + 2), TENANT_ID, itemId, String(outQty), at(-4), OWNER_USER_ID],
    );
  }
}

/**
 * Teklif/Fatura — ⚠️ `invoicing-pipeline`i ALARM bandina (0.95) sokar.
 *
 * ⚠️ SIRA TRIGGER TARAFINDAN DAYATILIR: `sales_document_lines` uzerindeki
 * `assert_document_editable`, ebeveyn `draft` DEGILSE satir INSERT'ini
 * reddeder (ADR-0041 §2, uc katmanin ucuncusu). Bu yuzden her belge once
 * `draft` acilir, satirlari yazilir, SONRA durumu guncellenir.
 *
 * ⚠️ Bu bir "gecici cozum" degil, aracin domain kuralina UYMASIDIR: kural
 * atlanabilseydi zaten kural olmazdi.
 */
async function seedInvoicing(client: Client): Promise<void> {
  const documents = [
    // Kabul edilmis ama faturalanmamis -> "masadaki para", 0.95
    [
      id(18, 1),
      'quote',
      'accepted',
      'Kuzey Yapi A.S.',
      id(2, 1),
      day(-18),
      day(12),
      'TEK-2026-0001',
    ],
    [
      id(18, 2),
      'quote',
      'accepted',
      'Ege Tekstil Ltd.',
      id(2, 2),
      day(-9),
      day(21),
      'TEK-2026-0002',
    ],
    // Gonderilmis ama gecerliligi GECMIS -> 0.95
    [id(18, 3), 'quote', 'sent', 'Marmara Lojistik', id(2, 3), day(-40), day(-6), 'TEK-2026-0003'],
    // Gonderilmis, 20 gundur sessiz (esik 14) -> bayat
    [id(18, 4), 'quote', 'sent', 'Kuzey Yapi A.S.', id(2, 1), day(-20), day(30), 'TEK-2026-0004'],
    // Acik taslak -> `openCounts`
    [id(18, 5), 'quote', 'draft', 'Ege Tekstil Ltd.', id(2, 2), day(-2), day(28), null],
  ] as const;

  let lineIndex = 0;
  for (const [
    docId,
    kind,
    status,
    customerName,
    companyId,
    issuedOn,
    validUntil,
    number,
  ] of documents) {
    lineIndex += 1;
    await client.query(
      `INSERT INTO invoicing.sales_documents
         (id, tenant_id, kind, number, status, company_id, customer_name, issued_on, valid_until,
          currency, created_by_user_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7, $8, 'TRY', $9, now(), now())`,
      [
        docId,
        TENANT_ID,
        kind,
        number,
        companyId,
        customerName,
        issuedOn,
        validUntil,
        OWNER_USER_ID,
      ],
    );

    await client.query(
      `INSERT INTO invoicing.sales_document_lines
         (id, tenant_id, document_id, position, description, quantity, unit, unit_price, tax_rate,
          created_at)
       VALUES ($1, $2, $3, 1, $4, $5, 'ADET', $6, 20.00, now())`,
      [id(28, lineIndex), TENANT_ID, docId, 'Danismanlik hizmeti', '10.000', '4500.00'],
    );

    if (status !== 'draft') {
      await client.query(
        // ⚠️ Acik cast'ler: ayni parametre hem dogrudan hem `CASE` icinde
        // kullaniliyor ve PostgreSQL tipi ikisinden ayri ayri cikarmaya
        // calisip "inconsistent types deduced" ile reddediyor.
        `UPDATE invoicing.sales_documents
            SET status = $2::text,
                sent_at = $3::timestamptz,
                sent_by_user_id = $4::uuid,
                decided_at = CASE WHEN $2::text = 'accepted' THEN $3::timestamptz ELSE NULL END,
                decided_by_user_id = CASE WHEN $2::text = 'accepted' THEN $4::uuid ELSE NULL END,
                updated_at = now()
          WHERE id = $1`,
        [docId, status, at(-22), OWNER_USER_ID],
      );
    }
  }

  for (const kind of ['quote', 'invoice'] as const) {
    await client.query(
      `INSERT INTO invoicing.number_sequences (tenant_id, kind, next_value, updated_at)
       VALUES ($1, $2, 5, now())`,
      [TENANT_ID, kind],
    );
  }
}

/** Tedarikci — TEK katkici (anlamsal): ekleme-yalniz gorusme gunlugu. */
async function seedSuppliers(client: Client, embeddings: Embeddings): Promise<void> {
  const suppliers = [
    [id(19, 1), 'Anadolu Metal', 'hammadde', '30 gun vadeli'],
    [id(19, 2), 'Ege Ambalaj', 'ambalaj', 'pesin'],
    [id(19, 3), 'Trakya Kimya', 'kimyasal', '45 gun vadeli'],
  ] as const;

  for (const [supplierId, name, category, paymentTerms] of suppliers) {
    await client.query(
      `INSERT INTO suppliers.suppliers
         (id, tenant_id, name, category, payment_terms, created_by_user_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now(), now())`,
      [supplierId, TENANT_ID, name, category, paymentTerms, OWNER_USER_ID],
    );
  }

  for (const [index, body] of SUPPLIER_INTERACTION_BODIES.entries()) {
    const vector = vectorLiteral(embeddings, body);
    await client.query(
      `INSERT INTO suppliers.interactions
         (id, tenant_id, supplier_id, author_user_id, occurred_on, body, embedding, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7::vector, now())`,
      [
        id(20, index + 1),
        TENANT_ID,
        id(19, index + 1),
        OWNER_USER_ID,
        day(-(index + 3)),
        body,
        vector,
      ],
    );
  }
}

/**
 * Belge — ⚠️ NESNE DEPOSUNA DOSYA YAZILMAZ.
 *
 * `documents.contributor` yalnizca `document_chunks`i okur; indirme yolu
 * denetim tenant'inda 404 verir ve bu KABUL EDILMIS bir sinirdir (§ ADR-0048
 * bilinen sinirlar). Bir R2/MinIO nesnesi uretmek, tohumlamayi ikinci bir
 * dis sisteme bagimli kilardi.
 */
async function seedDocuments(client: Client, embeddings: Embeddings): Promise<void> {
  for (const [index, entry] of DOCUMENT_ENTRIES.entries()) {
    const documentId = id(21, index + 1);
    await client.query(
      `INSERT INTO documents.documents
         (id, tenant_id, original_filename, storage_key, mime_type, size_bytes, label,
          crm_contact_id, created_by_user_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'application/pdf', 182400, $5, $6, $7, now(), now())`,
      [
        documentId,
        TENANT_ID,
        entry.filename,
        `tenants/${TENANT_ID}/documents/${documentId}`,
        entry.label,
        id(3, index + 1),
        OWNER_USER_ID,
      ],
    );

    const vector = vectorLiteral(embeddings, entry.chunk);
    if (vector !== null) {
      await client.query(
        `INSERT INTO documents.document_chunks
           (id, tenant_id, document_id, chunk_index, content, embedding, created_at)
         VALUES ($1, $2, $3, 0, $4, $5::vector, now())`,
        [id(22, index + 1), TENANT_ID, documentId, entry.chunk, vector],
      );
    }
  }
}

/**
 * Geri bildirim — ⚠️ YORUMSUZ kayitlar da BILEREK var.
 *
 * ADR-0045 §3.5'in bedeli ("yorumsuz puanin `/ask`te hicbir sesi yoktur")
 * ancak yorumsuz kayit VARKEN gozlenebilir. Askidaki `feedback-satisfaction`
 * karari tam olarak bu kumeyi tartisiyor.
 */
async function seedFeedback(client: Client, embeddings: Embeddings): Promise<void> {
  for (const [index, entry] of FEEDBACK_ENTRIES.entries()) {
    const vector =
      entry.comment === null ? null : vectorLiteral(embeddings, feedbackVectorText(entry));

    await client.query(
      `INSERT INTO feedback.responses
         (id, tenant_id, rating, comment, channel, crm_contact_id, received_at, embedding,
          created_by_user_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector, $9, now())`,
      [
        id(23, index + 1),
        TENANT_ID,
        entry.rating,
        entry.comment,
        entry.channel,
        index % 2 === 0 ? id(3, (index % 3) + 1) : null,
        at(-(index + 1)),
        vector,
        OWNER_USER_ID,
      ],
    );
  }
}

/** Knowledge — Faz 4'un modulu; havuzun EN ESKI anlamsal kaynagi. */
async function seedKnowledge(client: Client, embeddings: Embeddings): Promise<void> {
  for (const [index, note] of KNOWLEDGE_NOTES.entries()) {
    const noteId = id(24, index + 1);
    await client.query(
      `INSERT INTO knowledge.notes (id, tenant_id, author_user_id, title, body, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())`,
      [noteId, TENANT_ID, OWNER_USER_ID, note.title, note.body, at(-(index + 2))],
    );

    const text = `${note.title}\n\n${note.body}`;
    const vector = vectorLiteral(embeddings, text);
    if (vector !== null) {
      await client.query(
        `INSERT INTO knowledge.note_chunks
           (id, tenant_id, note_id, chunk_index, content, embedding, created_at)
         VALUES ($1, $2, $3, 0, $4, $5::vector, now())`,
        [id(25, index + 1), TENANT_ID, noteId, text, vector],
      );
    }
  }
}

/**
 * Kampanya — ⚠️ IKI KATKICIYI birden besler ve ORTUSME KUMELERI BOSTUR.
 *
 * `campaign-notes` (anlamsal) yalnizca SONUC NOTU OLAN kayitlari gorur;
 * `campaign-gap` (yapisal) yalnizca sonuc notu OLMAYANLARI. Asagidaki kume
 * bilerek ikisini de doldurur:
 *
 *   * iki kampanya sonuc notlu   -> anlamsal ses
 *   * uc kampanya sonucu YAZILMAMIS -> ⚠️ ALARM bandi (0.95, esik 3)
 *     ve bunlardan biri `active` ama takvimde BITMIS (kapatilmami s)
 *   * bir kampanya taslak, biri yayinda -> `openCount` gercekci
 */
async function seedMarketing(client: Client, embeddings: Embeddings): Promise<void> {
  const campaigns = [
    // --- sonuc notlu: anlamsal katkici bunlari gorur ---
    [id(28, 1), 'Sonbahar indirimi', 'Instagram', day(-45), day(-20), 'done', 0, id(2, 1)],
    [id(28, 2), 'Eylul e-posta bulteni', 'e-posta', day(-38), day(-25), 'done', 1, null],
    // --- SONUCU YAZILMAMIS: yapisal katkici bunlari gorur (ALARM, >= 3) ---
    [id(28, 3), 'Yaz sonu kampanyasi', 'Google Ads', day(-60), day(-30), 'done', null, null],
    [id(28, 4), 'Bayi tanitim etkinligi', 'etkinlik', day(-50), day(-15), 'done', null, id(2, 2)],
    // ⚠️ Takvimde bitmis ama HALA `active` — kapatilmami s
    [id(28, 5), 'Agustos sosyal medya', 'Instagram', day(-40), day(-5), 'active', null, null],
    // --- suren / taslak: `openCount` icin ---
    [id(28, 6), 'Sonbahar lansmani', 'Instagram', day(-3), null, 'active', null, null],
    [id(28, 7), 'Kis kampanyasi hazirlik', null, day(20), day(60), 'draft', null, null],
  ] as const;

  for (const [
    campaignId,
    name,
    channel,
    startsOn,
    endsOn,
    status,
    noteIndex,
    companyId,
  ] of campaigns) {
    const resultNote = noteIndex === null ? null : (CAMPAIGN_RESULT_NOTES[noteIndex] ?? null);
    const vector = resultNote === null ? null : vectorLiteral(embeddings, resultNote);

    await client.query(
      `INSERT INTO marketing.campaigns
         (id, tenant_id, name, channel, starts_on, ends_on, status, result_note,
          crm_company_id, embedding, created_by_user_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::vector, $11, now(), now())`,
      [
        campaignId,
        TENANT_ID,
        name,
        channel,
        startsOn,
        endsOn,
        status,
        resultNote,
        companyId,
        vector,
        OWNER_USER_ID,
      ],
    );
  }
}

/**
 * IK — ⚠️ SIFIR katkici (ADR-0043 §5.3), yani `/ask` dagilimini ETKILEMEZ.
 *
 * Yine de tohumlanir: denetim tenant'i "on bir modulde veri olan" bir tenant
 * olarak tarif edildi ve IK ekranlarinin da gercekci bir tenant'ta calisir
 * gorunmesi gerekir. ⚠️ Ucret kaydi BILEREK yazilmaz — maasi bir tohumlama
 * betigine koymak, ADR-0043'un uc katmanli izolasyonunu zayiflatan gereksiz
 * bir yuzey olurdu.
 */
async function seedHr(client: Client): Promise<void> {
  const employees = [
    [id(26, 1), 'Elif Demir', 'Yazilim Muhendisi', 'Teknoloji'],
    [id(26, 2), 'Burak Sahin', 'Satis Uzmani', 'Satis'],
    [id(26, 3), 'Ayse Koc', 'Muhasebe Sorumlusu', 'Finans'],
  ] as const;

  for (const [employeeId, fullName, jobTitle, department] of employees) {
    await client.query(
      `INSERT INTO hr.employees
         (id, tenant_id, full_name, job_title, department, employment_status, employment_type,
          work_mode, annual_leave_days, started_on, created_by_user_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'active', 'full_time', 'hybrid', 20, $6, $7, now(), now())`,
      [employeeId, TENANT_ID, fullName, jobTitle, department, day(-400), OWNER_USER_ID],
    );
  }

  await client.query(
    `INSERT INTO hr.leave_requests
       (id, tenant_id, employee_id, type, starts_on, ends_on, status, requested_by_user_id,
        requested_at)
     VALUES ($1, $2, $3, 'annual', $4, $5, 'pending', $6, now())`,
    [id(27, 1), TENANT_ID, id(26, 1), day(6), day(10), OWNER_USER_ID],
  );
}

// ===========================================================================
// Rapor
// ===========================================================================

async function report(client: Client, options: Options): Promise<void> {
  await client.query('SELECT set_config($1, $2, false)', ['app.current_tenant_id', TENANT_ID]);

  const counts = await client.query<{ label: string; total: string }>(
    `SELECT 'crm.opportunities (acik)' AS label, count(*)::text AS total
       FROM crm.opportunities WHERE stage NOT IN ('won','lost')
     UNION ALL SELECT 'projects.tasks (gecikmis)', count(*)::text
       FROM projects.tasks WHERE status <> 'done' AND due_on < CURRENT_DATE
     UNION ALL SELECT 'finance.transactions', count(*)::text FROM finance.transactions
     UNION ALL SELECT 'appointments (no_show)', count(*)::text
       FROM appointments.appointments WHERE status = 'no_show'
     UNION ALL SELECT 'inventory.items', count(*)::text FROM inventory.items
     UNION ALL SELECT 'invoicing.sales_documents', count(*)::text FROM invoicing.sales_documents
     UNION ALL SELECT 'suppliers.interactions', count(*)::text FROM suppliers.interactions
     UNION ALL SELECT 'documents.document_chunks', count(*)::text FROM documents.document_chunks
     UNION ALL SELECT 'feedback.responses', count(*)::text FROM feedback.responses
     UNION ALL SELECT 'knowledge.note_chunks', count(*)::text FROM knowledge.note_chunks
     UNION ALL SELECT 'hr.employees', count(*)::text FROM hr.employees
     UNION ALL SELECT 'marketing (sonucu yazilmamis)', count(*)::text
       FROM marketing.campaigns WHERE result_note IS NULL
         AND (status = 'done' OR (status = 'active' AND ends_on < CURRENT_DATE))`,
  );

  console.log(`\n[seed] Denetim tenant'i hazir — ${TENANT_ID}`);
  console.log(`[seed] slug: ${TENANT_SLUG}`);
  console.log(`[seed] owner : ${OWNER_EMAIL} / ${SEED_PASSWORD}`);
  console.log(
    `[seed] member: ${MEMBER_EMAIL} / ${SEED_PASSWORD}  (cashflow:read YOK -> forbidden)`,
  );
  console.log('[seed] ---');
  for (const row of counts.rows) {
    console.log(`[seed]   ${row.label.padEnd(28)} ${row.total}`);
  }
  console.log('[seed] ---');
  console.log(
    options.withEmbeddings
      ? '[seed] embedding URETILDI — anlamsal kaynaklar da satir dondurmeli.'
      : '[seed] embedding YOK — anlamsal kaynaklar `empty` donecek ' +
          '(--with-embeddings ile doldurulur).',
  );
}

// ===========================================================================
// Ortak yardimcilar (db-preflight.mts ile ayni desen)
// ===========================================================================

function loadEnv(): void {
  if (existsSync('.env')) {
    process.loadEnvFile('.env');
  }
}

function migrationUrl(): string {
  const url = process.env.DATABASE_MIGRATION_URL;
  if (url === undefined || url.trim() === '') {
    fail(
      'DATABASE_MIGRATION_URL tanimli degil. businessos_owner rolunun baglanti dizesi gereklidir.',
    );
  }
  return url;
}

function fail(message: string): never {
  console.error(`[seed] ${message}`);
  process.exit(1);
}

/**
 * Hatayi TEHSIS EDILEBILIR bir dizeye cevirir.
 *
 * ⚠️ `error.message` TEK BASINA YETMEZ ve bu, betigi kosarken YASANDI:
 * Docker durdugunda `pg` bir `AggregateError` firlatir ve o hatanin `message`i
 * BOS DIZEDIR. Ciktı `[seed] beklenmeyen hata:` olarak dusuyordu — yani hicbir
 * sey soylemeyen bir hata satiri. `db-preflight.mts`in var olma sebebi tam
 * olarak bu sinif bir belirsizlikti; ayni tuzaga burada dusulmemeli.
 *
 * Bos `message` durumunda hatanin ADI ve varsa ALT HATALARI yazilir.
 */
function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }

  if (error.message !== '') {
    return error.message;
  }

  const causes =
    'errors' in error && Array.isArray(error.errors)
      ? error.errors
          .map((inner: unknown) => (inner instanceof Error ? inner.message : String(inner)))
          .filter((message) => message !== '')
      : [];

  return causes.length === 0 ? error.name : `${error.name}: ${causes.join(' | ')}`;
}

main().catch((error: unknown) => {
  console.error(`[seed] beklenmeyen hata: ${errorMessage(error)}`);
  process.exitCode = 1;
});
