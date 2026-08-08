'use client';

import type { CreateCompanyRequest, CreateInteractionRequest } from '@business-os/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { createInteraction, deleteCompany, updateCompany } from '@/lib/api/crm';
import { errorMessage } from '@/lib/api/error-message';
import { isReadOnly, useCurrentRole } from '@/lib/session/use-current-role';
import { FormError } from '@/components/ui/form-error';
import { Rise } from '@/components/panel/stream';
import { CompanyForm } from './company-form';
import { ConfirmDelete } from './confirm-delete';
import { ContactSection } from './contact-section';
import { CrmBody, CrmHeader, Pager, RISE, SectionLabel } from './chrome';
import { CrmReindexBanner } from './crm-reindex-banner';
import { CardAction, CardActions } from './record-card';
import { InteractionComposer } from './interaction-composer';
import { InteractionStream } from './interaction-stream';
import { OpportunitySection } from './opportunity-section';
import {
  contactNameMap,
  INTERACTION_PAGE_SIZE,
  useCompanyDetail,
  type DetailFailures,
} from './use-company-detail';

/**
 * `/app/crm/[companyId]` — şirket detayı.
 *
 * ============================================================================
 * SIRALAMA: KİMLİK → KİŞİLER → GÖRÜŞMELER
 * ============================================================================
 * Görüşmeler EN ALTTA ve en geniş yeri kaplıyor; bu bilinçli. CLAUDE.md'nin
 * ürün kısıtı modülleri "AI'a bağlam ve hafıza sağlayan" şeyler olarak
 * tanımlıyor — CRM'de o hafızayı üreten tek yüzey görüşmelerdir. Şirket
 * kartındaki telefon numarası bir kayıt, görüşme notu ise kurumsal hafızadır.
 */
export function CompanyDetailScreen({ companyId }: { companyId: string }) {
  const router = useRouter();
  const readOnly = isReadOnly(useCurrentRole());

  const [interactionOffset, setInteractionOffset] = useState(0);
  const { detail, loading, fatalError, failures, reload } = useCompanyDetail(
    companyId,
    interactionOffset,
  );

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [logging, setLogging] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);

  async function save(body: CreateCompanyRequest): Promise<void> {
    setSaving(true);
    setFormError(null);
    try {
      await updateCompany(companyId, body);
      setEditing(false);
      reload();
    } catch (caught) {
      setFormError(
        errorMessage(caught, undefined, {
          403: 'Bu işlem için yetkiniz yok. Müşteri kayıtlarını yalnızca sahip, yönetici veya üye değiştirebilir.',
        }),
      );
    } finally {
      setSaving(false);
    }
  }

  async function remove(): Promise<void> {
    setDeleting(true);
    setActionError(null);
    try {
      await deleteCompany(companyId);
      // Kayıt artık YOK: bu sayfada kalmak 404 gösterirdi. Listeye dönülür ve
      // `replace` kullanılır — geri tuşu silinmiş bir sayfaya götürmemeli.
      router.replace('/app/crm');
    } catch (caught) {
      setActionError(
        errorMessage(caught, undefined, {
          403: 'Silme yetkiniz yok. Müşteri silmeyi yalnızca sahip veya yönetici yapabilir.',
        }),
      );
      setDeleting(false);
    }
  }

  async function log(body: CreateInteractionRequest): Promise<void> {
    setLogging(true);
    setLogError(null);
    try {
      const result = await createInteraction(body);

      // `chunkCount === 0`: görüşme KAYDEDİLDİ ama indekslenemedi, yani AI onu
      // bulamaz. Sessiz kalmak, kullanıcının sorusuna cevap alamayıp nedenini
      // anlayamaması demekti. Onarım yolu banner'da.
      if (result.chunkCount === 0) {
        setLogError(
          'Görüşme kaydedildi ama yapay zekâ henüz okuyamadı — sorularınızı cevaplarken bu görüşmeyi kullanamaz. Yukarıdaki düğmeyle okunur hale getirebilirsiniz.',
        );
      }

      // Yeni görüşme en üstte; kullanıcı başka sayfadaysa ilk sayfaya döner.
      if (interactionOffset > 0) {
        setInteractionOffset(0);
      } else {
        reload();
      }
    } catch (caught) {
      setLogError(
        errorMessage(caught, undefined, {
          403: 'Görüşme kaydetme yetkiniz yok. Bunu yalnızca sahip, yönetici veya üye yapabilir.',
        }),
      );
    } finally {
      setLogging(false);
    }
  }

  if (fatalError !== null) {
    return <FatalState message={fatalError} />;
  }

  const { company } = detail;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CrmHeader
        title={company?.name ?? 'Müşteri'}
        subtitle={<Subtitle company={company} loading={loading} />}
        right={
          readOnly || company === null ? null : (
            <CardActions>
              <CardAction
                ariaLabel={`${company.name} müşterisini düzenle`}
                onClick={() => {
                  setEditing(true);
                }}
              >
                Düzenle
              </CardAction>
              <ConfirmDelete
                pending={deleting}
                ariaLabel={`${company.name} müşterisini sil`}
                question={`"${company.name}" ve ona bağlı tüm yetkililer ile görüşmeler kalıcı olarak silinecek. Görüşmeler yapay zekânın hafızasından da çıkar.`}
                onConfirm={() => {
                  void remove();
                }}
              />
            </CardActions>
          )
        }
      />

      <CrmBody>
        <BackLink />

        <FormError message={actionError} />

        {editing && company !== null ? (
          <CompanyForm
            initial={company}
            pending={saving}
            error={formError}
            onSubmit={(body) => {
              void save(body);
            }}
            onCancel={() => {
              setEditing(false);
              setFormError(null);
            }}
          />
        ) : null}

        <PartialNotice failures={failures} onRetry={reload} />

        <Rise delay={RISE.body}>
          <ContactSection
            companyId={companyId}
            contacts={detail.contacts}
            total={detail.contactTotal}
            loading={loading}
            failed={failures.contacts}
            readOnly={readOnly}
            onChanged={reload}
          />

          <OpportunitySection
            companyId={companyId}
            opportunities={detail.opportunities}
            contacts={detail.contacts}
            total={detail.opportunityTotal}
            loading={loading}
            failed={failures.opportunities}
            readOnly={readOnly}
            onChanged={reload}
          />

          <section className="mt-10">
            <div className="mb-3">
              <SectionLabel>
                Görüşmeler{failures.interactions ? '' : ` · ${String(detail.interactionTotal)}`}
              </SectionLabel>
            </div>

            <CrmReindexBanner readOnly={readOnly} onRepaired={reload} />

            {readOnly ? null : (
              <div className="mb-7">
                <InteractionComposer
                  companyId={companyId}
                  contacts={detail.contacts}
                  pending={logging}
                  error={logError}
                  onSubmit={(body) => {
                    void log(body);
                  }}
                />
              </div>
            )}

            {detail.interactions.length === 0 ? (
              <EmptyInteractions
                loading={loading}
                failed={failures.interactions}
                readOnly={readOnly}
              />
            ) : (
              <InteractionStream
                items={detail.interactions}
                contactNames={contactNameMap(detail.contacts)}
              />
            )}

            <Pager
              offset={interactionOffset}
              count={detail.interactions.length}
              total={detail.interactionTotal}
              loading={loading}
              onPrevious={() => {
                setInteractionOffset((previous) => Math.max(0, previous - INTERACTION_PAGE_SIZE));
              }}
              onNext={() => {
                setInteractionOffset((previous) => previous + INTERACTION_PAGE_SIZE);
              }}
            />
          </section>
        </Rise>
      </CrmBody>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/app/crm"
      className="mb-5 inline-flex items-center gap-1.5 font-mono text-[9.5px] font-medium tracking-[0.09em] text-fg-3 uppercase transition-colors duration-150 hover:text-ink"
    >
      <span aria-hidden>←</span> Müşteriler
    </Link>
  );
}

function Subtitle({
  company,
  loading,
}: {
  company: { industry: string | null; email: string | null; phone: string | null } | null;
  loading: boolean;
}) {
  if (company === null) {
    return <>{loading ? 'Yükleniyor…' : ''}</>;
  }

  const parts = [company.industry, company.email, company.phone].filter(
    (part): part is string => part !== null && part !== '',
  );

  return <>{parts.length === 0 ? 'Müşteri kaydı' : parts.join(' · ')}</>;
}

/**
 * Tamamlayıcı verinin düştüğünü söyler — SAKİN ama GÖRÜNÜR.
 *
 * `panel-screen.tsx › PartialLoadNotice` ile aynı bileşen deseni ve aynı
 * gerekçe: kırmızı bir hata bloğu, çalışmaya devam eden bir ekranı çökmüş gibi
 * gösterirdi; sessiz kalmak ise var olan veriyi kaybolmuş gibi gösterirdi.
 */
function PartialNotice({ failures, onRetry }: { failures: DetailFailures; onRetry: () => void }) {
  const missing = [
    failures.contacts ? 'yetkililer' : null,
    failures.opportunities ? 'fırsatlar' : null,
    failures.interactions ? 'görüşmeler' : null,
  ].filter((part): part is string => part !== null);

  if (missing.length === 0) {
    return null;
  }

  return (
    <section
      role="status"
      className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-border bg-fill px-4 py-3"
    >
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-fg-3" />
      <p className="min-w-0 flex-1 text-[12.5px] text-fg-2">
        Bazı bilgiler yüklenemedi — {missing.join(' ve ')} şu an görüntülenemiyor.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="shrink-0 rounded-full bg-tint px-3 py-1.5 text-[12px] font-medium text-fg transition-colors duration-150 hover:bg-tint-2"
      >
        Yeniden dene
      </button>
    </section>
  );
}

function EmptyInteractions({
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
    return null;
  }

  return (
    <p className="text-[12.5px] leading-[1.6] text-fg-3">
      {readOnly
        ? 'Bu müşteriyle henüz görüşme kaydedilmemiş.'
        : 'Henüz görüşme yok. İlk notu yukarıdan yazın — kaydedilen her görüşme kurumsal hafızaya girer.'}
    </p>
  );
}

/** Şirket hiç yüklenemedi: gösterilecek bir sayfa yok, çıkış yolu verilir. */
function FatalState({ message }: { message: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CrmHeader title="Müşteri" subtitle="Kayıt açılamadı" />
      <CrmBody>
        <FormError message={message} />
        <div className="mt-4">
          <BackLink />
        </div>
      </CrmBody>
    </div>
  );
}
