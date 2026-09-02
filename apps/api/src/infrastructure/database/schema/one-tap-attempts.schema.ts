import { text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { platformSchema } from './platform.schema';

/**
 * `platform.one_tap_attempts` — One Tap oran siniri defteri (ADR-0053 EK-1.4).
 *
 * ============================================================================
 * ⚠️ E-POSTA KOLONU YOKTUR VE EKLENMEMELIDIR
 * ============================================================================
 * `verification_code_requests` hem e-posta hem IP tutar; bu tablo YALNIZCA IP
 * tutar. Sebep bir sadelestirme degil, bir SALDIRI YUZEYININ KAPATILMASIDIR:
 * e-posta bazli bir sayac, saldirganin kurbanin adresiyle art arda basarisiz
 * One Tap gonderip KURBANI KILITLEMESINE izin verirdi (ADR-0022 defterinin
 * ayni tuzagi — migration `0041` bunu ayrintisiyla yaziyor).
 *
 * ⚠️ EKLEME-YALNIZ: bir denemenin sonradan degistirilmesi diye bir sey yoktur.
 * `0041` tablo seviyesinde `UPDATE` yetkisini KALDIRIR ve `0040`tan farkli
 * olarak kolon bazli bir istisna da BIRAKMAZ. `DELETE` kalir — retention
 * temizligi bu tabloyu kirpacaktir (ROADMAP §8.5).
 *
 * RLS YOKTUR (MT §12.4.3): uc kimlik oncesidir, tenant context'i yoktur.
 * ============================================================================
 */
export const oneTapAttempts = platformSchema.table('one_tap_attempts', {
  id: uuid('id').primaryKey(),

  /** ⚠️ TEK anahtar. IPv6 icin 45 karakter yeter (`0041` CHECK'i). */
  ipAddress: text('ip_address').notNull(),

  /** `Clock` port'undan gelir; `DEFAULT now()` bilincli olarak YOK. */
  attemptedAt: timestamp('attempted_at', { withTimezone: true }).notNull(),
});
