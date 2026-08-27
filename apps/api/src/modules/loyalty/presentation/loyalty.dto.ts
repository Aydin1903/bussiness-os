import { z } from 'zod';

import { MAX_POINT_ENTRY_NOTE_CHARS, POINT_DIRECTIONS } from '../domain/point-entry.entity';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

/**
 * ⚠️ Zod listesi veritabanindaki `point_entries_direction_valid` CHECK'i ile
 * SENKRON kalmak zorundadir — ikisi de ayni domain sabitinden
 * (`POINT_DIRECTIONS`) turetiliyor ki ayrisma IMKANSIZ olsun.
 */
const direction = z.enum(POINT_DIRECTIONS);

/**
 * ⚠️ `crmContactId` ZORUNLU — `nullish` DEGIL (ADR-0051 §6.1).
 *
 * Bugune kadarki BES cross-modul isaretcisinin BESI DE opsiyoneldi. Burada
 * degil: musterisi olmayan bir bakiye, musteri geldiginde BULUNAMAZ ve
 * harcanamaz — yani modulun var olus sebebi ortadan kalkar.
 */
export const createAccountSchema = z
  .object({
    crmContactId: z.uuid('crmContactId gecerli bir UUID olmali'),
  })
  .strict();

/**
 * ⚠️ PUAN HAREKETI — ve burada bir `balance` alani YOKTUR.
 *
 * Kullanici KAC PUAN harcanacagini yazar; yeterli olup olmadigina SUNUCU karar
 * verir (ADR-0051 §4.2). Istemciye hesaplatmak, ADR-0039'un fiziksel sayim
 * tuzagini geri getirirdi: istemcinin okudugu bakiye ile istegin vardigi an
 * arasinda bir satir girerse kontrol YANLIS olur ve hata SESSIZDIR.
 */
export const createEntrySchema = z
  .object({
    direction,
    /**
     * ⚠️ `.int().positive()` — isaret `direction`dadir, miktarda DEGIL (§1.4).
     * ⚠️ `.int()`: puan SAYILIR, olculmez; 3,5 puan yoktur (§1.5).
     * ⚠️ Ust sinir YOK — icat edilmis bir sayi olurdu; bir tipo GORUNURDUR.
     */
    points: z.number().int().positive('Puan miktari pozitif olmali'),
    note: z.string().trim().max(MAX_POINT_ENTRY_NOTE_CHARS).nullish(),
    /**
     * ⚠️ `z.iso.datetime` — bir AN (Randevu'nun karari), `date` DEGIL.
     *
     * Bir kampanyanin saati yoktur (ADR-0047 §1.5) ama bir puan hareketi
     * KASADA BIR ANDA olur ve gun icinde sirasi anlamlidir.
     *
     * ⚠️ Gelecege tarihli olamaz — kontrol DOMAIN katmanindadir
     * (`FutureEntryDateError` -> 422) cunku `CHECK (occurred_at <= now())`
     * YAZILAMAZ: `now()` stabil degildir ve PostgreSQL kisitlarda IMMUTABLE
     * ifade ister.
     */
    occurredAt: z.iso.datetime({ offset: true }).nullish(),
  })
  .strict();

export const listQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
    offset: z.coerce.number().int().min(0).default(0),
  })
  .strict();

export const idParamSchema = z.object({ id: z.uuid('Gecersiz id') }).strict();

export type CreateAccountBody = z.infer<typeof createAccountSchema>;
export type CreateEntryBody = z.infer<typeof createEntrySchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
