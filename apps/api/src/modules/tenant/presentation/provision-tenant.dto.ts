import { z } from 'zod';

/**
 * `POST /api/v1/tenants` istek govdesi.
 *
 * DEVELOPMENT_RULES 2.3: sisteme giren HER dis veri Zod ile dogrulanir.
 * TypeScript tipleri runtime'da yoktur.
 *
 * ============================================================================
 * `ownerUserId` BILINCLI OLARAK YOK
 * ============================================================================
 * Sahip, dogrulanmis kullanicidir ve `CurrentUserProvider` uzerinden alinir.
 * Govdeden okunsaydi istemci kendisini istedigi kullanici olarak tanitirdi
 * (DEVELOPMENT_RULES 4.5 ile ayni gerekce).
 *
 * Bu alanin BULUNMAMASI bir eksiklik degil, bir GUVENLIK KARARIDIR — ve
 * ileride "kolaylik olsun" diye eklenmemesi icin burada yazilidir.
 * ============================================================================
 *
 * Sema burada, value object'ler domain'de: ikisi de dogrular ama farkli
 * amaclarla. Zod, ISTEMCIYE anlamli bir 422 uretmek icin sinirda calisir;
 * value object'ler is kuralini korur ve gecersiz nesnenin var olmasini
 * engeller. Biri digerinin yerini almaz.
 */
export const provisionTenantSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, 'Tenant adi bos olamaz')
      .max(200, 'Tenant adi en fazla 200 karakter olabilir'),

    // Bicim kurallarinin TEK dogruluk kaynagi TenantSlug value object'idir.
    // Buradaki kontroller yalnizca istemciye erken ve anlamli geri bildirim
    // verir; asil kapi VO'dur.
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(2, 'Slug en az 2 karakter olmali')
      .max(63, 'Slug en fazla 63 karakter olabilir'),
  })
  .strict(); // Tanimsiz alan REDDEDILIR: sessizce yok saymak, istemcinin
// gonderdigini sandigi ama islenmeyen veriyi gizler.

export type ProvisionTenantBody = z.infer<typeof provisionTenantSchema>;
