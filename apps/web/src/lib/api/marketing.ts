import {
  campaignListResponseSchema,
  campaignSchema,
  campaignSummarySchema,
  reindexCampaignsResponseSchema,
  type Campaign,
  type CampaignListResponse,
  type CampaignStatus,
  type CampaignSummary,
  type CreateCampaignRequest,
  type ReindexCampaignsResponse,
  type UpdateCampaignRequest,
} from '@business-os/contracts';

import { apiFetch, apiSend } from './client';

function query(params: Record<string, string | number | boolean | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }
  return search.toString();
}

export function listCampaigns(params: {
  limit: number;
  offset: number;
  status?: CampaignStatus;
}): Promise<CampaignListResponse> {
  return apiFetch(`/campaigns?${query(params)}`, campaignListResponseSchema);
}

export function getCampaignSummary(): Promise<CampaignSummary> {
  return apiFetch('/campaigns/summary', campaignSummarySchema);
}

export function getCampaign(id: string): Promise<Campaign> {
  return apiFetch(`/campaigns/${id}`, campaignSchema);
}

export function createCampaign(body: CreateCampaignRequest): Promise<Campaign> {
  return apiFetch('/campaigns', campaignSchema, { body });
}

/**
 * ⚠️ BU FONKSIYON `feedback`te YOKTU — orada kayit GUNCELLENMEZDI.
 *
 * Kampanya HER DURUMDA duzenlenebilir, `done` DAHIL (ADR-0047 §2.2).
 */
export function updateCampaign(id: string, body: UpdateCampaignRequest): Promise<Campaign> {
  return apiFetch(`/campaigns/${id}`, campaignSchema, { body, method: 'PATCH' });
}

export function deleteCampaign(id: string): Promise<void> {
  return apiSend(`/campaigns/${id}`, { method: 'DELETE' });
}

export function reindexCampaigns(): Promise<ReindexCampaignsResponse> {
  return apiFetch('/campaigns/reindex', reindexCampaignsResponseSchema, { body: {} });
}
