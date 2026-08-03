import { pgSchema } from 'drizzle-orm/pg-core';

/**
 * Knowledge modulu schema'si (ADR-0029, ADR-0030).
 *
 * ARCHITECTURE 6.1: her modul kendi PostgreSQL schema'sina sahiptir. Bu,
 * `platform` disinda acilan ILK modul semasidir — Faz 1-3 tumuyle platform
 * cekirdegiydi.
 *
 * `platform.tenants`'a verilen FK'ler bir MODUL ARASI bagimlilik DEGILDIR
 * (Mutlak Kural 5): tenant, modullerin ustunde yasayan platform kavramidir ve
 * `platform.outbox` ayni FK'yi tasir. Modul ARASI (ornegin knowledge -> identity)
 * FK ise yoktur ve olmayacaktir.
 */
export const knowledgeSchema = pgSchema('knowledge');
