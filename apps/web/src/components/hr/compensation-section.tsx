'use client';

import type { CompensationHistoryResponse } from '@business-os/contracts';
import { useCallback, useEffect, useState } from 'react';

import { EmptyState, PrimaryButton, SectionLabel } from '@/components/module-kit/chrome';
import { FieldGrid, FormActions, TextField } from '@/components/module-kit/form-kit';
import { FormError } from '@/components/ui/form-error';
import { errorMessage } from '@/lib/api/error-message';
import { addCompensation, getCompensation } from '@/lib/api/hr';
import { formatDay } from './chrome';

/**
 * ÜCRET BÖLÜMÜ — ⚠️ YALNIZCA `compensation:read` TAŞIYAN KULLANICI İÇİN.
 *
 * ============================================================================
 * ⚠️ BU BİLEŞEN KOŞULLU RENDER EDİLİR — İÇİNDE BİR "GİZLE" DALI YOKTUR
 * ============================================================================
 * `employee-detail-screen.tsx` bu bileşeni yalnızca `canReadCompensation(role)`
 * doğruyken ÇİZER. Yani izinsiz kullanıcı için:
 *
 *   - bileşen HİÇ MOUNT EDİLMEZ  → DOM'da hiçbir düğümü yoktur,
 *   - `useEffect` HİÇ ÇALIŞMAZ   → `/hr/employees/:id/compensation` ucuna
 *                                   İSTEK ATILMAZ (ağ sekmesinde bile yok),
 *   - "Ücret" kelimesi sayfa kaynağında GEÇMEZ.
 *
 * ⚠️ Alternatif — bileşeni her zaman çizip içeride `if (!canRead) return null`
 * demek — DOM'u temizlerdi ama İSTEĞİ ENGELLEMEZDİ (efekt mount'ta çalışır).
 * Alternatifin daha kötüsü CSS ile gizlemekti: veri DOM'a girer ve kaynak
 * görüntüleyen herkes okur.
 *
 * ⚠️ Bu bir GÜVENLİK SINIRI DEĞİLDİR — gerçek yetki sunucudadır
 * (`compensation:read` → 403, entegrasyon testleriyle kanıtlı). Buradaki iş,
 * yüzeyin VAR OLMAMASIDIR: bir 403 alıp yutmak ağ sekmesinde uç adını ve
 * dolayısıyla "burada bir maaş var" bilgisini ele verirdi.
 *
 * ============================================================================
 * ⚠️ GÜNCEL ÜCRET TÜRETİLMİŞTİR — GELECEK TARİHLİ ZAM İLE KARIŞTIRILMAZ
 * ============================================================================
 * Sunucu `current` alanını `effectiveFrom <= bugün` olanların en yenisi olarak
 * hesaplar (§1.5). Gelecek tarihli bir zam `items` içinde GÖRÜNÜR ama `current`
 * OLMAZ — ekran bu ayrımı AÇIKÇA yazar, aksi halde kullanıcı bugünkü maaşı
 * yanlış okur.
 */
export function CompensationSection({
  employeeId,
  canWrite,
}: {
  readonly employeeId: string;
  readonly canWrite: boolean;
}) {
  const [history, setHistory] = useState<CompensationHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('TRY');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    getCompensation(employeeId)
      .then((response) => {
        setHistory(response);
        setError(null);
      })
      .catch((cause: unknown) => {
        setError(errorMessage(cause));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [employeeId]);

  useEffect(load, [load]);

  function submit(): void {
    setSaving(true);
    setFormError(null);

    addCompensation(employeeId, { amount, currency, effectiveFrom })
      .then(() => {
        setAmount('');
        setEffectiveFrom('');
        setFormOpen(false);
        load();
      })
      .catch((cause: unknown) => {
        setFormError(errorMessage(cause));
      })
      .finally(() => {
        setSaving(false);
      });
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionLabel>Ücret</SectionLabel>
        {canWrite ? (
          <PrimaryButton
            onClick={() => {
              setFormOpen((open) => !open);
            }}
          >
            {formOpen ? 'Vazgeç' : 'Ücret kaydı ekle'}
          </PrimaryButton>
        ) : null}
      </div>

      {/*
        ⚠️ BU UYARI SÜS DEĞİL: defter EKLEME-YALNIZDIR (§1.2) ve
        değiştirilemezliği §6.2'ye göre DENETİM İZİNİN TA KENDİSİDİR. Kullanıcı
        bunu YAZMADAN ÖNCE bilmeli — sonradan "geri al" araması boşa çıkar.
      */}
      <p className="mt-2 max-w-[60ch] text-[12px] leading-[1.6] text-fg-3">
        Ücret kayıtları <strong className="font-semibold text-fg-2">geri alınamaz</strong>: bir
        kayıt eklendikten sonra düzeltilemez ve silinemez. Yanlış girilen bir tutar, doğru tutarla
        yeni bir yürürlük tarihi yazılarak düzeltilir. Bu, “maaşı kim ne zaman değiştirdi” sorusunun
        cevabının kaydın kendisi olmasındandır.
      </p>

      {formOpen ? (
        <div className="mt-4 rounded-card border border-border bg-surface px-5 py-4 shadow-card">
          <FieldGrid>
            <TextField
              id="hr-amount"
              label="Tutar"
              value={amount}
              onChange={setAmount}
              required
              disabled={saving}
              hint="en fazla iki ondalık hane"
            />
            <TextField
              id="hr-currency"
              label="Para birimi"
              value={currency}
              onChange={setCurrency}
              required
              disabled={saving}
              hint="üç harfli kod — TRY, EUR, USD"
            />
            <TextField
              id="hr-effective-from"
              label="Yürürlük tarihi"
              value={effectiveFrom}
              onChange={setEffectiveFrom}
              type="date"
              required
              disabled={saving}
              hint="gelecek bir tarih yazılabilir; bugünkü ücret değişmez"
            />
          </FieldGrid>

          <FormError message={formError} />

          <FormActions>
            <PrimaryButton
              disabled={saving || amount.trim() === '' || effectiveFrom === ''}
              onClick={submit}
            >
              {saving ? 'Kaydediliyor…' : 'Kaydet'}
            </PrimaryButton>
          </FormActions>
        </div>
      ) : null}

      <FormError message={error} />

      {loading ? (
        <p className="mt-4 text-[12.5px] text-fg-3">Yükleniyor…</p>
      ) : history === null || history.items.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="Ücret kaydı yok"
            hint="Bu çalışan için henüz bir ücret girilmemiş. Girilen kayıtlar yalnızca yöneticiler tarafından görülür."
          />
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          <div className="rounded-card border border-border bg-surface px-5 py-4 shadow-card">
            <p className="font-mono text-[9px] font-semibold tracking-[0.19em] text-fg-3 uppercase">
              Bugünkü ücret
            </p>
            {history.current === null ? (
              <p className="mt-1.5 text-[13px] text-fg-2">
                Bugün yürürlükte bir kayıt yok — girilen kayıtların yürürlük tarihi gelecekte.
              </p>
            ) : (
              <p className="tabular mt-1.5 text-[26px] leading-[1.1] font-bold tracking-[-0.03em] text-fg">
                {/* ⚠️ Sunucunun KANONİK dizesi olduğu gibi yazılır — BİNLİK
                    AYRACI YOK. Biçimlendirmek `Number`a çevirmek demekti ve
                    para bu projede hiçbir noktada `number` olmuyor. */}
                {history.current.amount} {history.current.currency}
                <span className="ml-2 text-[11.5px] font-medium text-fg-3">
                  {formatDay(history.current.effectiveFrom)} tarihinden beri
                </span>
              </p>
            )}
          </div>

          <ul className="flex flex-col gap-1.5">
            {history.items.map((record) => {
              const future = record.effectiveFrom > today;

              return (
                <li
                  key={record.id}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-card border border-border bg-surface px-4 py-2.5"
                >
                  <span className="tabular text-[13px] font-semibold text-fg">
                    {record.amount} {record.currency}
                  </span>
                  <span className="text-[11.5px] text-fg-3">
                    {formatDay(record.effectiveFrom)}
                    {/* ⚠️ Gelecek tarihli kayıt AÇIKÇA işaretlenir: listede
                        görünür ama bugünkü ücret DEĞİLDİR (§1.5). */}
                    {future ? ' · henüz yürürlükte değil' : ''}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
