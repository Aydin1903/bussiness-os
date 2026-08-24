import { pgSchema } from 'drizzle-orm/pg-core';

/**
 * `hr` schema'si — Faz 5'in DOKUZUNCU is modulu (ADR-0043 §1).
 *
 * `platform` disindaki ONUNCU sema. Sema tanimi ayri bir dosyada cunku
 * `projects`/`appointments`/`documents`/`suppliers`taki cakismanin BESINCI
 * tekrari degil — burada cakisma YOK (`hr` vs `employees`/`compensation_records`).
 * Yine de konvansiyon korunuyor: sema tanimi her modulde ayni yerde durur.
 */
export const hrSchema = pgSchema('hr');
