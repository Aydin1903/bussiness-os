'use client';

import { CLOSED_OPPORTUNITY_STAGES } from '@business-os/contracts';
import type {
  Contact,
  CreateOpportunityRequest,
  Opportunity,
  OpportunityListRow,
} from '@business-os/contracts';
import { useState } from 'react';

import { createOpportunity, deleteOpportunity, updateOpportunity } from '@/lib/api/crm';
import { errorMessage } from '@/lib/api/error-message';
import { FormError } from '@/components/ui/form-error';
import { PillButton, SectionLabel } from './chrome';
import { ConfirmDelete } from './confirm-delete';
import { FollowUpMark } from './follow-up-mark';
import { OpportunityForm } from './opportunity-form';
import { CardAction, CardActions, CardTitle, RecordCard } from './record-card';
import { formatMoney, StagePill } from './stage-pill';
import { StageAgeMark } from './signals';

const FORBIDDEN =
  'Bu işlem için yetkiniz yok. Fırsatları yalnızca sahip, yönetici veya üye değiştirebilir.';

type FormTarget = { kind: 'none' } | { kind: 'new' } | { kind: 'edit'; opportunity: Opportunity };

/**
 * Şirket detayındaki fırsatlar bölümü.
 *
 * ============================================================================
 * AŞAMA BURADAN DEĞİŞİR — hattan DEĞİL
 * ============================================================================
 * Hat (`/app/crm/pipeline`) salt okurdur ve sürükle-bırak taşımaz. Aşama
 * değişimi `stage_changed_at`'i ilerletir, yani "kaç gündür bu aşamada"
 * sinyalini ve AI'ın yapısal katkısını etkiler; kazara bir sürükleme o sinyali
 * sessizce bozardı. Değişiklik, bağlamın tam olduğu yerde — şirketin kendi
 * sayfasında — yapılır.
 */
export function OpportunitySection({
  companyId,
  opportunities,
  contacts,
  total,
  loading,
  failed,
  readOnly,
  onChanged,
}: {
  companyId: string;
  opportunities: readonly OpportunityListRow[];
  /** Fırsatın ilgili kişisi bu listeden seçilir. */
  contacts: readonly Contact[];
  total: number;
  loading: boolean;
  /** Liste çekilemedi — "hiç fırsat yok" ile AYNI ŞEY DEĞİL. */
  failed: boolean;
  readOnly: boolean;
  onChanged: () => void;
}) {
  const [form, setForm] = useState<FormTarget>({ kind: 'none' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function closeForm(): void {
    setForm({ kind: 'none' });
    setFormError(null);
  }

  async function save(body: CreateOpportunityRequest): Promise<void> {
    setSaving(true);
    setFormError(null);
    try {
      if (form.kind === 'edit') {
        // `companyId` gövdeden ÇIKARILIR: backend güncellemede kabul etmez
        // (fırsatı taşımak ayrı bir işlemdir).
        const { companyId: _ignored, ...changes } = body;
        await updateOpportunity(form.opportunity.id, changes);
      } else {
        await createOpportunity(body);
      }
      closeForm();
      onChanged();
    } catch (caught) {
      setFormError(errorMessage(caught, undefined, { 403: FORBIDDEN }));
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string): Promise<void> {
    setDeletingId(id);
    setActionError(null);
    try {
      await deleteOpportunity(id);
      onChanged();
    } catch (caught) {
      setActionError(
        errorMessage(caught, undefined, {
          403: 'Silme yetkiniz yok. Fırsat silmeyi yalnızca sahip veya yönetici yapabilir.',
        }),
      );
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="mt-10">
      <div className="mb-3 flex items-center justify-between gap-3">
        <SectionLabel>Fırsatlar{failed ? '' : ` · ${String(total)}`}</SectionLabel>

        {readOnly || form.kind !== 'none' ? null : (
          <PillButton
            onClick={() => {
              setForm({ kind: 'new' });
            }}
          >
            Fırsat ekle
          </PillButton>
        )}
      </div>

      {form.kind === 'none' ? null : (
        <OpportunityForm
          companyId={companyId}
          contacts={contacts}
          {...(form.kind === 'edit' ? { initial: form.opportunity } : {})}
          pending={saving}
          error={formError}
          onSubmit={(body) => {
            void save(body);
          }}
          onCancel={closeForm}
        />
      )}

      <FormError message={actionError} />

      {opportunities.length === 0 ? (
        <EmptyOpportunities loading={loading} failed={failed} readOnly={readOnly} />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {opportunities.map((opportunity) => (
            <li key={opportunity.id}>
              <OpportunityCard
                opportunity={opportunity}
                readOnly={readOnly}
                deleting={deletingId === opportunity.id}
                onEdit={() => {
                  setForm({ kind: 'edit', opportunity });
                }}
                onDelete={() => {
                  void remove(opportunity.id);
                }}
              />
            </li>
          ))}
        </ul>
      )}

      {opportunities.length < total ? (
        <p className="mt-3 text-[11.5px] text-fg-3">
          İlk {opportunities.length} fırsat gösteriliyor (toplam {total}).
        </p>
      ) : null}
    </section>
  );
}

function OpportunityCard({
  opportunity,
  readOnly,
  deleting,
  onEdit,
  onDelete,
}: {
  opportunity: OpportunityListRow;
  readOnly: boolean;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const money = formatMoney(opportunity.estimatedValue, opportunity.currency);

  return (
    <RecordCard>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <CardTitle>{opportunity.title}</CardTitle>
          <StagePill stage={opportunity.stage} />
        </div>

        {readOnly ? null : (
          <CardActions>
            <CardAction ariaLabel={`${opportunity.title} fırsatını düzenle`} onClick={onEdit}>
              Düzenle
            </CardAction>
            <ConfirmDelete
              pending={deleting}
              ariaLabel={`${opportunity.title} fırsatını sil`}
              question={`"${opportunity.title}" fırsatı kalıcı olarak silinecek. Müşteri ve görüşmeler kalır.`}
              onConfirm={onDelete}
            />
          </CardActions>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {money === null ? null : (
          <span className="font-mono text-[12px] font-medium text-fg tabular">{money}</span>
        )}
        {opportunity.nextFollowUpOn === null ? (
          <span className="text-[11.5px] text-fg-3">Takip tarihi yok</span>
        ) : (
          <FollowUpMark day={opportunity.nextFollowUpOn} />
        )}
        <StageAgeMark
          stageChangedAt={opportunity.stageChangedAt}
          closed={CLOSED_OPPORTUNITY_STAGES.includes(opportunity.stage)}
        />
      </div>
    </RecordCard>
  );
}

function EmptyOpportunities({
  loading,
  failed,
  readOnly,
}: {
  loading: boolean;
  failed: boolean;
  readOnly: boolean;
}) {
  if (loading) {
    return <p className="text-[12.5px] text-fg-3">Yükleniyor…</p>;
  }
  if (failed) {
    return <p className="text-[12.5px] text-fg-3">Fırsatlar şu an getirilemedi.</p>;
  }

  return (
    <p className="text-[12.5px] leading-[1.6] text-fg-3">
      {readOnly
        ? 'Bu müşteri için henüz fırsat açılmamış.'
        : 'Henüz fırsat yok. Bir fırsat açtığınızda Fırsatlar sayfasında görünür; takip tarihi verirseniz Takipler listesine de düşer.'}
    </p>
  );
}
