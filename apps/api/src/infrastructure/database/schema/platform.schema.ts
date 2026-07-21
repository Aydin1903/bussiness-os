import { pgSchema } from 'drizzle-orm/pg-core';

/**
 * Platform schema'si.
 *
 * ARCHITECTURE 6.1: her modul kendi PostgreSQL schema'sina sahiptir ve
 * cross-schema foreign key YASAKTIR. `platform` schema'si tenant, identity,
 * authorization ve audit gibi cekirdek tablolara ev sahipligi yapar.
 */
export const platformSchema = pgSchema('platform');
