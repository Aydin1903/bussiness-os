/**
 * Drizzle sema tanimlarinin toplandigi yer.
 *
 * ARCHITECTURE 6.1: her modul kendi PostgreSQL schema'sina sahiptir ve
 * cross-schema foreign key YASAKTIR.
 *
 * ONEMLI: bu dosyalar yalnizca TIP GUVENLIGI saglar. RLS politikalari, CHECK
 * kisitlari ve SECURITY DEFINER fonksiyonlari Drizzle sema tanimindan
 * URETILEMEZ; onlar `drizzle/*.sql` altinda ELLE yazilir (DEVELOPMENT_RULES 6).
 * Bir tablonun burada tanimli olmasi, korunuyor oldugu anlamina GELMEZ —
 * korumanin kaniti entegrasyon testlerindedir (MULTI_TENANT_ARCHITECTURE 12.6).
 */
export { platformSchema } from './platform.schema';
export { tenants } from './tenants.schema';
export { memberships } from './memberships.schema';
export { outbox } from './outbox.schema';

// Identity (Faz 3) — hepsi tenant-scoped DEGILDIR (MULTI_TENANT_ARCHITECTURE 12.4
// istisna listesi); tenant RLS uygulanmaz, erisim Identity repository'sinden.
export { users } from './users.schema';
export { credentials } from './credentials.schema';
export { emailVerificationCodes } from './email-verification-codes.schema';
export { tokenFamilies } from './token-families.schema';
export { refreshTokens } from './refresh-tokens.schema';
export { loginAttempts } from './login-attempts.schema';
export { verificationCodeRequests } from './verification-code-requests.schema';
export { passwordResetCodes } from './password-reset-codes.schema';
export { identityOutbox } from './identity-outbox.schema';

// Knowledge (Faz 4) — `platform` disindaki ILK modul semasi (ADR-0029, ADR-0030).
// Hepsi tenant-scoped: RLS ENABLE + FORCE, standart sablon (MT §12.2).
export { knowledgeSchema } from './knowledge.schema';
export { notes } from './notes.schema';
export { noteChunks } from './note-chunks.schema';
export { conversations } from './conversations.schema';
export { messages } from './messages.schema';
export { dailyReportRuns } from './daily-report-runs.schema';
export { rateLimits } from './rate-limits.schema';
