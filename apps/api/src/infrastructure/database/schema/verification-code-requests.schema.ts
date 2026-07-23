import { index, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { platformSchema } from './platform.schema';

/**
 * `platform.verification_code_requests` — resend sinirlarinin defteri
 * (ADR-0019 §7.4).
 *
 * FOREIGN KEY YOKTUR: `login_attempts` ile ayni gerekce — istek var olmayan bir
 * hesaba ait olabilir ve yanit yine de aynidir (P2). Sayimlarin URETILEN kodlar
 * yerine ISTEKLER uzerinden yapilmasinin sebebi de budur: aksi halde var olmayan
 * e-postalarla yapilan istekler hicbir sayaca dusmezdi.
 *
 * Hem kayit (`register`) hem yeniden gonderme (`resend-verification`) buraya
 * yazar: 60 saniyelik bekleme, kayittan HEMEN sonraki ilk resend'i de kapsamak
 * zorundadir — kuralin varlik sebebi tam olarak o senaryodur.
 */
export const verificationCodeRequests = platformSchema.table(
  'verification_code_requests',
  {
    id: uuid('id').primaryKey(),

    /** Normalize e-posta. Hesap bazli sinirlarin (60 sn · 5/saat) anahtari. */
    emailNormalized: text('email_normalized').notNull(),

    /** Istemci IP'si (text — `login_attempts` ile ayni bicim). 20/saat anahtari. */
    ipAddress: text('ip_address').notNull(),

    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('verification_code_requests_email_idx').on(table.emailNormalized, table.requestedAt),
    index('verification_code_requests_ip_idx').on(table.ipAddress, table.requestedAt),
  ],
);
