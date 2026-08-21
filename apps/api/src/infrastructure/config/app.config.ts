import type { ZodError } from 'zod';

import { envSchema, type Env } from './env.schema';

/**
 * Uygulamanin dogrulanmis yapilandirmasi.
 *
 * Kod hicbir yerde process.env okumaz; bu nesneyi enjekte eder. Boylece
 * yapilandirma test edilebilir hale gelir ve "bu degisken nereden geliyor"
 * sorusunun tek bir cevabi olur (ESLint no-restricted-properties ile zorlanir).
 */
export interface AppConfig {
  readonly env: Env['NODE_ENV'];
  readonly isProduction: boolean;
  readonly port: number;
  readonly version: string;

  readonly database: {
    readonly url: string;
    readonly poolMax: number;
    readonly connectionTimeoutMs: number;
  };

  readonly logging: {
    readonly level: Env['LOG_LEVEL'];
    readonly pretty: boolean;
  };

  readonly http: {
    readonly corsOrigins: readonly string[];
  };

  readonly swagger: {
    readonly enabled: boolean;
  };

  /**
   * Identity sirlari (ADR-0019, ADR-0020).
   *
   * Anahtarlar base64(PEM) olarak tasinir ve KULLANILDIGI yerde (IdentityModule
   * factory'si) `jose` ile CryptoKey'e cevrilir — config saf veri kalir.
   */
  readonly auth: {
    readonly jwt: {
      readonly issuer: string;
      readonly audience: string;
      readonly signingKid: string;
      readonly privateKeyBase64: string;
      readonly publicKeyBase64: string;
    };
    readonly verificationCodePepper: string;
  };

  /** Identity outbox tuketicisinin zamanlamasi (ADR-0006). */
  readonly outboxRelay: {
    readonly enabled: boolean;
    readonly intervalMs: number;
    readonly batchSize: number;
  };

  /** E-posta saglayicisi secimi ve kimlik bilgileri (ARCHITECTURE 9.3). */
  readonly email: {
    readonly provider: 'console' | 'resend';
    /** Yalnizca `provider === 'resend'` iken dolu (env semasi zorlar). */
    readonly resendApiKey: string;
    readonly from: string;
  };

  /** Embedding saglayicisi secimi ve kimlik bilgileri (ADR-0029 §3). */
  readonly embedding: {
    readonly provider: 'fake' | 'openai';
    /** Yalnizca `provider === 'openai'` iken dolu (env semasi zorlar). */
    readonly openAiApiKey: string;
    readonly model: string;
  };

  /** Sohbet/completion saglayicisi (ADR-0029 §3). Embedding'den AYRI. */
  readonly llm: {
    readonly provider: 'fake' | 'deepseek';
    /** Yalnizca `provider === 'deepseek'` iken dolu (env semasi zorlar). */
    readonly deepSeekApiKey: string;
    readonly model: string;
  };

  /** Knowledge retrieval ayarlari (ADR-0029 §4, ADR-0030 §1.2). */
  readonly knowledge: {
    readonly retrievalLimit: number;
    readonly historyMessages: number;
    /** Saatlik istek paylari (ADR-0029 §5) — eylem basina AYRI kova. */
    readonly askRateLimit: number;
    readonly notesRateLimit: number;
    /** Not listesindeki onizleme uzunlugu. */
    readonly notePreviewLength: number;
    /** Tek onarim cagrisinda islenecek en fazla not. */
    readonly reindexBatchSize: number;
  };

  /** CRM ayarlari (ADR-0031 Slice 6). */
  readonly crm: {
    readonly interactionsRateLimit: number;
    readonly reindexBatchSize: number;
    readonly summaryRateLimit: number;
    readonly summaryContextInteractions: number;
    readonly summaryCharsPerInteraction: number;
    /** Yapisal katkicinin "durgun asama" esigi (ADR-0033 Slice 6). */
    readonly staleStageDays: number;
  };

  /** Projeler modulu (ADR-0033 §9). */
  readonly projects: {
    readonly notesRateLimit: number;
    readonly reindexBatchSize: number;
    readonly staleDays: number;
  };

  /** Finans modulu (ADR-0034 §9). */
  readonly finance: {
    readonly commentariesRateLimit: number;
    readonly reindexBatchSize: number;
  };

  /** Randevu (ADR-0035 §9). */
  readonly appointments: {
    /** ⚠️ Randevu degil, EMBEDDING sayar (notsuz randevu paydan dusmez). */
    readonly embeddingRateLimit: number;
    readonly reindexBatchSize: number;
    /** ⚠️ AI siralamasini etkiler; web karsiligi geldiginde senkron kalmali. */
    readonly noShowAlertRate: number;
  };

  /**
   * Stok / Envanter (ADR-0039 §5, §6.1).
   *
   * ⚠️ MIKTARLA ILGILI HICBIR AYAR YOKTUR ve bu bilincli: miktar TURETILIR
   * (ADR-0039 §2), yani ayarlanacak bir esik, bir yuvarlama ya da bir onbellek
   * suresi yok. Bir gun bir onbellek eklenirse ILK ayar burada belirir.
   */
  readonly inventory: {
    /** ⚠️ Kalem de hareket de degil, EMBEDDING sayar (hareket paydan dusmez). */
    readonly embeddingRateLimit: number;
    readonly reindexBatchSize: number;
    /** ⚠️ AI siralamasini etkiler; web karsiligi geldiginde senkron kalmali. */
    readonly nearThresholdRatio: number;
  };

  /**
   * Tedarikci Yonetimi (ADR-0040 §6).
   *
   * ⚠️ `nearThresholdRatio` benzeri bir esik alani YOKTUR ve bu bir eksik
   * degil, §3'un dogrudan sonucudur: bu modulun YAPISAL KATKICISI YOK, yani
   * ayarlanacak bir risk merdiveni de yok.
   */
  readonly suppliers: {
    /** ⚠️ Tedarikci de kisi de degil, EMBEDDING sayar (ikisi de paydan dusmez). */
    readonly embeddingRateLimit: number;
    /** ⚠️ Onarimin IKI isi var: eksik vektor + BAYAT baslik (§6). */
    readonly reindexBatchSize: number;
  };

  /**
   * Nesne deposu (ADR-0009 · ADR-0037 §5).
   *
   * ⚠️ SAGLAYICI ADI YOK. Production R2, lokal MinIO — ikisi de `s3`tir ve
   * ayrimi `endpoint` + `forcePathStyle` tasir. Saglayici adini buraya yazmak,
   * ADR-0009'un onlemek icin var oldugu seydi.
   */
  readonly storage: {
    readonly provider: 's3' | 'memory';
    readonly endpoint: string;
    readonly region: string;
    readonly bucket: string;
    readonly accessKeyId: string;
    readonly secretAccessKey: string;
    readonly forcePathStyle: boolean;
  };

  /** Belge / Sozlesme (ADR-0037 §6, §10). */
  readonly documents: {
    /** ⚠️ Kova KUCUK: bir istek ONLARCA embedding uretebilir (§10). */
    readonly embeddingRateLimit: number;
    readonly reindexBatchSize: number;
    /** Asilirsa 413 — sunucu bellegi siniri, R2 siniri degil. */
    readonly maxFileBytes: number;
    /** Asilirsa 422 ve KAYIT ACILMAZ. Asil maliyet frenidir. */
    readonly maxChunks: number;
  };

  /** Gunluk rapor worker'i (ADR-0030 §2). */
  readonly dailyReport: {
    readonly enabled: boolean;
    readonly intervalMs: number;
    readonly batchSize: number;
    readonly hourUtc: number;
    readonly windowHours: number;
  };
}

/** DI token'i. Symbol kullanildi: string token'lar sessizce cakisabilir. */
export const APP_CONFIG = Symbol('APP_CONFIG');

/**
 * Ham ortam degiskenlerini dogrular ve uygulama yapilandirmasina donusturur.
 *
 * @throws Dogrulama basarisiz olursa okunabilir bir hata ile — surec baslamaz.
 */
export function createAppConfig(source: Record<string, string | undefined>): AppConfig {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    throw new Error(formatEnvErrors(parsed.error));
  }

  const env = parsed.data;

  return {
    env: env.NODE_ENV,
    isProduction: env.NODE_ENV === 'production',
    port: env.PORT,
    version: env.APP_VERSION,
    database: toDatabaseConfig(env),
    logging: {
      level: env.LOG_LEVEL,
      pretty: env.LOG_PRETTY,
    },
    http: {
      corsOrigins: parseOrigins(env.CORS_ORIGINS),
    },
    swagger: {
      enabled: env.SWAGGER_ENABLED,
    },
    auth: toAuthConfig(env),
    outboxRelay: toOutboxRelayConfig(env),
    email: toEmailConfig(env),
    embedding: toEmbeddingConfig(env),
    llm: toLlmConfig(env),
    crm: {
      interactionsRateLimit: env.CRM_INTERACTIONS_RATE_LIMIT,
      reindexBatchSize: env.CRM_REINDEX_BATCH_SIZE,
      summaryRateLimit: env.CRM_SUMMARY_RATE_LIMIT,
      summaryContextInteractions: env.CRM_SUMMARY_CONTEXT_INTERACTIONS,
      summaryCharsPerInteraction: env.CRM_SUMMARY_CHARS_PER_INTERACTION,
      staleStageDays: env.CRM_STALE_STAGE_DAYS,
    },
    projects: {
      notesRateLimit: env.PROJECTS_NOTES_RATE_LIMIT,
      reindexBatchSize: env.PROJECTS_REINDEX_BATCH_SIZE,
      staleDays: env.PROJECTS_STALE_DAYS,
    },
    finance: {
      commentariesRateLimit: env.FINANCE_COMMENTARIES_RATE_LIMIT,
      reindexBatchSize: env.FINANCE_REINDEX_BATCH_SIZE,
    },
    appointments: {
      embeddingRateLimit: env.APPOINTMENTS_EMBEDDING_RATE_LIMIT,
      reindexBatchSize: env.APPOINTMENTS_REINDEX_BATCH_SIZE,
      noShowAlertRate: env.APPOINTMENTS_NO_SHOW_ALERT_RATE,
    },
    inventory: {
      embeddingRateLimit: env.INVENTORY_EMBEDDING_RATE_LIMIT,
      reindexBatchSize: env.INVENTORY_REINDEX_BATCH_SIZE,
      nearThresholdRatio: env.INVENTORY_NEAR_THRESHOLD_RATIO,
    },
    suppliers: {
      embeddingRateLimit: env.SUPPLIERS_EMBEDDING_RATE_LIMIT,
      reindexBatchSize: env.SUPPLIERS_REINDEX_BATCH_SIZE,
    },
    storage: toStorageConfig(env),
    documents: {
      embeddingRateLimit: env.DOCUMENTS_EMBEDDING_RATE_LIMIT,
      reindexBatchSize: env.DOCUMENTS_REINDEX_BATCH_SIZE,
      maxFileBytes: env.DOCUMENTS_MAX_FILE_BYTES,
      maxChunks: env.DOCUMENTS_MAX_CHUNKS,
    },
    ...toAiConfig(env),
  };
}

/**
 * Nesne deposu. Deger DONUSTURMEZ; yalnizca eslestirir.
 *
 * ⚠️ Bos dizeye DUSURME (`?? ''`) BILINCLIDIR ve tehlikeli DEGILDIR: env semasi
 * `STORAGE_PROVIDER=s3` iken bu dortlunun varligini ZATEN zorunlu kilar
 * (`requireS3StorageCredentials`) ve surec eksikse hic baslamaz. Yani bu dal
 * yalnizca `memory` saglayicisinda calisir — orada dordunun de karsiligi
 * yoktur ve okunmazlar.
 *
 * Alternatif, tipi `string | undefined` yapmakti; o zaman adapter'in kurucusu
 * her alani ikinci kez kontrol etmek zorunda kalirdi — env semasinda zaten
 * verilmis bir garantiyi ikinci kez, bu kez SESSIZCE.
 */
function toStorageConfig(env: Env): AppConfig['storage'] {
  return {
    provider: env.STORAGE_PROVIDER,
    endpoint: env.STORAGE_ENDPOINT ?? '',
    region: env.STORAGE_REGION,
    bucket: env.STORAGE_BUCKET ?? '',
    accessKeyId: env.STORAGE_ACCESS_KEY_ID ?? '',
    secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY ?? '',
    forcePathStyle: env.STORAGE_FORCE_PATH_STYLE,
  };
}

/** Veritabani baglantisi. Deger DONUSTURMEZ; yalnizca eslestirir. */
function toDatabaseConfig(env: Env): AppConfig['database'] {
  return {
    url: env.DATABASE_URL,
    poolMax: env.DATABASE_POOL_MAX,
    connectionTimeoutMs: env.DATABASE_CONNECTION_TIMEOUT_MS,
  };
}

/**
 * E-posta saglayicisi. Deger DONUSTURMEZ; yalnizca eslestirir.
 *
 * `?? ''`: sema `resend` secildiginde bu alanlari ZORUNLU kilar, dolayisiyla
 * bos string yalnizca `console` modunda olusabilir — o modda da hic okunmaz.
 */
function toEmailConfig(env: Env): AppConfig['email'] {
  return {
    provider: env.EMAIL_PROVIDER,
    resendApiKey: env.RESEND_API_KEY ?? '',
    from: env.EMAIL_FROM ?? '',
  };
}

/**
 * Embedding saglayicisi. `??  ''`: anahtar yalnizca `fake` modunda bos olabilir
 * — o modda da hic okunmaz (`toEmailConfig` ile ayni disiplin).
 */
function toEmbeddingConfig(env: Env): AppConfig['embedding'] {
  return {
    provider: env.EMBEDDING_PROVIDER,
    openAiApiKey: env.OPENAI_API_KEY ?? '',
    model: env.OPENAI_EMBEDDING_MODEL,
  };
}

/** Sohbet saglayicisi. `?? ''`: anahtar yalnizca `fake` modunda bos olabilir. */
function toLlmConfig(env: Env): AppConfig['llm'] {
  return {
    provider: env.LLM_PROVIDER,
    deepSeekApiKey: env.DEEPSEEK_API_KEY ?? '',
    model: env.LLM_MODEL,
  };
}

/** Retrieval ayarlari. Deger DONUSTURMEZ; yalnizca eslestirir. */
function toKnowledgeConfig(env: Env): AppConfig['knowledge'] {
  return {
    retrievalLimit: env.KNOWLEDGE_RETRIEVAL_LIMIT,
    historyMessages: env.KNOWLEDGE_HISTORY_MESSAGES,
    askRateLimit: env.KNOWLEDGE_ASK_RATE_LIMIT,
    notesRateLimit: env.KNOWLEDGE_NOTES_RATE_LIMIT,
    notePreviewLength: env.KNOWLEDGE_NOTE_PREVIEW_LENGTH,
    reindexBatchSize: env.KNOWLEDGE_REINDEX_BATCH_SIZE,
  };
}

/**
 * AI ile ilgili uc bolum tek yerde toplanir.
 *
 * `createAppConfig` govdesini kisa tutmak icin: o fonksiyon bir ESLESTIRME
 * listesidir, uzadikca okunurlugunu kaybeder.
 */
function toAiConfig(env: Env): Pick<AppConfig, 'knowledge' | 'dailyReport'> {
  return {
    knowledge: toKnowledgeConfig(env),
    dailyReport: toDailyReportConfig(env),
  };
}

/** Gunluk rapor worker'i. Deger DONUSTURMEZ; yalnizca eslestirir. */
function toDailyReportConfig(env: Env): AppConfig['dailyReport'] {
  return {
    enabled: env.DAILY_REPORT_ENABLED,
    intervalMs: env.DAILY_REPORT_INTERVAL_MS,
    batchSize: env.DAILY_REPORT_BATCH_SIZE,
    hourUtc: env.DAILY_REPORT_HOUR_UTC,
    windowHours: env.DAILY_REPORT_WINDOW_HOURS,
  };
}

/** Outbox tuketicisinin zamanlamasi. Deger DONUSTURMEZ; yalnizca eslestirir. */
function toOutboxRelayConfig(env: Env): AppConfig['outboxRelay'] {
  return {
    enabled: env.OUTBOX_RELAY_ENABLED,
    intervalMs: env.OUTBOX_RELAY_INTERVAL_MS,
    batchSize: env.OUTBOX_RELAY_BATCH_SIZE,
  };
}

/** Identity sirlarini yapilandirmaya tasir. Deger DONUSTURMEZ; yalnizca eslestirir. */
function toAuthConfig(env: Env): AppConfig['auth'] {
  return {
    jwt: {
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
      signingKid: env.JWT_SIGNING_KID,
      privateKeyBase64: env.JWT_PRIVATE_KEY,
      publicKeyBase64: env.JWT_PUBLIC_KEY,
    },
    verificationCodePepper: env.VERIFICATION_CODE_PEPPER,
  };
}

/**
 * Hata mesaji degiskeni adiyla listeler ama DEGERINI yazmaz —
 * yapilandirma hatasi log'a parola sizdirmanin klasik yoludur.
 */
function formatEnvErrors(error: ZodError): string {
  const lines = error.issues.map((issue) => {
    const path = issue.path.join('.');
    return `  - ${path === '' ? '(kok)' : path}: ${issue.message}`;
  });

  return ['Ortam degiskeni dogrulamasi basarisiz:', ...lines].join('\n');
}

function parseOrigins(raw: string): readonly string[] {
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}
