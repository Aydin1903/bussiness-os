'use client';

import type {
  CashflowSummary,
  CreateFinanceTransactionRequest,
  FinanceCategory,
  FinanceTransactionRow,
} from '@business-os/contracts';
import { useCallback, useEffect, useState } from 'react';

import {
  createFinanceTransaction,
  deleteFinanceTransaction,
  getCashflowSummary,
  listFinanceCategories,
  listFinanceTransactions,
  updateFinanceTransaction,
} from '@/lib/api/finance';
import { errorMessage } from '@/lib/api/error-message';
import { ConfirmDelete } from '@/components/module-kit/confirm-delete';
import {
  EmptyState,
  ModuleBody,
  ModuleHeader,
  Pager,
  PillButton,
  PrimaryButton,
  RISE,
} from '@/components/module-kit/chrome';
import {
  CardAction,
  CardActions,
  CardMeta,
  CardTitle,
  RecordCard,
} from '@/components/module-kit/record-card';
import { FormError } from '@/components/ui/form-error';
import { Rise } from '@/components/panel/stream';
import { formatCalendarDay } from '@/lib/format/datetime';
import { FinanceTabs } from './chrome';
import { Amount, DirectionPill, NetAmount } from './marks';
import { TransactionForm } from './transaction-form';

export const PAGE_SIZE = 20;

/**
 * `403` için ORTAK metin — izin adı değil, NE YAPILAMAYACAĞI söylenir.
 *
 * ⚠️ Finans'ta bu metin diğer modüllerden DAHA SIK görünür: `member` ve
 * `viewer` bu modülü HİÇ göremez (ADR-0034 §7), yani bir üyeyi bu ekrana
 * getiren her yol 403 ile biter.
 */
const FORBIDDEN = 'Finans kayıtlarını yalnızca şirket sahibi veya yönetici görebilir.';

interface ListState {
  readonly items: readonly FinanceTransactionRow[];
  readonly total: number;
}

/** Liste + özet + kategoriler — TEK yükleme turu (`useProjectList` deseni). */
function useFinanceData(offset: number) {
  const [state, setState] = useState<ListState>({ items: [], total: 0 });
  const [summary, setSummary] = useState<CashflowSummary | null>(null);
  const [categories, setCategories] = useState<readonly FinanceCategory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);

    // Üçü PARALEL: biri diğerini beklemek zorunda değil ve seri çağrı ekranı
    // üç tur geciktirirdi.
    Promise.all([
      listFinanceTransactions({ limit: PAGE_SIZE, offset }),
      getCashflowSummary({}),
      listFinanceCategories({ limit: 100, offset: 0 }),
    ])
      .then(([page, totals, categoryPage]) => {
        if (!active) {
          return;
        }
        setState({ items: page.items, total: page.total });
        setSummary(totals);
        setCategories(categoryPage.items);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (active) {
          // Hata GÖRÜNÜR olur ve liste TEMİZLENMEZ: "0 kayıt" bir ölçüm değil,
          // ölçememenin sonucudur.
          setError(errorMessage(caught, undefined, { 403: FORBIDDEN }));
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

  return { state, summary, categories, error, loading, reload };
}

type FormTarget =
  { kind: 'none' } | { kind: 'new' } | { kind: 'edit'; transaction: FinanceTransactionRow };

/**
 * `/app/finance` — gelir/gider kayıtları + özet şeridi.
 *
 * `ProjectsScreen` ile birebir aynı iskelet ve aynı hareket kademeleri. Yeni
 * tasarım YOKTUR; bu ekranın varlığı, modül kitinin ÜÇÜNCÜ modülde de genel
 * olduğunun kanıtıdır.
 */
export function TransactionsScreen() {
  const [offset, setOffset] = useState(0);
  const { state, summary, categories, error, loading, reload } = useFinanceData(offset);

  const [form, setForm] = useState<FormTarget>({ kind: 'none' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function closeForm(): void {
    setForm({ kind: 'none' });
    setFormError(null);
  }

  async function save(body: CreateFinanceTransactionRequest): Promise<void> {
    setSaving(true);
    setFormError(null);
    try {
      if (form.kind === 'edit') {
        await updateFinanceTransaction(form.transaction.id, body);
      } else {
        await createFinanceTransaction(body);
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
      await deleteFinanceTransaction(id);

      // Sayfanın son kaydı silindiyse bir sayfa geri gidilir; aksi halde
      // kullanıcı BOŞ bir sayfada kalır ve listesi silinmiş sanar.
      if (state.items.length === 1 && offset > 0) {
        setOffset((previous) => Math.max(0, previous - PAGE_SIZE));
      } else {
        reload();
      }
    } catch (caught) {
      setActionError(errorMessage(caught, undefined, { 403: FORBIDDEN }));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ModuleHeader
        title="Finans"
        subtitle={
          <TransactionCount loading={loading} failed={error !== null} total={state.total} />
        }
        right={
          <div className="flex flex-wrap items-center gap-2.5">
            <FinanceTabs />
            {form.kind === 'none' ? (
              <PrimaryButton
                onClick={() => {
                  setForm({ kind: 'new' });
                }}
              >
                Yeni kayıt
              </PrimaryButton>
            ) : null}
          </div>
        }
      />

      <ModuleBody>
        {form.kind === 'none' ? null : (
          <TransactionForm
            {...(form.kind === 'edit' ? { initial: form.transaction } : {})}
            categories={categories}
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

        {summary === null ? null : <SummaryStrip summary={summary} />}

        <Rise delay={RISE.body}>
          {state.items.length === 0 ? (
            <EmptyContent
              loading={loading}
              failed={error !== null}
              onCreate={() => {
                setForm({ kind: 'new' });
              }}
            />
          ) : (
            <ul className="flex flex-col gap-2.5">
              {state.items.map((transaction) => (
                <li key={transaction.id}>
                  <TransactionCard
                    transaction={transaction}
                    deleting={deletingId === transaction.id}
                    onEdit={() => {
                      setForm({ kind: 'edit', transaction });
                    }}
                    onDelete={() => {
                      void remove(transaction.id);
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
      </ModuleBody>
    </div>
  );
}

/**
 * Özet şeridi — PARA BİRİMİ BAŞINA bir kart.
 *
 * ⚠️ KARTLAR TOPLANMAZ. Tek bir "net" rakamı çizmek, sunucunun bilinçli olarak
 * vermediği yanlışı istemcide üretmek olurdu (ADR-0034 §5.1): 2000 TRY ile
 * 2000 USD'yi toplayan bir sayı, kullanıcının GÖREMEYECEĞİ bir yanlıştır.
 *
 * Hiç hareket yoksa şerit HİÇ ÇİZİLMEZ — "0,00 TRY" uydurmak, hangi para
 * biriminde sıfır olduğunu bilmediğimiz hâlde bir iddia ortaya atmaktı.
 */
function SummaryStrip({ summary }: { summary: CashflowSummary }) {
  if (summary.currencies.length === 0) {
    return null;
  }

  return (
    <Rise delay={RISE.action}>
      <div className="mb-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {summary.currencies.map((row) => (
          <div
            key={row.currency}
            className="rounded-card border border-border bg-surface px-4 py-3.5 shadow-card"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-mono text-[9.5px] font-semibold tracking-[0.14em] text-fg-3 uppercase">
                {row.currency} · net
              </span>
              <NetAmount value={row.net} currency="" />
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-fg-3 tabular">
              <span>gelir {row.income}</span>
              <span aria-hidden>·</span>
              <span>gider {row.expense}</span>
            </div>
          </div>
        ))}
      </div>
    </Rise>
  );
}

/** Liste ÇEKİLEMEDİYSE sayı çizilmez — "0 kayıt" bir ölçüm değildir. */
function TransactionCount({
  loading,
  failed,
  total,
}: {
  loading: boolean;
  failed: boolean;
  total: number;
}) {
  if (failed) {
    return <>Finans kayıtlarınız şu an açılamıyor</>;
  }
  if (loading) {
    return <>Gelir ve giderleriniz</>;
  }

  return (
    <>
      <b className="font-semibold text-fg tabular">{total}</b> kayıt · paranın nereden gelip nereye
      gittiği
    </>
  );
}

function EmptyContent({
  loading,
  failed,
  onCreate,
}: {
  loading: boolean;
  failed: boolean;
  onCreate: () => void;
}) {
  if (loading) {
    return <p className="text-[12.5px] text-fg-3">Yükleniyor…</p>;
  }
  if (failed) {
    // Hata zaten yukarıda yazıldı; burada İKİNCİ bir iddia ortaya atılmaz.
    return null;
  }

  return (
    <EmptyState
      title="Henüz kayıt yok"
      hint="İlk gelir ya da gider kaydınızı girin. Nakit akışı özeti bu kayıtlardan türetilir; yapay zekâya sorduğunuzda da aynı rakamları kullanır."
      action={<PillButton onClick={onCreate}>İlk kaydı gir</PillButton>}
    />
  );
}

function TransactionCard({
  transaction,
  deleting,
  onEdit,
  onDelete,
}: {
  transaction: FinanceTransactionRow;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <RecordCard>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <CardTitle>{transaction.description ?? 'Açıklamasız kayıt'}</CardTitle>
          <DirectionPill direction={transaction.direction} />
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <Amount
            value={transaction.amount}
            currency={transaction.currency}
            direction={transaction.direction}
          />
          <CardActions>
            <CardAction onClick={onEdit} ariaLabel="Kaydı düzenle">
              Düzenle
            </CardAction>
            <ConfirmDelete
              pending={deleting}
              ariaLabel="Kaydı sil"
              question={`${transaction.amount} ${transaction.currency} tutarındaki kayıt kalıcı olarak silinecek. ⚠️ Bu işlemin denetim izi YOKTUR — silindiği bilgisi hiçbir yerde kalmaz.`}
              onConfirm={onDelete}
            />
          </CardActions>
        </div>
      </div>

      {/*
        Kategori/şirket/proje adları `null` olabilir ve `null` ÜÇ anlama gelir:
        bağlı değil, hedef silinmiş, ya da ilgili izin yok. Üçü de aynı şekilde
        çizilir (hiç çizilmez) ve bu KASITLIDIR — ayırmak bir kaydın var
        olduğunu sızdırırdı (ADR-0034 §4.2).
      */}
      <CardMeta
        items={[transaction.categoryName, transaction.companyName, transaction.projectName]}
      />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="font-mono text-[9.5px] font-medium tracking-[0.09em] text-fg-3 uppercase tabular">
          {formatCalendarDay(transaction.occurredOn)}
        </span>
      </div>
    </RecordCard>
  );
}
