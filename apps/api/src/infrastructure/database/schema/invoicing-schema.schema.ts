import { pgSchema } from 'drizzle-orm/pg-core';

/**
 * `invoicing` semasi — Faz 5'in SEKIZINCI is modulu (ADR-0041 §1).
 *
 * `platform` disindaki DOKUZUNCU sema. Mutlak Kural 5: her modul kendi semasina
 * sahiptir ve cross-schema FK yasaktir (tek istisna `platform.tenants`).
 *
 * ============================================================================
 * DOSYA ADI NEDEN AYRI — cakisma DEGIL, KONVANSIYON
 * ============================================================================
 * `suppliers`ta ayri dosya ZORUNLULUKTU (sema `suppliers`, tablo da
 * `suppliers`; ayni dosyada iki kez export edilemezdi). Burada oyle bir cakisma
 * YOK — sema `invoicing`, tablolar `sales_documents` / `sales_document_lines` /
 * `number_sequences`. Ayri dosya, `inventory`de oldugu gibi bir TUTARLILIK
 * tercihidir.
 *
 * ⚠️ Tablo adinin `documents` OLMAMASI bilinclidir (ADR-0041 §1):
 * `invoicing.documents` sema-nitelenmis oldugu icin yasaldi ama
 * `documents.documents` ile yan yana okundugunda iki farkli kavrami ayni
 * kelimeyle adlandirirdi. Ayni belirsizlik izin tarafinda da reddedildi —
 * `document:read` Belge modulunundur (§9.1).
 */
export const invoicingSchema = pgSchema('invoicing');
