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
import { EmptyState, Pager, PillButton, PrimaryButton, RISE } from '@/components/module-kit/chrome';
import {
  CardAction,
  CardActions,
  CardHeader,
  CardMeta,
  CardTitle,
  RecordCard,
} from '@/components/module-kit/record-card';
import { FormError } from '@/components/ui/form-error';
import { Rise } from '@/components/panel/stream';
import { formatCalendarDay } from '@/lib/format/datetime';
import { FinanceTabs } from './chrome';
import { FinanceWall } from './finance-wall';
import { FinanceOverview } from './finance-overview';
import {
  Desk,
  DeskBody,
  DeskHead,
  Room,
  RoomScroll,
  RoomTop,
  DeskSkeleton,
} from '@/components/room/room';
import { monthPeriod, type Period } from '@/lib/format/period';
import { Amount, DirectionPill } from './marks';
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
function useFinanceData(offset: number, period: Period, before: Period) {
  const [state, setState] = useState<ListState>({ items: [], total: 0 });
  const [summary, setSummary] = useState<CashflowSummary | null>(null);
  const [previous, setPrevious] = useState<CashflowSummary | null>(null);
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
      /*
       * ⚠️ ARTIK DÖNEMLİ. Eskiden `{}` gönderiliyordu, yani TÜM ZAMANLAR —
       * bir duvar kahramanı olamayacak bir rakam (ADR-0038 §5: dönem +
       * değişim + eğilim). Önceki dönem yalnızca delta için çekilir.
       */
      getCashflowSummary({ from: period.from, to: period.to, includeCategories: true }),
      getCashflowSummary({ from: before.from, to: before.to }),
      listFinanceCategories({ limit: 100, offset: 0 }),
    ])
      .then(([page, totals, earlier, categoryPage]) => {
        if (!active) {
          return;
        }
        setState({ items: page.items, total: page.total });
        setSummary(totals);
        setPrevious(earlier);
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
  }, [offset, reloadToken, period, before]);

  const reload = useCallback(() => {
    setReloadToken((previous) => previous + 1);
  }, []);

  return { state, summary, previous, categories, error, loading, reload };
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
  /*
   * Dönemler bileşen ömrü boyunca SABİT: `monthPeriod()` her çağrıldığında
   * `new Date()` okur; efektin bağımlılık dizisinde her render yeni bir nesne
   * üretip sonsuz döngü kurardı. `useState` başlatıcısı bir kez çalışır.
   */
  const [period] = useState(() => monthPeriod(0));
  const [before] = useState(() => monthPeriod(1));

  const { state, summary, previous, categories, error, loading, reload } = useFinanceData(
    offset,
    period,
    before,
  );

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
    <Room>
      <RoomScroll>
        <RoomTop
          name="Finans"
          meta={`${period.label} · işlemler`}
          action={
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

        <FinanceWall period={period} summary={summary} previous={previous} loading={loading} />

        <Desk>
          <DeskHead
            title="Hareketler"
            right={
              /*
               * ⚠️ SARMALAYICI ZORUNLU. `TransactionCount` bir Fragment döndürür
               * (`<b>7</b>` + metin); doğrudan buraya konunca iki çocuk AYRI
               * flex öğesi olur ve `DeskHead`in `justify-between`i onları
               * şeridin iki ucuna dağıtır — "7" ortada asılı kalır. Tarayıcıda
               * görüldü; jsdom düzen hesaplamadığı için hiçbir test yakalamazdı.
               */
              <span className="text-[11.5px] text-fg-3">
                <TransactionCount loading={loading} failed={error !== null} total={state.total} />
              </span>
            }
          />

          <DeskBody>
            {/*
              GENEL ÖZET — Finans'a ilk girişte (PO talebi, 2026-08-17).
              Duvar tek bir anı söyler; bu iki grafik dağılımı ve yönü verir.
            */}
            <FinanceOverview summary={summary} loading={loading} />

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
          </DeskBody>
        </Desk>
      </RoomScroll>
    </Room>
  );
}

/*
 * ⚠️ `SummaryStrip` KALDIRILDI — yerini odanın DUVARI aldı (`FinanceWall`).
 *
 * Şerit, para birimi başına küçük kartlar çiziyordu ve işlem listesinin
 * üstünde ikinci bir özet katmanıydı. Oda sisteminde özetin yeri duvardır;
 * ikisini birden tutmak aynı rakamı ekranda iki kez göstermek olurdu — Panel'de
 * bir test tarafından yakalanan hatanın aynısı.
 */

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
    // ⚠️ İskelet, listenin KENDİ şeklini taşır: düz metin ekranı bir an boş
    // gösterip içerik gelince ZIPLATIRDI (ADR-0038 bulgu 5).
    return <DeskSkeleton />;
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
      <CardHeader>
        <div className="flex min-w-0 flex-wrap items-center gap-2.5">
          <CardTitle>{transaction.description ?? 'Açıklamasız kayıt'}</CardTitle>
          <DirectionPill direction={transaction.direction} />
        </div>

        {/*
          ⚠️ Bu sarmalayıcı `shrink-0` TAŞIYORDU ve `CardActions`'ın `min-w-0`
          düzeltmesini tek başına iptal ediyordu: şerit daralabilse bile onu
          saran bu kutu daralmayı reddediyordu. Finans'ın kartı bu yüzden
          diğer yedisinden farklı davranıyordu — tutar ile eylemleri birlikte
          tutan tek kart burasıdır.

          `min-w-0 flex-wrap` ile tutar ve eylem şeridi gerektiğinde birbirinden
          ayrı satırlara iner. Tutarın kendisi `shrink-0` KALIR (aşağıda
          `Amount` içinde): para bölünüp sarmaz, sarsa okunamaz.
        */}
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-2">
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
      </CardHeader>

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
