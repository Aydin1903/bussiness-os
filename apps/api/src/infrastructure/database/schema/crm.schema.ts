import { pgSchema } from 'drizzle-orm/pg-core';

/**
 * `crm` semasi — Faz 5'in ilk is modulu (ADR-0031 §1).
 *
 * `platform` disindaki IKINCI sema. Mutlak Kural 5: her modul kendi semasina
 * sahiptir ve cross-schema FK yasaktir (tek istisna `platform.tenants`).
 */
export const crmSchema = pgSchema('crm');
