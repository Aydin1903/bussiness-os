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
import { EmptyState, PillButton, PrimaryButton } from '@/components/module-kit/chrome';
import { RecordCard } from '@/components/module-kit/record-card';
import { TextAreaField } from '@/components/module-kit/form-kit';
import { FormError } from '@/components/ui/form-error';
import { Rise } from '@/components/panel/stream';
import {
  Desk,
  DeskBody,
  DeskHead,
  Room,
  ROOM_RISE,
  RoomScroll,
  RoomTop,
} from '@/components/room/room';
import { FinanceWall } from './finance-wall';
import { formatCalendarDay } from '@/lib/format/datetime';
import { monthPeriod } from '@/lib/format/period';
import { CategoryBars } from './category-bars';
import { FinanceTabs } from './chrome';
import { NetAmount } from './marks';

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
  /*
   * Dönemler render başına DEĞİL, bileşen ömrü boyunca SABİT.
   *
   * `monthPeriod()` her çağrıldığında `new Date()` okur; `useEffect`in
   * bağımlılık dizisine girseydi her render yeni bir nesne üretir ve efekt
   * sonsuz döngüye girerdi. `useState` başlatıcısı bir kez çalışır.
   */
  const [currentPeriod] = useState(() => monthPeriod(0));
  const [previousPeriod] = useState(() => monthPeriod(1));

  const [summary, setSummary] = useState<CashflowSummary | null>(null);
  const [previous, setPrevious] = useState<CashflowSummary | null>(null);
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
      /*
       * ⚠️ `label` GÖNDERİLMEZ — dönem nesnesi olduğu gibi yayılsaydı
       * (`...currentPeriod`) sorgu dizesine `label=Ağustos+2026` diye bir
       * parametre girerdi: sunucunun tanımadığı, ekranın hiç sormadığı bir alan.
       */
      getCashflowSummary({
        from: currentPeriod.from,
        to: currentPeriod.to,
        includeCategories: true,
      }),
      /*
       * ÖNCEKİ DÖNEM — yalnızca delta için, kırılım İSTENMEZ.
       *
       * ⚠️ Duvarın kahraman rakamı bir karşılaştırma olmadan afiştir
       * (ADR-0038 §5). Sunucu delta vermiyor, o yüzden ikinci bir özet
       * çağrısıyla türetiliyor — yeni bir uç açmak bir modül değişikliği
       * olurdu ve bu iş yalnızca arayüzü kapsıyor.
       */
      getCashflowSummary({ from: previousPeriod.from, to: previousPeriod.to }),
      listFinanceCommentaries({ limit: COMMENTARY_PAGE, offset: 0 }),
      countUnindexedCommentaries(),
    ])
      .then(([totals, before, page, pending]) => {
        if (!active) {
          return;
        }
        setSummary(totals);
        setPrevious(before);
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
    <Room>
      <RoomScroll>
        <RoomTop name="Finans" meta={currentPeriod.label} action={<FinanceTabs />} />

        <FinanceWall
          period={currentPeriod}
          summary={summary}
          previous={previous}
          loading={loading}
        />

        <Desk>
          <DeskHead
            title="Kırılım ve yorumlar"
            right={
              unindexed > 0 ? (
                <PillButton
                  disabled={repairing}
                  onClick={() => {
                    void repair();
                  }}
                >
                  {repairing ? 'Onarılıyor…' : `${String(unindexed)} yorum indekslenmemiş — onar`}
                </PillButton>
              ) : null
            }
          />

          <DeskBody>
            <FormError message={error} />

            <Rise delay={ROOM_RISE.desk}>
              <section className="mb-7 flex flex-col gap-2.5">
                {loading ? null : <CurrencyTotals summary={summary} />}
              </section>

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
            </Rise>
          </DeskBody>
        </Desk>
      </RoomScroll>
    </Room>
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
 * Bu kural artık `CategoryBars`'ta uygulanıyor ve orada bir testle kilitli;
 * kırılımın çizimi tümüyle ona devredildi (FRONTEND §4.10).
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

          {/*
            ⚠️ `null` ile `[]` AYRI ŞEYLERDİR ve ikisi de hiç çizmemeye götürür,
            ama sebepleri farklıdır: `null` = kırılım İSTENMEDİ (bu ekran
            istiyor, yani buraya düşmez), `[]` = istendi ama kayıt yok. İkincide
            para birimi kartı yine görünür — toplamlar var, kırılım yok.

            Kırılım artık `CategoryBars`: satırlar aynı (etiket + tutar), araya
            oranı gösteren çubuk girdi. Liste yerine grafik KONMADI, liste
            grafiğe DÖNÜŞTÜ — bilgi kaybı yok, ekranda iki kez aynı şey de yok.
          */}
          {row.categories === null || row.categories.length === 0 ? null : (
            <CategoryBars categories={row.categories} income={row.income} expense={row.expense} />
          )}
        </div>
      ))}
    </div>
  );
}
