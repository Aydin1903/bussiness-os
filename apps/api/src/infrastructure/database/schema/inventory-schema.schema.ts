import { pgSchema } from 'drizzle-orm/pg-core';

/**
 * `inventory` semasi — Faz 5'in ALTINCI is modulu (ADR-0039 §1).
 *
 * `platform` disindaki YEDINCI sema. Mutlak Kural 5: her modul kendi semasina
 * sahiptir ve cross-schema FK yasaktir (tek istisna `platform.tenants`).
 *
 * ============================================================================
 * DOSYA ADI NEDEN AYRI — ama cakisma sebebi FARKLI
 * ============================================================================
 * `projects-schema.schema.ts`, `appointments-schema.schema.ts` ve
 * `documents-schema.schema.ts`te sema ve tablo AYNI adi tasidigi icin
 * cakisiyordu. BURADA CAKISMA YOK: sema `inventory`, tablolar `items` ve
 * `movements`.
 *
 * Yine de ayri dosyada duruyor — konvansiyon adina degil, bir tuzagi
 * onlemek icin: `items.schema.ts` ve `movements.schema.ts` gibi NITELENMEMIS
 * dosya adlari bu klasorde tehlikelidir (klasorde `notes.schema.ts`,
 * `tasks.schema.ts`, `messages.schema.ts` gibi baska modullerin tablolari da
 * var). Bu yuzden tablo dosyalari `inventory-` onekiyle yazildi ve sema dosyasi
 * onlarla ayni oneki paylasiyor.
 */
export const inventorySchema = pgSchema('inventory');
