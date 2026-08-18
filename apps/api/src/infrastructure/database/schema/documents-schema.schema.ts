import { pgSchema } from 'drizzle-orm/pg-core';

/**
 * `documents` semasi — Faz 5'in BESINCI is modulu (ADR-0037 §1).
 *
 * `platform` disindaki ALTINCI sema. Mutlak Kural 5: her modul kendi semasina
 * sahiptir ve cross-schema FK yasaktir (tek istisna `platform.tenants`).
 *
 * ============================================================================
 * DOSYA ADI NEDEN `documents.schema.ts` DEGIL
 * ============================================================================
 * `projects-schema.schema.ts` ve `appointments-schema.schema.ts` ile BIREBIR
 * AYNI durum, UCUNCU kez: bu klasorde SEMA nesnesi semanin adini alir
 * (`crm.schema.ts`, `finance.schema.ts`), TABLO dosyalari tablonun adini
 * (`companies.schema.ts`, `tasks.schema.ts`).
 *
 * Belge'de ikisi CAKISIYOR: sema da tablo da `documents`. Cakismayi sema
 * dosyasi ustlenir — ayni karar, ayni gerekceyle: sema TEKTIR, tablo dosyalari
 * ise coguldur ve modul buyudukce cogalir (burada ikinci tablo `0028` ile
 * zaten geldi).
 */
export const documentsSchema = pgSchema('documents');
