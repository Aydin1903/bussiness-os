'use client';

import type { Contact, CreateContactRequest } from '@business-os/contracts';
import { useState } from 'react';

import { createContact, deleteContact, updateContact } from '@/lib/api/crm';
import { errorMessage } from '@/lib/api/error-message';
import { FormError } from '@/components/ui/form-error';
import { PillButton, SectionLabel } from './chrome';
import { ConfirmDelete } from './confirm-delete';
import { ContactForm } from './contact-form';
import { CardAction, CardActions, CardMeta, CardTitle, RecordCard } from './record-card';

const FORBIDDEN =
  'Bu işlem için yetkiniz yok. Yetkili kayıtlarını yalnızca sahip, yönetici veya üye değiştirebilir.';

type FormTarget = { kind: 'none' } | { kind: 'new' } | { kind: 'edit'; contact: Contact };

/**
 * Şirket detayındaki kişiler bölümü.
 *
 * ============================================================================
 * KENDİ VERİSİNİ ÇEKMEZ
 * ============================================================================
 * Liste üst ekrandan gelir (`onChanged` ile tazeletir). Gerekçe
 * `knowledge-screen.tsx`'in yazdığıyla aynı: aynı veriyi iki yerden çekmek,
 * ikisinin ayrışabilmesi demektir — burada somut sonucu, görüşme yazma
 * alanındaki kişi listesiyle bu bölümdeki listenin farklı olmasıydı.
 *
 * YAZMA işlemleri ise burada yapılır: onları da yukarı taşımak, üst ekranı üç
 * kaynağın CRUD'unu birden tutan bir tanrı bileşenine çevirirdi.
 */
export function ContactSection({
  companyId,
  contacts,
  total,
  loading,
  failed,
  readOnly,
  onChanged,
}: {
  companyId: string;
  contacts: readonly Contact[];
  total: number;
  loading: boolean;
  /** Liste çekilemedi — "hiç kişi yok" ile AYNI ŞEY DEĞİL. */
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

  async function save(body: CreateContactRequest): Promise<void> {
    setSaving(true);
    setFormError(null);
    try {
      if (form.kind === 'edit') {
        // `companyId` gövdeden ÇIKARILIR: backend güncellemede kabul etmez
        // (kişiyi taşımak ayrı bir işlemdir).
        const { companyId: _ignored, ...changes } = body;
        await updateContact(form.contact.id, changes);
      } else {
        await createContact(body);
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
      await deleteContact(id);
      onChanged();
    } catch (caught) {
      setActionError(
        errorMessage(caught, undefined, {
          403: 'Silme yetkiniz yok. Yetkili silmeyi yalnızca sahip veya yönetici yapabilir.',
        }),
      );
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center justify-between gap-3">
        <SectionLabel>Yetkililer{failed ? '' : ` · ${String(total)}`}</SectionLabel>

        {readOnly || form.kind !== 'none' ? null : (
          <PillButton
            onClick={() => {
              setForm({ kind: 'new' });
            }}
          >
            Yetkili ekle
          </PillButton>
        )}
      </div>

      {form.kind === 'none' ? null : (
        <ContactForm
          companyId={companyId}
          {...(form.kind === 'edit' ? { initial: form.contact } : {})}
          pending={saving}
          error={formError}
          onSubmit={(body) => {
            void save(body);
          }}
          onCancel={closeForm}
        />
      )}

      <FormError message={actionError} />

      {contacts.length === 0 ? (
        <EmptyContacts loading={loading} failed={failed} readOnly={readOnly} />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {contacts.map((contact) => (
            <li key={contact.id}>
              <RecordCard>
                <div className="flex items-start justify-between gap-3">
                  <CardTitle>{contact.fullName}</CardTitle>

                  {readOnly ? null : (
                    <CardActions>
                      <CardAction
                        ariaLabel={`${contact.fullName} yetkilisini düzenle`}
                        onClick={() => {
                          setForm({ kind: 'edit', contact });
                        }}
                      >
                        Düzenle
                      </CardAction>
                      <ConfirmDelete
                        pending={deletingId === contact.id}
                        ariaLabel={`${contact.fullName} yetkilisini sil`}
                        question={`"${contact.fullName}" kalıcı olarak silinecek.`}
                        onConfirm={() => {
                          void remove(contact.id);
                        }}
                      />
                    </CardActions>
                  )}
                </div>

                <CardMeta items={[contact.title, contact.email, contact.phone]} />
              </RecordCard>
            </li>
          ))}
        </ul>
      )}

      {/*
        Kişiler için sayfalama YOK: tek bir şirketin kişi sayısı pratikte
        onlarla ölçülür ve alt bölüme ikinci bir sayfalayıcı koymak ekranı
        ağırlaştırırdı. Ama sınır GİZLENMEZ — 100'ü aşan durumda satır
        açıkça söylenir; sessizce kırpmak, var olan kişileri yok göstermek
        olurdu.
      */}
      {contacts.length < total ? (
        <p className="mt-3 text-[11.5px] text-fg-3">
          İlk {contacts.length} yetkili gösteriliyor (toplam {total}).
        </p>
      ) : null}
    </section>
  );
}

function EmptyContacts({
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
    return <p className="text-[12.5px] text-fg-3">Yetkililer şu an getirilemedi.</p>;
  }

  return (
    <p className="text-[12.5px] leading-[1.6] text-fg-3">
      {readOnly
        ? 'Bu müşteride henüz yetkili yok.'
        : 'Henüz yetkili yok. Görüşmelerinizi kiminle yaptığınızı işaretlemek için önce yetkili ekleyin.'}
    </p>
  );
}
