import { pgSchema } from 'drizzle-orm/pg-core';

/**
 * `appointments` semasi — Faz 5'in DORDUNCU is modulu (ADR-0035 §1).
 *
 * `platform` disindaki BESINCI sema. Mutlak Kural 5: her modul kendi semasina
 * sahiptir ve cross-schema FK yasaktir (tek istisna `platform.tenants`).
 *
 * ============================================================================
 * DOSYA ADI NEDEN `appointments.schema.ts` DEGIL
 * ============================================================================
 * `projects-schema.schema.ts` ile BIREBIR AYNI durum, ikinci kez: bu klasorde
 * SEMA nesnesi semanin adini alir (`crm.schema.ts`, `finance.schema.ts`), TABLO
 * dosyalari tablonun adini (`companies.schema.ts`, `tasks.schema.ts`).
 *
 * Randevu'da ikisi CAKISIYOR: sema da tablo da `appointments`. Cakismayi sema
 * dosyasi ustlenir — Projeler'de verilen ayni karar, ayni gerekceyle: sema
 * TEKTIR, tablo dosyalari ise coguldur ve modul buyudukce cogalir.
 */
export const appointmentsSchema = pgSchema('appointments');
