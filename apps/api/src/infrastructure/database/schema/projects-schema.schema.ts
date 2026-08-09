import { pgSchema } from 'drizzle-orm/pg-core';

/**
 * `projects` semasi — Faz 5'in ikinci is modulu (ADR-0033 §1).
 *
 * `platform` disindaki UCUNCU sema. Mutlak Kural 5: her modul kendi semasina
 * sahiptir ve cross-schema FK yasaktir (tek istisna `platform.tenants`).
 *
 * ============================================================================
 * DOSYA ADI NEDEN `projects.schema.ts` DEGIL
 * ============================================================================
 * Bu klasorde iki adlandirma yan yana yasiyor: SEMA nesnesi semanin adini alir
 * (`crm.schema.ts`, `knowledge.schema.ts`, `platform.schema.ts`), TABLO
 * dosyalari tablonun adini (`companies.schema.ts`, `notes.schema.ts`).
 *
 * Projeler'de ikisi CAKISIYOR: sema da tablo da `projects`. Cakismayi sema
 * dosyasi ustlendi cunku o TEK, tablo dosyalari ise coguldur — ve `projects`
 * tablosunun `projects.schema.ts`'te durmasi, komsu `tasks.schema.ts` /
 * `progress-notes.schema.ts` ile tutarli kalir.
 */
export const projectsSchema = pgSchema('projects');
