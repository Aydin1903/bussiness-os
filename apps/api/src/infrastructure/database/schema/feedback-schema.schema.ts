import { pgSchema } from 'drizzle-orm/pg-core';

/**
 * `feedback` semasi — Faz 5'in ONUNCU is modulu (ADR-0045 §1).
 *
 * `platform` disindaki ONBIRINCI sema. Mutlak Kural 5: her modul kendi semasina
 * sahiptir ve cross-schema FK yasaktir (tek istisna `platform.tenants`).
 *
 * ============================================================================
 * DOSYA ADI NEDEN AYRI — cakisma DEGIL, KONVANSIYON
 * ============================================================================
 * Sema `feedback`, tablo `responses` — `suppliers`/`suppliers` ya da
 * `projects`/`projects` gibi bir ISIM CAKISMASI YOKTUR (`inventory` ve `hr` ile
 * ayni sinif). Yani burada ayri dosya bir ZORUNLULUK degil, sema tanimini
 * tablolardan ayri tutan konvansiyonun surdurulmesidir.
 */
export const feedbackSchema = pgSchema('feedback');
