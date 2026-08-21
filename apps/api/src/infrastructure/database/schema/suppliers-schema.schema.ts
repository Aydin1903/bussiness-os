import { pgSchema } from 'drizzle-orm/pg-core';

/**
 * `suppliers` semasi — Faz 5'in YEDINCI is modulu (ADR-0040 §1).
 *
 * `platform` disindaki SEKIZINCI sema. Mutlak Kural 5: her modul kendi semasina
 * sahiptir ve cross-schema FK yasaktir (tek istisna `platform.tenants`).
 *
 * ============================================================================
 * DOSYA ADI NEDEN AYRI — cakisma, DORDUNCU kez
 * ============================================================================
 * Sema `suppliers`, tablo da `suppliers`. `projects`, `appointments` ve
 * `documents`ta yasanan cakismanin birebir aynisi; sema tanimi bu yuzden ayri
 * bir dosyada durur.
 *
 * ⚠️ `inventory` bu tuzagi YASAMAMISTI (sema `inventory`, tablolar `items` /
 * `movements`) ve orada ayri dosya bir KONVANSIYON tercihiydi. Burada
 * ZORUNLULUK: ayni dosyada `suppliers` adi iki kez export edilemez.
 */
export const suppliersSchema = pgSchema('suppliers');
