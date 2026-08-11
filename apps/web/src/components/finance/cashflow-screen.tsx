'use client';

import type { CashflowSummary, FinanceCommentary } from '@business-os/contracts';
import { useCallback, useEffect, useState } from 'react';

import {
  countUnindexedCommentaries,
  createFinanceCommentary,
  getCashflowSummary,
  listFinanceCommentaries,
  reindexCommentaries,
} from '@/lib/api/finance';
import { errorMessage } from '@/lib/api/error-message';
import {
  EmptyState,
  ModuleBody,
  ModuleHeader,
  PillButton,
  PrimaryButton,
  RISE,
  SectionLabel,
} from '@/components/module-kit/chrome';
import { RecordCard } from '@/components/module-kit/record-card';
import { TextAreaField } from '@/components/module-kit/form-kit';
import { FormError } from '@/components/ui/form-error';
import { Rise } from '@/components/panel/stream';
import { formatCalendarDay } from '@/lib/format/datetime';
import { FinanceTabs } from './chrome';
import { Amount, NetAmount } from './marks';

const COMMENTARY_PAGE = 10;

const FORBIDDEN = 'Nakit akışını yalnızca şirket sahibi veya yönetici görebilir.';

/**
 * `/app/finance/cashflow` — nakit akışı + finansal yorumlar.
 *
 * ============================================================================
 * BU EKRAN İKİ FARKLI ŞEYİ YAN YANA KOYAR — VE AYRIMI KORUR
 * ============================================================================
 * Üstte RAKAMLAR (türetilmiş, deterministik), altta YORUMLAR (anlatısal, yapay
 * zekânın okuduğu tek Finans yüzeyi). İkisi ayrı bölümdür çünkü ayrı şeylerdir:
 * rakam "ne oldu", yorum "neden oldu" der.
 *
 * ⚠️ AI'IN SESİ BU EKRANDA GÖRÜNMEZ. Yorumlar KULLANICININ yazdığı metindir,
 * asistanın ürettiği değil — dolayısıyla terracotta (`--ai-accent`) burada
 * kullanılmaz ve kullanılmamalıdır. Modül içi bir AI yüzeyi (dönem özeti) v1'de
 * YOK (ADR-0034 §10); eklendiği gün o yüzey `--ai-accent` taşımak ZORUNDADIR.
 */
export function CashflowScreen() {
  const [summary, setSummary] = useState<CashflowSummary | null>(null);
  const [commentaries, setCommentaries] = useState<readonly FinanceCommentary[]>([]);
  const [unindexed, setUnindexed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [repairing, setRepairing] = useState(false);

  const reload = useCallback(() => {
    setReloadToken((previous) => previous + 1);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);

    Promise.all([
      // ⚠️ Kırılım İSTENİYOR: bu ekranın asıl işi "en çok nereye harcıyoruz"
      // sorusunu cevaplamak. İşlem listesinde istenmiyor — orada ikinci bir
      // sorgu bedeli boşuna olurdu.
      getCashflowSummary({ includeCategories: true }),
      listFinanceCommentaries({ limit: COMMENTARY_PAGE, offset: 0 }),
      countUnindexedCommentaries(),
    ])
      .then(([totals, page, pending]) => {
        if (!active) {
          return;
        }
        setSummary(totals);
        setCommentaries(page.items);
        setUnindexed(pending.count);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (active) {
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
  }, [reloadToken]);

  async function save(): Promise<void> {
    const text = body.trim();
    if (text === '') {
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const result = await createFinanceCommentary({ body: text });
      setBody('');
      reload();

      // ⚠️ `chunkCount: 0` SESSİZ bir hatadır: yorum kaydedildi ama ARANABİLİR
      // DEĞİL. Kullanıcı bunu bilmezse yapay zekâya sorduğunda "neden bilmiyor"
      // diye düşünür. Onarım banner'ı zaten bir sonraki yüklemede görünecek,
      // ama burada da açıkça söylenir.
      if (result.chunkCount === 0) {
        setFormError(
          'Yorum kaydedildi ancak arama için indekslenemedi. Aşağıdaki onarım düğmesiyle düzeltebilirsiniz.',
        );
      }
    } catch (caught) {
      setFormError(errorMessage(caught, undefined, { 403: FORBIDDEN }));
    } finally {
      setSaving(false);
    }
  }

  async function repair(): Promise<void> {
    setRepairing(true);
    try {
      await reindexCommentaries();
      reload();
    } catch (caught) {
      setFormError(errorMessage(caught));
    } finally {
      setRepairing(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ModuleHeader
        title="Nakit akışı"
        subtitle="Rakamlar işlemlerden türetilir · yorumlar sizin yazdıklarınızdır"
        right={<FinanceTabs />}
      />

      <ModuleBody>
        <FormError message={error} />

        <Rise delay={RISE.action}>
          <section className="mb-8 flex flex-col gap-3">
            <SectionLabel>Dönem toplamı</SectionLabel>
            {loading ? (
              <p className="text-[12.5px] text-fg-3">Yükleniyor…</p>
            ) : (
              <CurrencyTotals summary={summary} />
            )}
          </section>
        </Rise>

        <Rise delay={RISE.body}>
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <SectionLabel>Finansal yorumlar</SectionLabel>
              {unindexed > 0 ? (
                <PillButton
                  disabled={repairing}
                  onClick={() => {
                    void repair();
                  }}
                >
                  {repairing ? 'Onarılıyor…' : `${String(unindexed)} yorum indekslenmemiş — onar`}
                </PillButton>
              ) : null}
            </div>

            <div className="rounded-card border border-border bg-raised p-5 shadow-card">
              <TextAreaField
                id="commentary-body"
                label="Bu dönem ne oldu?"
                value={body}
                onChange={setBody}
                rows={3}
                disabled={saving}
                placeholder="Mart'ta nakit sıkıştı çünkü X müşterisi ödemeyi geciktirdi."
                hint="⚠️ Yapay zekânın okuduğu TEK finans yüzeyi burasıdır. İşlem açıklamaları gömülmez — rakamlar zaten tabloda, buraya NEDENİ yazılır."
              />
              <FormError message={formError} />
              <div className="mt-4 flex justify-end">
                <PrimaryButton
                  disabled={saving || body.trim() === ''}
                  onClick={() => {
                    void save();
                  }}
                >
                  {saving ? 'Kaydediliyor…' : 'Yorumu kaydet'}
                </PrimaryButton>
              </div>
            </div>

            {commentaries.length === 0 ? (
              loading ? null : (
                <EmptyState
                  title="Henüz yorum yok"
                  hint="Rakamlar bir dönemin ne olduğunu söyler, nedenini söylemez. Buraya yazdığınız her cümleyi yapay zekâ okur ve sorularınızda kullanır."
                />
              )
            ) : (
              <ul className="flex flex-col gap-2.5">
                {commentaries.map((commentary) => (
                  <li key={commentary.id}>
                    <RecordCard>
                      <span className="font-mono text-[9.5px] font-medium tracking-[0.09em] text-fg-3 uppercase tabular">
                        {formatCalendarDay(commentary.occurredOn)}
                      </span>
                      <p className="text-[13px] leading-[1.65] text-fg-2">{commentary.body}</p>
                    </RecordCard>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </Rise>
      </ModuleBody>
    </div>
  );
}

/**
 * Para birimi başına toplam + kategori kırılımı.
 *
 * ⚠️ TOPLANMAZ. Her para birimi kendi kartını alır ve aralarında hiçbir
 * aritmetik yapılmaz (ADR-0034 §5.1).
 *
 * ⚠️ KATEGORİSİZ satır GÖRÜNÜR ve "Kategorisiz" diye yazılır — elenirse
 * kırılım toplamı para birimi toplamını TUTMAZ ve fark sessiz olurdu (§3d).
 */
function CurrencyTotals({ summary }: { summary: CashflowSummary | null }) {
  if (summary === null || summary.currencies.length === 0) {
    return (
      <EmptyState
        title="Henüz hareket yok"
        hint="Gelir ve gider kaydı girdikçe dönem toplamı burada para birimi bazında görünür. Farklı para birimleri BİRLEŞTİRİLMEZ — kur çevrimi bilinçli olarak kapsam dışıdır."
      />
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {summary.currencies.map((row) => (
        <div
          key={row.currency}
          className="rounded-card border border-border bg-surface px-5 py-4 shadow-card"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
            <span className="font-mono text-[10px] font-semibold tracking-[0.14em] text-fg-2 uppercase">
              {row.currency}
            </span>
            <NetAmount value={row.net} currency={row.currency} />
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-fg-3 tabular">
            <span>gelir {row.income}</span>
            <span aria-hidden>·</span>
            <span>gider {row.expense}</span>
          </div>

          {row.categories === null || row.categories.length === 0 ? null : (
            <ul className="mt-3.5 flex flex-col gap-1.5 border-t border-border pt-3">
              {row.categories.map((category) => (
                <li
                  key={`${category.direction}-${category.categoryId ?? 'none'}`}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="min-w-0 truncate text-[12.5px] text-fg-2">
                    {category.categoryName ?? 'Kategorisiz'}
                  </span>
                  <Amount value={category.total} currency="" direction={category.direction} />
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
