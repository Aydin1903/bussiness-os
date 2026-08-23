'use client';

import type { SalesDocumentKind, SalesDocumentView } from '@business-os/contracts';
import { MAX_CUSTOMER_NAME_CHARS } from '@business-os/contracts';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { PillButton, PrimaryButton, RISE } from '@/components/module-kit/chrome';
import { ConfirmDelete } from '@/components/module-kit/confirm-delete';
import {
  FieldGrid,
  FormActions,
  GhostButton,
  InlinePanel,
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
import { errorMessage } from '@/lib/api/error-message';
import {
  cancelInvoice,
  convertQuote,
  decideQuote,
  deleteDocument,
  downloadDocumentPdf,
  getDocument,
  issueInvoice,
  sendQuote,
  updateInvoice,
  updateQuote,
} from '@/lib/api/invoicing';
import {
  ActorStamp,
  DocumentNumber,
  formatDay,
  isEditable,
  Money,
  readOnlyReason,
  StatusPill,
} from './chrome';
import { emptyLine, LinesEditor, toLineInputs, type LineDraft } from './lines-editor';

/**
 * BELGE DETAYI (ADR-0038 §6.5, ADR-0041 §11.2).
 *
 * ============================================================================
 * ⚠️ DETAYIN DUVARI YOKTUR — ve bu ADR-0038'in kuralıdır
 * ============================================================================
 * _"Özetlenecek bir durum değil, tek bir kayıt var."_ Sekme şeridi de yoktur:
 * bir belgede "hangi çalışma yüzeyindeyim" sorusu doğmaz.
 *
 * ============================================================================
 * ⚠️ SALT-OKUNUR GÖRÜNÜM BİR HATA ÖNLEME DEĞİL, BİR ANLATIMDIR (§2)
 * ============================================================================
 * Gönderilmiş/kesilmiş bir belgede düzenleme alanları HİÇ AÇILMAZ ve ekran
 * SEBEBİNİ yazar. Kullanıcı "neden değiştiremiyorum" diye bir 409'a
 * ÇARPMADAN ÖNCE anlamalıdır.
 *
 * ⚠️ Bu, sunucunun üç katmanlı korumasının YERİNE GEÇMEZ — dördüncü bir katman
 * da değildir. İki sekmede açık bir belgede biri gönderirse diğeri hâlâ
 * taslak sanar ve **409** alır; o yüzden sunucu tarafı vazgeçilmezdir. Buradaki
 * iş yalnızca GÖRÜNÜRLÜKTÜR.
 */
export function DocumentDetailScreen({
  kind,
  documentId,
}: {
  readonly kind: SalesDocumentKind;
  readonly documentId: string;
}) {
  const router = useRouter();
  const isQuote = kind === 'quote';

  const [view, setView] = useState<SalesDocumentView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const [editOpen, setEditOpen] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [issuedOn, setIssuedOn] = useState('');
  const [dueDay, setDueDay] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<readonly LineDraft[]>([emptyLine()]);

  const load = useCallback(() => {
    let active = true;
    setLoading(true);

    getDocument(kind, documentId)
      .then((next) => {
        if (active) {
          setView(next);
          setError(null);
        }
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
  }, [kind, documentId]);

  useEffect(load, [load]);

  /** Düzenleme formunu MEVCUT veriyle doldurur. */
  function openEdit(current: SalesDocumentView): void {
    setCustomerName(current.document.customerName);
    setIssuedOn(current.document.issuedOn);
    setDueDay((isQuote ? current.document.validUntil : current.document.dueOn) ?? '');
    setNotes(current.document.notes ?? '');
    setLines(
      current.lines.length === 0
        ? [emptyLine()]
        : current.lines.map((line) => ({
            description: line.description,
            quantity: line.quantity,
            unit: line.unit ?? '',
            unitPrice: line.unitPrice,
            taxRate: line.taxRate,
          })),
    );
    setActionError(null);
    setEditOpen(true);
  }

  /** Bir eylemi çalıştırır ve dönen görünümü yerine koyar. */
  async function run(action: () => Promise<SalesDocumentView>): Promise<void> {
    setBusy(true);
    setActionError(null);
    try {
      setView(await action());
    } catch (cause: unknown) {
      setActionError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(): Promise<void> {
    const body = {
      customerName: customerName.trim(),
      issuedOn,
      notes: notes.trim() === '' ? null : notes.trim(),
      lines: toLineInputs(lines),
    };

    await run(async () =>
      isQuote
        ? updateQuote(documentId, { ...body, validUntil: dueDay === '' ? null : dueDay })
        : updateInvoice(documentId, { ...body, dueOn: dueDay === '' ? null : dueDay }),
    );

    setEditOpen(false);
  }

  /**
   * ⚠️ DÖNÜŞTÜRME YENİ BİR KAYDA GİDER — bu sayfa DEĞİŞMEZ (§3).
   *
   * Teklife tek kolon yazılmaz; dönen şey YENİ bir fatura taslağıdır ve
   * kullanıcı ona yönlendirilir. Teklif sayfası olduğu gibi kalır — geri
   * dönüldüğünde aynı belgeyi bulur.
   */
  async function convert(): Promise<void> {
    setBusy(true);
    setActionError(null);
    try {
      const invoice = await convertQuote(documentId);
      router.push(`/app/invoicing/invoices/${invoice.document.id}`);
    } catch (cause: unknown) {
      setActionError(errorMessage(cause));
      setBusy(false);
    }
  }

  async function remove(): Promise<void> {
    setBusy(true);
    setActionError(null);
    try {
      await deleteDocument(kind, documentId);
      router.push(isQuote ? '/app/invoicing' : '/app/invoicing/invoices');
    } catch (cause: unknown) {
      setActionError(errorMessage(cause));
      setBusy(false);
    }
  }

  async function download(): Promise<void> {
    if (view === null) {
      return;
    }

    setBusy(true);
    setActionError(null);
    try {
      const suffix = view.document.number ?? 'taslak';
      await downloadDocumentPdf(kind, documentId, `${isQuote ? 'teklif' : 'fatura'}-${suffix}.pdf`);
    } catch (cause: unknown) {
      setActionError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <Room>
        <RoomTop name={isQuote ? 'Teklif' : 'Fatura'} />
        <RoomScroll>
          <Desk>
            <DeskHead title="Belge" />
            <DeskBody>
              <DeskSkeleton />
            </DeskBody>
          </Desk>
        </RoomScroll>
      </Room>
    );
  }

  if (view === null) {
    return (
      <Room>
        <RoomTop name={isQuote ? 'Teklif' : 'Fatura'} />
        <RoomScroll>
          <Desk>
            <DeskHead title="Belge" />
            <DeskBody>
              <FormError message={error ?? 'Belge bulunamadı.'} />
              <div className="mt-4">
                <Link
                  href={isQuote ? '/app/invoicing' : '/app/invoicing/invoices'}
                  className="text-[12.5px] text-ink hover:underline"
                >
                  ← Listeye dön
                </Link>
              </div>
            </DeskBody>
          </Desk>
        </RoomScroll>
      </Room>
    );
  }

  const { document, lines: rows, totals } = view;
  const editable = isEditable(document);

  return (
    <Room>
      <RoomTop
        name={isQuote ? 'Teklif' : 'Fatura'}
        meta={document.customerName}
        action={
          <Rise delay={RISE.action}>
            <div className="flex flex-wrap items-center gap-2">
              <PillButton
                onClick={() => {
                  void download();
                }}
                disabled={busy}
              >
                PDF indir
              </PillButton>

              {editable ? (
                <PillButton
                  onClick={() => {
                    if (editOpen) {
                      setEditOpen(false);
                    } else {
                      openEdit(view);
                    }
                  }}
                  disabled={busy}
                >
                  {editOpen ? 'Kapat' : 'Düzenle'}
                </PillButton>
              ) : null}

              {/*
                ⚠️ DURUM GEÇİŞİ BUTONLARI YALNIZCA GEÇERLİ OLDUKLARINDA görünür.
                Devre dışı bir buton göstermek, kullanıcıya "bir yolu var ama
                sana kapalı" derdi — oysa `sent` bir teklif için "gönder" diye
                bir yol YOKTUR (geri dönüş yoktur, §1.2).
              */}
              {isQuote && document.status === 'draft' ? (
                <PrimaryButton
                  onClick={() => {
                    void run(async () => sendQuote(documentId));
                  }}
                  disabled={busy || rows.length === 0}
                >
                  Gönderildi işaretle
                </PrimaryButton>
              ) : null}

              {!isQuote && document.status === 'draft' ? (
                <PrimaryButton
                  onClick={() => {
                    void run(async () => issueInvoice(documentId));
                  }}
                  disabled={busy || rows.length === 0}
                >
                  Faturayı kes
                </PrimaryButton>
              ) : null}

              {isQuote && document.status === 'sent' ? (
                <>
                  <PillButton
                    onClick={() => {
                      void run(async () => decideQuote(documentId, { outcome: 'rejected' }));
                    }}
                    disabled={busy}
                  >
                    Reddedildi
                  </PillButton>
                  <PrimaryButton
                    onClick={() => {
                      void run(async () => decideQuote(documentId, { outcome: 'accepted' }));
                    }}
                    disabled={busy}
                  >
                    Kabul edildi
                  </PrimaryButton>
                </>
              ) : null}

              {isQuote && document.status === 'accepted' ? (
                <PrimaryButton
                  onClick={() => {
                    void convert();
                  }}
                  disabled={busy}
                >
                  Faturaya dönüştür
                </PrimaryButton>
              ) : null}

              {!isQuote && document.status === 'issued' ? (
                <PillButton
                  onClick={() => {
                    void run(async () => cancelInvoice(documentId));
                  }}
                  disabled={busy}
                >
                  Faturayı iptal et
                </PillButton>
              ) : null}
            </div>
          </Rise>
        }
      />

      <RoomScroll>
        <Desk>
          <DeskHead
            title="Belge"
            right={
              <Link
                href={isQuote ? '/app/invoicing' : '/app/invoicing/invoices'}
                className="text-[11.5px] text-fg-3 hover:text-fg"
              >
                ← Listeye dön
              </Link>
            }
          />

          <DeskBody>
            <FormError message={actionError} />

            <Rise delay={RISE.body}>
              <section className="mb-5 rounded-card border border-border bg-raised p-5 shadow-card">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <StatusPill status={document.status} />
                    <DocumentNumber document={document} />
                  </div>
                  <span className="text-[11.5px] text-fg-3">
                    Belge tarihi {formatDay(document.issuedOn)}
                  </span>
                </div>

                <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Müşteri (belgeye basılan)">{document.customerName}</Field>

                  {/*
                    ⚠️ AYNI EKRANDA İKİ AD GÖRÜNEBİLİR VE BU BİR KUSUR DEĞİL —
                    ayrımın ta kendisidir (§1.5). Belgedeki ad DONMUŞTUR;
                    aşağıdaki ise BUGÜNKÜ müşteridir. Yalnızca FARKLIYSA
                    gösterilir: aynıysa iki kez yazmak gürültü olurdu.
                  */}
                  {view.linkedCompanyName !== null &&
                  view.linkedCompanyName !== document.customerName ? (
                    <Field label="CRM’de bugünkü adı">
                      <span className="text-fg-2">{view.linkedCompanyName}</span>
                    </Field>
                  ) : null}

                  {view.linkedContactName === null ? null : (
                    <Field label="İlgili kişi">{view.linkedContactName}</Field>
                  )}

                  {isQuote ? (
                    <Field label="Geçerlilik">
                      {document.validUntil === null ? '—' : formatDay(document.validUntil)}
                    </Field>
                  ) : (
                    <Field label="Vade">
                      {document.dueOn === null ? '—' : formatDay(document.dueOn)}
                    </Field>
                  )}

                  <Field label="Para birimi">{document.currency}</Field>
                </dl>

                {document.notes === null ? null : (
                  <p className="mt-4 max-w-[62ch] text-[12.5px] leading-[1.6] text-fg-2">
                    {document.notes}
                  </p>
                )}

                {/*
                  ⚠️ AKTÖR DAMGALARI (§8.2) — bir DENETİM İZİ DEĞİL.
                  Taslakta hiçbir damga gösterilmez: taslak düzenlemeleri
                  İZLENMEZ ve olmayan bir günlüğü var gibi göstermeyiz.
                */}
                {document.sentAt === null && document.decidedAt === null ? null : (
                  <div className="mt-4 flex flex-col gap-1 border-t border-border pt-3">
                    <ActorStamp
                      action={isQuote ? 'Gönderildi' : 'Kesildi'}
                      at={document.sentAt}
                      userId={document.sentByUserId}
                    />
                    <ActorStamp
                      action={decisionLabel(document.status)}
                      at={document.decidedAt}
                      userId={document.decidedByUserId}
                    />
                  </div>
                )}

                {/*
                  ⚠️ SALT-OKUNUR SEBEBİ (§2) — kullanıcı bir 409'a ÇARPMADAN
                  ÖNCE anlamalı. Bir uyarı rengi TAŞIMAZ: bu bir hata değil,
                  belgenin doğru hâlidir.
                */}
                {editable ? null : (
                  <p className="mt-4 max-w-[62ch] rounded-field border border-border bg-sunken px-3.5 py-2.5 text-[12px] leading-[1.6] text-fg-2">
                    {readOnlyReason(document)}
                  </p>
                )}
              </section>
            </Rise>

            {editOpen && editable ? (
              <InlinePanel title="Taslağı düzenle">
                <FieldGrid>
                  <TextField
                    id="edit-customer"
                    label="Müşteri"
                    value={customerName}
                    onChange={(value) => {
                      setCustomerName(value.slice(0, MAX_CUSTOMER_NAME_CHARS));
                    }}
                    required
                    disabled={busy}
                  />
                  <TextField
                    id="edit-issued"
                    label="Belge tarihi"
                    value={issuedOn}
                    onChange={setIssuedOn}
                    type="date"
                    disabled={busy}
                  />
                  <TextField
                    id="edit-due"
                    label={isQuote ? 'Geçerlilik tarihi' : 'Vade tarihi'}
                    value={dueDay}
                    onChange={setDueDay}
                    type="date"
                    disabled={busy}
                  />
                </FieldGrid>

                <div className="mt-4">
                  <TextAreaField
                    id="edit-notes"
                    label="Not"
                    value={notes}
                    onChange={setNotes}
                    disabled={busy}
                    rows={2}
                  />
                </div>

                <div className="mt-5">
                  <LinesEditor lines={lines} onChange={setLines} disabled={busy} />
                </div>

                <FormActions>
                  <GhostButton
                    onClick={() => {
                      setEditOpen(false);
                    }}
                    disabled={busy}
                  >
                    Vazgeç
                  </GhostButton>
                  <PrimaryButton
                    onClick={() => {
                      void saveEdit();
                    }}
                    disabled={busy || customerName.trim() === ''}
                  >
                    {busy ? 'Kaydediliyor…' : 'Kaydet'}
                  </PrimaryButton>
                </FormActions>
              </InlinePanel>
            ) : null}

            <div className="mb-2 font-mono text-[9px] font-semibold tracking-[0.18em] text-fg-3 uppercase">
              Kalemler
            </div>

            {rows.length === 0 ? (
              <p className="rounded-card border border-border bg-surface px-5 py-6 text-[12.5px] text-fg-2">
                Bu belgede henüz kalem yok.{' '}
                {editable
                  ? 'Düzenle’ye basıp kalem ekleyin — kalemsiz bir belge gönderilemez.'
                  : ''}
              </p>
            ) : (
              <div>
                {rows.map((line) => (
                  <DeskRow key={line.id} columns="minmax(0,2fr) 1fr 1fr 0.6fr">
                    <span className="truncate text-fg">{line.description}</span>
                    <span className="text-fg-2">
                      {/*
                        ⚠️ MİKTAR BİRİMİYLE yazılır, çıplak sayı olarak DEĞİL —
                        ADR-0039 §4.1'in kuralı: birimsiz bir sayı, farklı
                        kalemlerin toplanabileceğini ima ederdi.
                      */}
                      {line.quantity}
                      {line.unit === null ? '' : ` ${line.unit}`}
                    </span>
                    <Money amount={line.unitPrice} currency={document.currency} />
                    <span className="tabular text-right text-fg-3">%{line.taxRate}</span>
                  </DeskRow>
                ))}
              </div>
            )}

            {/*
              ⚠️ TOPLAMLAR SUNUCUDAN GELİR (§1.3) — istemcide HESAPLANMAZ.
              İkinci bir aritmetik, satır bazında yuvarlama kuralının ikinci
              uygulaması olurdu ve iki toplam SESSİZCE ayrışırdı.
            */}
            <div className="mt-4 flex justify-end">
              <dl className="w-full max-w-[280px] rounded-card border border-border bg-raised p-4">
                <TotalRow
                  label="Ara toplam"
                  amount={totals.subtotal}
                  currency={document.currency}
                />
                <TotalRow label="Vergi" amount={totals.taxTotal} currency={document.currency} />
                <div className="mt-2 border-t border-border pt-2">
                  <TotalRow
                    label="Genel toplam"
                    amount={totals.total}
                    currency={document.currency}
                    strong
                  />
                </div>
              </dl>
            </div>

            {/*
              ⚠️ SİLME YALNIZCA TASLAKTA. Gönderilmiş bir belgenin "silinmesi"
              `rejected`/`cancelled` durumudur ve satır DURUR — numarası da
              durur (§1.6).
            */}
            {editable ? (
              <div className="mt-8 border-t border-border pt-5">
                <ConfirmDelete
                  question="Bu taslak ve kalemleri kalıcı olarak silinecek."
                  ariaLabel="Taslağı sil"
                  pending={busy}
                  onConfirm={() => {
                    void remove();
                  }}
                />
              </div>
            ) : null}
          </DeskBody>
        </Desk>
      </RoomScroll>
    </Room>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="text-[11px] tracking-[-0.004em] text-fg-3">{label}</dt>
      <dd className="truncate text-[13px] text-fg">{children}</dd>
    </div>
  );
}

function TotalRow({
  label,
  amount,
  currency,
  strong = false,
}: {
  readonly label: string;
  readonly amount: string;
  readonly currency: string;
  readonly strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className={strong ? 'text-[12.5px] font-semibold text-fg' : 'text-[12px] text-fg-2'}>
        {label}
      </dt>
      <dd>
        <Money amount={amount} currency={currency} />
      </dd>
    </div>
  );
}

/** Karar damgasının etiketi — durumdan okunur. */
function decisionLabel(status: string): string {
  if (status === 'accepted') {
    return 'Kabul edildi';
  }
  if (status === 'rejected') {
    return 'Reddedildi';
  }
  return 'İptal edildi';
}
