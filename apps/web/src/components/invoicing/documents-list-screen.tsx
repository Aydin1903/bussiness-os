'use client';

import type { SalesDocument, SalesDocumentKind, SalesDocumentStatus } from '@business-os/contracts';
import { MAX_CUSTOMER_NAME_CHARS } from '@business-os/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { EmptyState, Pager, PrimaryButton, RISE } from '@/components/module-kit/chrome';
import {
  FieldGrid,
  FormActions,
  GhostButton,
  InlinePanel,
  SelectField,
  TextAreaField,
  TextField,
} from '@/components/module-kit/form-kit';
import { Rise } from '@/components/panel/stream';
import {
  Desk,
  DeskBody,
  DeskHead,
  DeskRow,
  DeskSkeleton,
  Room,
  RoomScroll,
  RoomTop,
} from '@/components/room/room';
import { FormError } from '@/components/ui/form-error';
import { createInvoice, createQuote, listDocuments } from '@/lib/api/invoicing';
import { errorMessage } from '@/lib/api/error-message';
import { DocumentNumber, formatDay, StatusPill, today } from './chrome';
import { InvoicingWall } from './invoicing-wall';
import { emptyLine, LinesEditor, toLineInputs, type LineDraft } from './lines-editor';
import { InvoicingTabs } from './tabs';

export const PAGE_SIZE = 20;

/**
 * TEKLİF / FATURA ODASI — liste (ADR-0041 §11.2).
 *
 * ⚠️ TEK BİLEŞEN, İKİ ROTA. `kind` dışında hiçbir şey değişmiyor: aynı duvar,
 * aynı tezgah şekli, aynı form. Kopyalansaydı iki ekran zamanla sapardı —
 * `InvoicingWall`in kopyalanmama gerekçesinin aynısı, bir kat aşağıda.
 *
 * ============================================================================
 * ⚠️ BELGE HER ZAMAN TASLAK DOĞAR (§1.2)
 * ============================================================================
 * Formda "gönderilmiş olarak oluştur" diye bir seçenek YOKTUR. Gönderim bir
 * EYLEMDİR ve aktörünü damgalar (§8.2); ayrıca numarayı o an üretir (§1.6).
 * Oluşturma anında gönderilebilseydi, kullanıcı henüz okumadığı bir belgeye
 * numara yakmış olurdu.
 *
 * ============================================================================
 * ⚠️ BU EKRANDA TOPLAM SÜTUNU YOKTUR
 * ============================================================================
 * Liste ucu belge BAŞLIKLARINI döndürür; toplamlar yalnızca detayda, sunucunun
 * hesapladığı `totals` ile gelir (§1.3). İstemcide hesaplamak, satır bazında
 * yuvarlama kuralının İKİNCİ bir uygulaması olurdu ve sessizce ayrışırdı.
 */
export function DocumentsListScreen({ kind }: { readonly kind: SalesDocumentKind }) {
  const isQuote = kind === 'quote';

  const [items, setItems] = useState<readonly SalesDocument[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState<'' | SalesDocumentStatus>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [customerName, setCustomerName] = useState('');
  const [issuedOn, setIssuedOn] = useState(today());
  const [dueDay, setDueDay] = useState('');
  const [currency, setCurrency] = useState('TRY');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<readonly LineDraft[]>([emptyLine()]);

  useEffect(() => {
    let active = true;
    setLoading(true);

    // ⚠️ Alanlar KOŞULLU eklenir, `undefined` ATANMAZ:
    // `exactOptionalPropertyTypes` altında "alan yok" ile "alan var ama
    // undefined" AYRI tiplerdir.
    listDocuments({
      kind,
      limit: PAGE_SIZE,
      offset,
      ...(status === '' ? {} : { status }),
    })
      .then((page) => {
        if (!active) {
          return;
        }
        setItems(page.items);
        setTotal(page.total);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(errorMessage(cause));
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
  }, [kind, offset, status, reloadToken]);

  const resetForm = useCallback(() => {
    setCustomerName('');
    setIssuedOn(today());
    setDueDay('');
    setCurrency('TRY');
    setNotes('');
    setLines([emptyLine()]);
    setCreateError(null);
  }, []);

  async function submit(): Promise<void> {
    setCreating(true);
    setCreateError(null);

    const base = {
      customerName: customerName.trim(),
      issuedOn,
      currency: currency.trim().toUpperCase(),
      ...(notes.trim() === '' ? {} : { notes: notes.trim() }),
      lines: toLineInputs(lines),
    };

    try {
      // ⚠️ `validUntil` YALNIZCA teklifte, `dueOn` YALNIZCA faturada gönderilir
      // (§1.2). Gövde şemaları `.strict()`tir: karşı tarafın alanını göndermek
      // 422 döner — ve bu iyidir, istemci hatasını ÖĞRENİR.
      if (isQuote) {
        await createQuote({ ...base, ...(dueDay === '' ? {} : { validUntil: dueDay }) });
      } else {
        await createInvoice({ ...base, ...(dueDay === '' ? {} : { dueOn: dueDay }) });
      }

      setCreateOpen(false);
      resetForm();
      setOffset(0);
      setReloadToken((token) => token + 1);
    } catch (cause: unknown) {
      setCreateError(errorMessage(cause));
    } finally {
      setCreating(false);
    }
  }

  return (
    <Room>
      <RoomTop
        name={isQuote ? 'Teklifler' : 'Faturalar'}
        meta={total === 0 ? undefined : `${String(total)} belge`}
        action={
          <Rise delay={RISE.action}>
            <PrimaryButton
              onClick={() => {
                setCreateOpen((open) => !open);
                setCreateError(null);
              }}
            >
              {createOpen ? 'Kapat' : isQuote ? 'Teklif yaz' : 'Fatura taslağı'}
            </PrimaryButton>
          </Rise>
        }
      />

      <RoomScroll>
        <InvoicingWall total={total} items={items} loading={loading} />

        <Desk>
          <DeskHead
            title={isQuote ? 'Teklifler' : 'Faturalar'}
            right={<InvoicingTabs active={isQuote ? 'quotes' : 'invoices'} />}
          />

          <DeskBody>
            {createOpen ? (
              <InlinePanel title={isQuote ? 'Yeni teklif' : 'Yeni fatura taslağı'}>
                <FieldGrid>
                  <TextField
                    id="customer-name"
                    label="Müşteri"
                    value={customerName}
                    onChange={(value) => {
                      setCustomerName(value.slice(0, MAX_CUSTOMER_NAME_CHARS));
                    }}
                    placeholder="Yıldız Ltd."
                    required
                    disabled={creating}
                    /*
                     * ⚠️ Bu ad BELGEYE BASILAN addır (§1.5) ve gönderildikten
                     * sonra DONAR. İpucu bunu söylemeli: kullanıcı CRM'deki
                     * kaydı değiştirince belgenin de değişeceğini sanmamalı.
                     */
                    hint="Belgeye basılacak ad — gönderildikten sonra değişmez"
                  />
                  <TextField
                    id="issued-on"
                    label="Belge tarihi"
                    value={issuedOn}
                    onChange={setIssuedOn}
                    type="date"
                    required
                    disabled={creating}
                  />
                  <TextField
                    id="due-day"
                    label={isQuote ? 'Geçerlilik tarihi' : 'Vade tarihi'}
                    value={dueDay}
                    onChange={setDueDay}
                    type="date"
                    disabled={creating}
                    hint={
                      isQuote
                        ? 'Boş bırakılabilir; geçmiş bir tarih kabul edilmez'
                        : 'Boş bırakılabilir'
                    }
                  />
                  <SelectField
                    id="currency"
                    label="Para birimi"
                    value={currency}
                    onChange={setCurrency}
                    options={CURRENCIES}
                    disabled={creating}
                    /*
                     * ⚠️ Belge BAŞINA tek para birimi (§1.4) — satır başına
                     * değil. İki para birimli bir belgenin TOPLAMI YOKTUR
                     * (kur çevrimi yok) ve zorlamak yerine iki belge yazmak
                     * doğrudur.
                     */
                    hint="Belge başına tek para birimi"
                  />
                </FieldGrid>

                <div className="mt-4">
                  <TextAreaField
                    id="notes"
                    label="Not"
                    value={notes}
                    onChange={setNotes}
                    placeholder="Fiyatlarımız 30 gün geçerlidir."
                    disabled={creating}
                    rows={2}
                  />
                </div>

                <div className="mt-5">
                  <LinesEditor lines={lines} onChange={setLines} disabled={creating} />
                </div>

                <FormError message={createError} />

                <FormActions>
                  <GhostButton
                    onClick={() => {
                      setCreateOpen(false);
                      resetForm();
                    }}
                    disabled={creating}
                  >
                    Vazgeç
                  </GhostButton>
                  <PrimaryButton
                    onClick={() => {
                      void submit();
                    }}
                    disabled={creating || customerName.trim() === ''}
                  >
                    {creating ? 'Kaydediliyor…' : 'Taslağı kaydet'}
                  </PrimaryButton>
                </FormActions>
              </InlinePanel>
            ) : null}

            <div className="mb-4 flex flex-wrap items-center gap-3">
              <SelectField
                id="status-filter"
                label="Durum"
                value={status}
                onChange={(value) => {
                  // ⚠️ `as` KULLANILMIYOR: seçenek listesi zaten kapalı bir
                  // kümedir ve bir gün genişlerse tip zorlaması onu SESSİZCE
                  // kabul ederdi. Arama, bilinmeyen bir değeri "hepsi"ye
                  // düşürür — yani ekran hiçbir zaman geçersiz bir filtreyle
                  // sorgu atmaz.
                  setStatus(toStatusFilter(value));
                  setOffset(0);
                }}
                options={isQuote ? QUOTE_STATUS_OPTIONS : INVOICE_STATUS_OPTIONS}
              />
            </div>

            <FormError message={error} />

            {loading ? (
              <DeskSkeleton />
            ) : items.length === 0 ? (
              <EmptyState
                title={isQuote ? 'Henüz teklif yok' : 'Henüz fatura yok'}
                hint={
                  isQuote
                    ? 'Bir teklif yazıp gönderdiğinizde, cevap bekleyenler asistanın gündemine girer.'
                    : 'Kabul edilen bir teklifi faturaya dönüştürebilir ya da doğrudan fatura taslağı yazabilirsiniz.'
                }
              />
            ) : (
              <Rise delay={RISE.body}>
                <div>
                  {items.map((row) => (
                    <DeskRow key={row.id} columns="minmax(0,2fr) 1fr 1fr auto">
                      <Link
                        href={`/app/invoicing/${isQuote ? 'quotes' : 'invoices'}/${row.id}`}
                        className="truncate font-medium text-fg hover:text-ink"
                      >
                        {row.customerName}
                      </Link>
                      <DocumentNumber document={row} />
                      <span className="text-fg-2">{formatDay(row.issuedOn)}</span>
                      <StatusPill status={row.status} />
                    </DeskRow>
                  ))}
                </div>
              </Rise>
            )}

            <Pager
              offset={offset}
              count={items.length}
              total={total}
              loading={loading}
              onPrevious={() => {
                setOffset((value) => Math.max(0, value - PAGE_SIZE));
              }}
              onNext={() => {
                setOffset((value) => value + PAGE_SIZE);
              }}
            />
          </DeskBody>
        </Desk>
      </RoomScroll>
    </Room>
  );
}

/**
 * Serbest bir dizeyi GEÇERLİ bir durum filtresine daraltır.
 *
 * ⚠️ Bilinmeyen değer `''` (hepsi) olur, PATLAMAZ: bu bir kullanıcı girdisi
 * değil, kendi seçenek listemizden gelen bir değerdir — bir gün ayrışırlarsa
 * doğru davranış, geçersiz bir filtreyle sorgu atmak DEĞİL, filtreyi
 * yoksaymaktır.
 */
function toStatusFilter(value: string): '' | SalesDocumentStatus {
  const known: readonly SalesDocumentStatus[] = [
    'draft',
    'sent',
    'accepted',
    'rejected',
    'issued',
    'cancelled',
  ];

  return known.find((candidate) => candidate === value) ?? '';
}

/**
 * ⚠️ KOD LİSTESİ DOĞRULANMAZ, yalnızca ŞEKİL (`^[A-Z]{3}$`) — ADR-0034'ün
 * kararı. Buradaki liste bir KOLAYLIKTIR, bir kısıt değil: sunucu "XYZ"yi de
 * kabul eder ve bu, bilinen bir sınır olarak kayıtlıdır.
 */
const CURRENCIES = [
  { value: 'TRY', label: 'TRY' },
  { value: 'USD', label: 'USD' },
  { value: 'EUR', label: 'EUR' },
  { value: 'GBP', label: 'GBP' },
] as const;

/**
 * ⚠️ İKİ AYRI DURUM KÜMESİ — çünkü geçerli küme `kind`'a BAĞLIDIR (§1.2).
 *
 * Tek bir birleşik liste gösterilseydi kullanıcı faturada "kabul edildi"
 * seçer ve BOŞ liste alırdı; ekran bir hata vermeden yanlış bir şey öğretirdi.
 */
const QUOTE_STATUS_OPTIONS = [
  { value: '', label: 'Hepsi' },
  { value: 'draft', label: 'Taslak' },
  { value: 'sent', label: 'Gönderildi' },
  { value: 'accepted', label: 'Kabul edildi' },
  { value: 'rejected', label: 'Reddedildi' },
] as const;

const INVOICE_STATUS_OPTIONS = [
  { value: '', label: 'Hepsi' },
  { value: 'draft', label: 'Taslak' },
  { value: 'issued', label: 'Kesildi' },
  { value: 'cancelled', label: 'İptal edildi' },
] as const;
