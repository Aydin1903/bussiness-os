import { pgSchema } from 'drizzle-orm/pg-core';

/**
 * `finance` semasi — Faz 5'in ucuncu is modulu (ADR-0034 §1).
 *
 * `platform` disindaki DORDUNCU sema. Mutlak Kural 5: her modul kendi semasina
 * sahiptir ve cross-schema FK yasaktir (tek istisna `platform.tenants`).
 *
 * Adlandirma `crm.schema.ts` / `knowledge.schema.ts` ile ayni: SEMA nesnesi
 * semanin adini alir. Projeler'deki cakisma (sema da tablo da `projects`)
 * burada YOKTUR — bu semada `finance` adli bir tablo yok.
 */
export const financeSchema = pgSchema('finance');
