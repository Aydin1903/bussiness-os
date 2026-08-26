import { Injectable } from '@nestjs/common';

import {
  type ContextFragment,
  type ContributeInput,
  type RetrievalContributor,
} from '../../../platform/context/context.public';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { type MarketingRepository } from '../application/marketing.repository.port';
import { withCampaignHeader } from '../domain/campaign.entity';
import { CAMPAIGN_READ } from '../marketing.permissions';

/**
 * `campaign-notes` — kampanyanin ANLAMSAL sesi (ADR-0047 §3.1).
 *
 * ONUNCU anlamsal kaynak. ROADMAP §3.5'in kapsam notu tam olarak bunu tarif
 * ediyordu: _"Anlatisal veri — CRM'in embedding desenini yeniden kullanir."_
 *
 * ⚠️ YALNIZCA `result_note` OLAN kayitlar burada gorunur — vektor yalnizca o
 * zaman uretilir (§3.1). Durust bedeli: SUREN bir kampanya AI'a GORUNMEZ ve
 * tam olarak o kume `campaign-gap`in bahsettigi kumedir. Iki katkici ayni
 * havuzda HICBIR ZAMAN ayni seyi soylemez.
 */
export const CAMPAIGN_NOTES_SOURCE = 'campaign-notes';

@Injectable()
export class CampaignNotesContributor implements RetrievalContributor {
  readonly source = CAMPAIGN_NOTES_SOURCE;
  readonly contributionKind = 'semantic' as const;
  readonly permission = CAMPAIGN_READ;

  constructor(
    private readonly repository: MarketingRepository,
    private readonly transactionManager: TransactionManager,
  ) {}

  async contribute(input: ContributeInput): Promise<ContextFragment[]> {
    const rows = await this.transactionManager.runInCurrentTenantTransaction(() =>
      this.repository.findSimilarCampaigns({
        embedding: input.embedding,
        limit: input.limit,
      }),
    );

    return rows.map((row, index) => ({
      content: withCampaignHeader({
        name: row.name,
        channel: row.channel,
        startsOn: row.startsOn,
        endsOn: row.endsOn,
        resultNote: row.resultNote,
      }),
      // Anlamsal skor: en iyi isabet ~1.0, sirayla azalir (dokuz kaynakla
      // ayni formul — kaynaklar arasi kalibrasyon YOK, ADR-0031'den beri
      // bilinen sinir, ONBIRINCI kez).
      score: 1 - index / (rows.length + 1),
      source: CAMPAIGN_NOTES_SOURCE,
      reference: { kind: 'campaign', id: row.id },
    }));
  }
}
