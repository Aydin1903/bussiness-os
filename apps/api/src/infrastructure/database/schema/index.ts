/**
 * Drizzle sema tanimlarinin toplandigi yer.
 *
 * ARCHITECTURE 6.1: her modul kendi PostgreSQL schema'sina sahiptir ve
 * cross-schema foreign key YASAKTIR.
 *
 * ONEMLI: bu dosyalar yalnizca TIP GUVENLIGI saglar. RLS politikalari, CHECK
 * kisitlari ve SECURITY DEFINER fonksiyonlari Drizzle sema tanimindan
 * URETILEMEZ; onlar `drizzle/*.sql` altinda ELLE yazilir (DEVELOPMENT_RULES 6).
 * Bir tablonun burada tanimli olmasi, korunuyor oldugu anlamina GELMEZ —
 * korumanin kaniti entegrasyon testlerindedir (MULTI_TENANT_ARCHITECTURE 12.6).
 */
export { platformSchema } from './platform.schema';
export { tenants } from './tenants.schema';
export { memberships } from './memberships.schema';
export { outbox } from './outbox.schema';
