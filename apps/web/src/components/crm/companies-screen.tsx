'use client';

import type { CompanyListRow, CreateCompanyRequest } from '@business-os/contracts';
import { useCallback, useEffect, useState } from 'react';

import { createCompany, deleteCompany, listCompanies, updateCompany } from '@/lib/api/crm';
import { errorMessage } from '@/lib/api/error-message';
import { isReadOnly, useCurrentRole } from '@/lib/session/use-current-role';
import { FormError } from '@/components/ui/form-error';
import { Rise } from '@/components/panel/stream';
import { CompanyForm } from './company-form';
import { ConfirmDelete } from './confirm-delete';
import {
  CrmBody,
  CrmHeader,
  CrmTabs,
  EmptyState,
  Pager,
  PillButton,
  PrimaryButton,
  RISE,
} from './chrome';
import { CardAction, CardActions, CardMeta, CardTitleLink, RecordCard } from './record-card';
import { CountMark, LastContactMark } from './signals';

export const PAGE_SIZE = 20;

/**
 * `403` için ORTAK metin.
 *
 * Backend'in RFC 7807 gövdesi güvenlik-uniform ve teknik konuşur
 * ("company:write yetkisi yok"). Kullanıcının bilmesi gereken şey izin adı
 * değil, NE YAPAMAYACAĞI ve kime söyleyeceğidir.
 */
const FORBIDDEN =
  'Bu işlem için yetkiniz yok. Müşteri kayıtlarını yalnızca sahip, yönetici veya üye değiştirebilir.';

interface ListState {
  readonly items: readonly CompanyListRow[];
  readonly total: number;
}

/** Liste çekme — görünümden ayrı (`knowledge-screen.tsx › useNoteList` deseni). */
function useCompanyList(offset: number) {
  const [state, setState] = useState<ListState>({ items: [], total: 0 });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);

    listCompanies({ limit: PAGE_SIZE, offset })
      .then((page) => {
        if (!active) {
          return;
        }
        setState({ items: page.items, total: page.total });
        setError(null);
      })
      .catch((caught: unknown) => {
        if (active) {
          // Hata GÖRÜNÜR olur ve liste TEMİZLENMEZ: "0 şirket" bir ölçüm
          // değil, ölçememenin sonucudur (Panel'in `PartialLoadNotice`
          // gerekçesiyle aynı).
          setError(errorMessage(caught));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [offset, reloadToken]);

  const reload = useCallback(() => {
    setReloadToken((previous) => previous + 1);
  }, []);

  return { state, error, loading, reload };
}

/** Açık olan form: yok · yeni · düzenlenen şirket. */
type FormTarget = { kind: 'none' } | { kind: 'new' } | { kind: 'edit'; company: CompanyListRow };

/**
 * `/app/crm` — şirketler.
 *
 * CRM'in giriş kapısı ve projenin ilk TAM yaşam döngülü ekranı: oluştur, oku,
 * düzenle, sil. Panel'le aynı iskelet (başlık şeridi → kaydırılan gövde) ve
 * aynı hareket kademeleri kullanılır.
 */
export function CompaniesScreen() {
  const readOnly = isReadOnly(useCurrentRole());
  const [offset, setOffset] = useState(0);
  const { state, error, loading, reload } = useCompanyList(offset);

  const [form, setForm] = useState<FormTarget>({ kind: 'none' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function closeForm(): void {
    setForm({ kind: 'none' });
    setFormError(null);
  }

  async function save(body: CreateCompanyRequest): Promise<void> {
    setSaving(true);
    setFormError(null);
    try {
      if (form.kind === 'edit') {
        await updateCompany(form.company.id, body);
      } else {
        await createCompany(body);
      }
      closeForm();
      reload();
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
      await deleteCompany(id);

      // Sayfanın son kaydı silindiyse bir sayfa geri gidilir; aksi halde
      // kullanıcı BOŞ bir sayfada kalır ve listesi silinmiş sanır.
      if (state.items.length === 1 && offset > 0) {
        setOffset((previous) => Math.max(0, previous - PAGE_SIZE));
      } else {
        reload();
      }
    } catch (caught) {
      setActionError(
        errorMessage(caught, undefined, {
          403: 'Silme yetkiniz yok. Müşteri silmeyi yalnızca sahip veya yönetici yapabilir.',
        }),
      );
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <CrmHeader
        title="Müşteriler"
        subtitle={<CompanyCount loading={loading} failed={error !== null} total={state.total} />}
        right={
          // Sekmeler ile birincil eylem AYNI slotta: ikisi de "sağ taraf"tır ve
          // ayrı bir satır açmak başlık şeridini iki kat yükseltirdi. Dar
          // ekranda `flex-wrap` ile alt alta düşerler.
          <div className="flex flex-wrap items-center gap-2.5">
            <CrmTabs />
            {readOnly || form.kind !== 'none' ? null : (
              <PrimaryButton
                onClick={() => {
                  setForm({ kind: 'new' });
                }}
              >
                Yeni müşteri
              </PrimaryButton>
            )}
          </div>
        }
      />

      <CrmBody>
        {form.kind === 'none' ? null : (
          <CompanyForm
            {...(form.kind === 'edit' ? { initial: form.company } : {})}
            pending={saving}
            error={formError}
            onSubmit={(body) => {
              void save(body);
            }}
            onCancel={closeForm}
          />
        )}

        <div className="flex flex-col gap-3">
          <FormError message={error} />
          <FormError message={actionError} />
        </div>

        <Rise delay={RISE.body}>
          {state.items.length === 0 ? (
            <EmptyContent
              loading={loading}
              failed={error !== null}
              readOnly={readOnly}
              onCreate={() => {
                setForm({ kind: 'new' });
              }}
            />
          ) : (
            <ul className="flex flex-col gap-2.5">
              {state.items.map((company) => (
                <li key={company.id}>
                  <CompanyCard
                    company={company}
                    readOnly={readOnly}
                    deleting={deletingId === company.id}
                    onEdit={() => {
                      setForm({ kind: 'edit', company });
                    }}
                    onDelete={() => {
                      void remove(company.id);
                    }}
                  />
                </li>
              ))}
            </ul>
          )}
        </Rise>

        <Pager
          offset={offset}
          count={state.items.length}
          total={state.total}
          loading={loading}
          onPrevious={() => {
            setOffset((previous) => Math.max(0, previous - PAGE_SIZE));
          }}
          onNext={() => {
            setOffset((previous) => previous + PAGE_SIZE);
          }}
        />
      </CrmBody>
    </div>
  );
}

/**
 * Başlık altındaki sayaç.
 *
 * Liste ÇEKİLEMEDİYSE sayı çizilmez — Panel'in kuralı: "0 şirket" bir ölçüm
 * değil, ölçememenin sonucudur ve kullanıcıya var olan verisini kaybetmiş
 * gibi hissettirir.
 */
function CompanyCount({
  loading,
  failed,
  total,
}: {
  loading: boolean;
  failed: boolean;
  total: number;
}) {
  if (failed) {
    return <>Müşteri listeniz şu an açılamıyor</>;
  }
  if (loading) {
    return <>Müşterileriniz</>;
  }

  return (
    <>
      <b className="font-semibold text-fg tabular">{total}</b> müşteri · görüşmeleriniz burada
      birikir
    </>
  );
}

/**
 * Boş durum — YÖNLENDİRİCİ, sadece "kayıt yok" demiyor.
 *
 * Eylem düğmesi boş durumun İÇİNDE de duruyor (başlıkta zaten var): boş bir
 * ekranda kullanıcının gözü ortadadır, sağ üst köşede değil. `viewer` için
 * düğme çizilmez — yapamayacağı bir işi önermek olurdu.
 */
function EmptyContent({
  loading,
  failed,
  readOnly,
  onCreate,
}: {
  loading: boolean;
  failed: boolean;
  readOnly: boolean;
  onCreate: () => void;
}) {
  if (loading) {
    return <p className="text-[12.5px] text-fg-3">Yükleniyor…</p>;
  }
  if (failed) {
    // Hata zaten yukarıda `FormError` ile yazıldı; burada İKİNCİ bir iddia
    // ("henüz müşteri yok") ortaya atılmaz.
    return null;
  }

  return (
    <EmptyState
      title="Henüz müşteri yok"
      hint={
        readOnly
          ? 'Ekibinizden biri müşteri eklediğinde burada görünecek.'
          : 'İlk müşterinizi ekleyin. Yetkililerini ve görüşmelerinizi ona bağlarsınız; kaydettiğiniz her görüşmeyi yapay zekâ okur ve sorularınızda kullanır.'
      }
      {...(readOnly
        ? {}
        : { action: <PillButton onClick={onCreate}>İlk müşteriyi ekle</PillButton> })}
    />
  );
}

function CompanyCard({
  company,
  readOnly,
  deleting,
  onEdit,
  onDelete,
}: {
  company: CompanyListRow;
  readOnly: boolean;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <RecordCard>
      <div className="flex items-start justify-between gap-3">
        <CardTitleLink href={`/app/crm/${company.id}`}>{company.name}</CardTitleLink>

        {readOnly ? null : (
          <CardActions>
            <CardAction onClick={onEdit} ariaLabel={`${company.name} müşterisini düzenle`}>
              Düzenle
            </CardAction>
            <ConfirmDelete
              pending={deleting}
              ariaLabel={`${company.name} müşterisini sil`}
              question={`"${company.name}" ve ona bağlı tüm yetkililer ile görüşmeler kalıcı olarak silinecek. Görüşmeler yapay zekânın hafızasından da çıkar.`}
              onConfirm={onDelete}
            />
          </CardActions>
        )}
      </div>

      <CardMeta items={[company.industry, company.email, company.phone, company.website]} />

      {/*
        KARTIN GENİŞLİĞİNİ HAK EDEN SATIR.
        Üçü de bedava sinyal — hiçbiri AI çağırmaz, hepsi var olan veriden
        türer. Tek satırda toplanmaları bilinçli: alt alta üç ayrı satır kartı
        uzatır ama okumayı zorlaştırırdı; bunlar aynı sorunun ("bu müşteriyle
        aram nasıl") üç parçası.
      */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <CountMark count={company.contactCount} singular="yetkili" />
        <CountMark count={company.openOpportunityCount} singular="açık fırsat" />
        <LastContactMark day={company.lastInteractionOn} />
      </div>
    </RecordCard>
  );
}
