import { z } from 'zod';

import {
  CAMPAIGN_STATUSES,
  MAX_CAMPAIGN_CHANNEL_CHARS,
  MAX_CAMPAIGN_NAME_CHARS,
  MAX_CAMPAIGN_RESULT_NOTE_CHARS,
} from '../domain/campaign.entity';

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 20;

/**
 * ⚠️ TAKVIM GUNU — bir AN degil (ADR-0047 §1.5).
 *
 * `z.iso.datetime` DEGIL: bir kampanyanin saati yoktur ve ofsetli bir zaman
 * kabul etmek, olmayan bir bilgiyi UYDURMAK olurdu. Formati gecen ama
 * takvimde OLMAYAN bir gun (2026-02-31) domain katmaninda yakalanir.
 */
const calendarDay = z.iso.date('Tarih YYYY-AA-GG biciminde olmali');

/**
 * ⚠️ Zod listesi veritabanindaki `campaigns_status_valid` CHECK'i ile SENKRON
 * kalmak zorundadir — ikisi de ayni domain sabitinden (`CAMPAIGN_STATUSES`)
 * turetiliyor ki ayrisma IMKANSIZ olsun.
 */
const status = z.enum(CAMPAIGN_STATUSES);

export const createCampaignSchema = z
  .object({
    name: z.string().trim().min(1, 'Kampanya adi bos olamaz').max(MAX_CAMPAIGN_NAME_CHARS),
    channel: z.string().trim().max(MAX_CAMPAIGN_CHANNEL_CHARS).nullish(),
    startsOn: calendarDay,
    // ⚠️ `nullish`: `null` = ACIK UCLU kampanya, gercek bir durum.
    endsOn: calendarDay.nullish(),
    status: status.default('draft'),
    resultNote: z.string().trim().max(MAX_CAMPAIGN_RESULT_NOTE_CHARS).nullish(),
    crmCompanyId: z.uuid('crmCompanyId gecerli bir UUID olmali').nullish(),
  })
  .strict();

/**
 * ⚠️ `PATCH` — HER ALAN OPSIYONEL, ama BOS GOVDE REDDEDILIR.
 *
 * Bos bir govde hicbir sey degistirmez ama `updated_at`i tazeler ve — daha
 * kotusu — hicbir sey olmadigi halde "guncellendi" cevabi doner.
 */
export const updateCampaignSchema = z
  .object({
    name: z.string().trim().min(1).max(MAX_CAMPAIGN_NAME_CHARS).optional(),
    channel: z.string().trim().max(MAX_CAMPAIGN_CHANNEL_CHARS).nullish(),
    startsOn: calendarDay.optional(),
    endsOn: calendarDay.nullish(),
    status: status.optional(),
    resultNote: z.string().trim().max(MAX_CAMPAIGN_RESULT_NOTE_CHARS).nullish(),
    crmCompanyId: z.uuid('crmCompanyId gecerli bir UUID olmali').nullish(),
  })
  .strict()
  .refine((body) => Object.keys(body).length > 0, {
    message: 'En az bir alan gonderilmelidir',
  });

export const listCampaignsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
    offset: z.coerce.number().int().min(0).default(0),
    status: status.optional(),
  })
  .strict();

export const reindexCampaignsSchema = z.object({}).strict();

export const idParamSchema = z.object({ id: z.uuid('Gecersiz id') }).strict();

export type CreateCampaignBody = z.infer<typeof createCampaignSchema>;
export type UpdateCampaignBody = z.infer<typeof updateCampaignSchema>;
export type ListCampaignsQuery = z.infer<typeof listCampaignsQuerySchema>;
export type ReindexCampaignsBody = z.infer<typeof reindexCampaignsSchema>;
