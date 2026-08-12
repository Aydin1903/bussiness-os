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

// --- CRM (ADR-0031 §1) ---
export { crmSchema } from './crm.schema';
export { companies } from './companies.schema';
export { contacts } from './contacts.schema';
export { opportunities } from './opportunities.schema';
export { interactions } from './interactions.schema';
export { interactionChunks } from './interaction-chunks.schema';
// Katman 2 (ADR-0032) — ONBELLEK, kuyruk degil.
export { companySummaries } from './company-summaries.schema';

// --- Projeler (ADR-0033 §1) ---
// `projectsSchema` ayri bir dosyada: sema ve tablo AYNI adi tasiyor, cakismayi
// sema dosyasi ustlendi (gerekce `projects-schema.schema.ts`'te).
export { projectsSchema } from './projects-schema.schema';
export { projects } from './projects.schema';
export { tasks } from './tasks.schema';
export { progressNotes } from './progress-notes.schema';
export { progressNoteChunks } from './progress-note-chunks.schema';

// --- Finans (ADR-0034 §1) ---
// ⚠️ `finance.categories` uzerindeki `UNIQUE (id, direction)` kisiti burada
// TEMSIL EDILMEZ (yukaridaki "yalnizca tip guvenligi" uyarisinin somut bir
// ornegi) ama migration `0024`'un bilesik FK'sinin ON KOSULUDUR. Elle
// silinirse hata TIP DENETIMINDE degil, migration calisirken gorunur.
export { financeSchema } from './finance.schema';
export { financeCategories } from './finance-categories.schema';
export { financeTransactions } from './finance-transactions.schema';
// ⚠️ Finans'ta EMBED EDILEN TEK yuzey `commentaries`tir; `transactions
// .description` duz kolondur (ADR-0034 §6.1 — ortak top-K havuzu).
export { financeCommentaries } from './finance-commentaries.schema';
export { financeCommentaryChunks } from './finance-commentary-chunks.schema';

// --- Randevu / Rezervasyon (ADR-0035 §1) ---
// `appointmentsSchema` ayri bir dosyada: sema ve tablo AYNI adi tasiyor —
// `projects`teki cakismanin birebir aynisi, ikinci kez.
//
// ⚠️ BU MODULDE `*_chunks` TABLOSU YOKTUR (ADR-0035 §3). Dort onceki anlamsal
// kaynagin dordu de ayri bir parca tablosu tasiyordu; randevu notu kisa ve tek
// seferliktir, dolayisiyla vektor AYNI SATIRDA yasar.
export { appointmentsSchema } from './appointments-schema.schema';
export { appointments } from './appointments.schema';
