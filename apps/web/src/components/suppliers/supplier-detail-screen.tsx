'use client';

import type { Supplier, SupplierContact, SupplierInteraction } from '@business-os/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { EmptyState, PillButton, PrimaryButton, RISE } from '@/components/module-kit/chrome';
import { ConfirmDelete } from '@/components/module-kit/confirm-delete';
import {
  FieldGrid,
  FormActions,
  GhostButton,
  InlinePanel,
  TextField,
} from '@/components/module-kit/form-kit';
import {
  CardActions,
  CardHeader,
  CardMeta,
  CardTitle,
  RecordCard,
} from '@/components/module-kit/record-card';
import { Rise } from '@/components/panel/stream';
import {
  Desk,
  DeskBody,
  DeskHead,
  DeskSkeleton,
  Room,
  RoomScroll,
  RoomTop,
} from '@/components/room/room';
import { FormError } from '@/components/ui/form-error';
import { errorMessage } from '@/lib/api/error-message';
import {
  createSupplierContact,
  createSupplierInteraction,
  deleteSupplier,
  deleteSupplierContact,
  getSupplier,
  listSupplierContacts,
  listSupplierInteractions,
  reindexSuppliers,
  updateSupplier,
} from '@/lib/api/suppliers';
import { formatDate, formatDay, PaymentTerms, TaxNumber } from './chrome';
import { InteractionForm } from './interaction-form';

/**
 * TEDARİKÇİ DETAYI (ADR-0038 §6.5, ADR-0040 §8.2).
 *
 * ============================================================================
 * ⚠️ BU EKRANIN DUVARI YOKTUR — VE SEKME ŞERİDİ DE YOKTUR
 * ============================================================================
 * ADR-0038 §6.5: _"detay sayfalarının duvarı YOKTUR — özetlenecek bir durum
 * değil, tek bir kayıt var."_ Kalem detayında (`inventory/[itemId]`) aynı
 * karar verildi ve burada tekrarlanıyor.
 *
 * Sekme şeridi de yok: şerit odanın çalışma yüzeyleri arasında geçiş içindir,
 * detay ise bir yüzey değil bir KAYITTIR. `SupplierTabs`in `active` prop'unun
 * `pathname`den türetilmemesinin sebebi tam olarak buydu.
 *
 * ============================================================================
 * ⚠️ ÜÇ EYLEM, ÜÇ FARKLI SİLME ANLAMI — VE ÜÇÜ DE AÇIKÇA SÖYLENİR
 * ============================================================================
 *   TEDARİKÇİ SİL  → kişiler VE görüşmeler DE GİDER (`ON DELETE CASCADE`,
 *                    §1.3). Vektör görüşme satırının kendisinde yaşadığı için
 *                    AI'ın hafızasından da silinir — bu bir KVKK girdisidir.
 *   KİŞİ SİL       → görüşme kaydı YERİNDE KALIR (`ON DELETE SET NULL`).
 *                    Ayrılan bir satın alma sorumlusunun silinmesi kurumsal
 *                    hafızayı götürseydi hata SESSİZ olurdu.
 *   GÖRÜŞME SİL    → ⚠️ YOKTUR. Günlük EKLEME-YALNIZDIR (§1).
 *
 * İki silmenin ZIT sonuçları olduğu için onay metinleri de farklıdır. Aynı
 * metni kullanmak, kullanıcının birini diğeri sanmasına yol açardı.
 */
export function SupplierDetailScreen({ supplierId }: { readonly supplierId: string }) {
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [contacts, setContacts] = useState<readonly SupplierContact[]>([]);
  const [interactions, setInteractions] = useState<readonly SupplierInteraction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [contactOpen, setContactOpen] = useState(false);
  const [contactPending, setContactPending] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);

  const [interactionOpen, setInteractionOpen] = useState(false);
  const [interactionPending, setInteractionPending] = useState(false);
  const [interactionError, setInteractionError] = useState<string | null>(null);

  /**
   * ⚠️ AD DEĞİŞTİRİLDİĞİNDE SUNUCU `staleAfterRename: true` DÖNER (§6).
   *
   * O tedarikçinin TÜM görüşme vektörleri bayatlamıştır ve `PATCH` onları
   * YENİLEMEZ. Bu durum kullanıcıya SÖYLENİR ve onarım AÇIK bir eylem olarak
   * sunulur; sessizce bırakmak "arama neden bulmuyor" sorusunu cevapsız
   * bırakırdı.
   */
  const [staleNotice, setStaleNotice] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [reindexResult, setReindexResult] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);

    Promise.all([
      getSupplier(supplierId),
      listSupplierContacts(supplierId),
      listSupplierInteractions({ limit: 50, offset: 0, supplierId }),
    ])
      .then(([row, contactPage, interactionPage]) => {
        if (!active) {
          return;
        }
        setSupplier(row);
        setContacts(contactPage.items);
        setInteractions(interactionPage.items);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (active) {
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
  }, [supplierId, reloadToken]);

  const reload = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  const repair = useCallback(() => {
    setReindexing(true);
    setReindexResult(null);

    reindexSuppliers({ supplierId })
      .then((result) => {
        setStaleNotice(false);
        setReindexResult(
          result.failed === 0
            ? `${String(result.repaired)} görüşme yeniden indekslendi.`
            : `${String(result.repaired)} görüşme indekslendi, ${String(result.failed)} tanesi başarısız oldu — tekrar deneyebilirsiniz.`,
        );
      })
      .catch((caught: unknown) => {
        setReindexResult(errorMessage(caught));
      })
      .finally(() => {
        setReindexing(false);
      });
  }, [supplierId]);

  if (loading) {
    return (
      <Room>
        <RoomScroll>
          <RoomTop name="Tedarikçi" />
          <Desk>
            <DeskHead title="Yükleniyor" />
            <DeskBody>
              <DeskSkeleton />
            </DeskBody>
          </Desk>
        </RoomScroll>
      </Room>
    );
  }

  if (supplier === null) {
    return (
      <Room>
        <RoomScroll>
          <RoomTop name="Tedarikçi" />
          <Desk>
            <DeskHead title="Bulunamadı" />
            <DeskBody>
              {error === null ? null : <FormError message={error} />}
              <EmptyState
                title="Tedarikçi bulunamadı"
                hint="Kayıt silinmiş olabilir ya da bu şirkete ait değil."
                action={
                  <Link
                    href="/app/suppliers"
                    className="text-[12.5px] font-semibold text-ink underline underline-offset-2"
                  >
                    Tedarikçi listesine dön
                  </Link>
                }
              />
            </DeskBody>
          </Desk>
        </RoomScroll>
      </Room>
    );
  }

  return (
    <Room>
      <RoomScroll>
        {/* ⚠️ DUVAR YOK — tek bir kayıt var, özetlenecek bir durum değil. */}
        <RoomTop
          name="Tedarikçi"
          meta={supplier.name}
          action={
            <ConfirmDelete
              /*
               * ⚠️ SORU CASCADE'İ AÇIKÇA SÖYLER (§1.3). "Bu kaydı silmek
               * istiyor musunuz" demek, kullanıcının kişileri ve TÜM görüşme
               * geçmişini de sildiğini ÖĞRENMEDEN onaylaması demekti — ve o
               * geçmiş AI'ın hafızasıdır, geri getirilemez.
               */
              question="Bu firmanın kişileri ve TÜM görüşme kayıtları da silinir; görüşmeler asistanın hafızasından da kalkar."
              confirmLabel="Evet, tedarikçiyi ve tüm geçmişini sil"
              ariaLabel={`${supplier.name} tedarikçisini sil`}
              onConfirm={() => {
                void deleteSupplier(supplier.id).then(() => {
                  window.location.href = '/app/suppliers';
                });
              }}
            />
          }
        />

        <Desk>
          <DeskHead
            title="Firma"
            right={
              <Link
                href="/app/suppliers"
                className="font-mono text-[9px] tracking-[0.14em] text-fg-3 uppercase hover:text-fg-2"
              >
                ← Tedarikçiler
              </Link>
            }
          />
          <DeskBody>
            {error === null ? null : <FormError message={error} />}

            {/* --- BAYAT VEKTÖR UYARISI (§6) --------------------------------- */}
            {staleNotice ? (
              <Rise>
                <div className="mb-5 rounded-card border border-accent bg-tint px-4 py-3">
                  <p className="text-[12.5px] leading-[1.6] text-fg">
                    Firma adı değişti. Bu tedarikçinin görüşmeleri eski adla indekslendiği için
                    arama sonuçları eksik kalabilir — yeniden indekslemek bunu düzeltir.
                  </p>
                  <div className="mt-2.5">
                    <PillButton onClick={repair} disabled={reindexing}>
                      {reindexing ? 'İndeksleniyor…' : 'Görüşmeleri yeniden indeksle'}
                    </PillButton>
                  </div>
                </div>
              </Rise>
            ) : null}

            {reindexResult === null ? null : (
              <p className="mb-4 text-[12px] text-fg-2">{reindexResult}</p>
            )}

            <Rise delay={RISE.body}>
              <SupplierFacts
                supplier={supplier}
                onRenamed={(stale) => {
                  setStaleNotice(stale);
                  reload();
                }}
              />
            </Rise>

            {/* --- KİŞİLER --------------------------------------------------- */}
            <div className="mt-8">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="font-mono text-[9px] font-semibold tracking-[0.18em] text-fg-3 uppercase">
                  Kişiler
                </p>
                <PillButton
                  onClick={() => {
                    setContactError(null);
                    setContactOpen((open) => !open);
                  }}
                >
                  {contactOpen ? 'Kapat' : 'Kişi ekle'}
                </PillButton>
              </div>

              {contactOpen ? (
                <ContactCreateForm
                  pending={contactPending}
                  error={contactError}
                  onSubmit={(input) => {
                    setContactPending(true);
                    setContactError(null);
                    createSupplierContact({
                      supplierId,
                      fullName: input.fullName,
                      ...(input.title.trim() === '' ? {} : { title: input.title.trim() }),
                      ...(input.email.trim() === '' ? {} : { email: input.email.trim() }),
                      ...(input.phone.trim() === '' ? {} : { phone: input.phone.trim() }),
                    })
                      .then(() => {
                        setContactOpen(false);
                        reload();
                      })
                      .catch((caught: unknown) => {
                        setContactError(errorMessage(caught));
                      })
                      .finally(() => {
                        setContactPending(false);
                      });
                  }}
                  onCancel={() => {
                    setContactOpen(false);
                  }}
                />
              ) : null}

              {contacts.length === 0 ? (
                <EmptyState
                  title="Kişi yok"
                  hint="Bu firmada kayıtlı kişi yok. Görüşmeleri kişiye bağlamak zorunlu değil."
                />
              ) : (
                <div className="flex flex-col gap-2">
                  {contacts.map((row) => (
                    <RecordCard key={row.id}>
                      <CardHeader>
                        <CardTitle>{row.fullName}</CardTitle>
                        {row.title === null ? null : (
                          <span className="text-[11.5px] text-fg-3">{row.title}</span>
                        )}
                      </CardHeader>
                      <CardMeta items={[row.email, row.phone]} />
                      <CardActions>
                        <ConfirmDelete
                          /*
                           * ⚠️ SORU TEDARİKÇİ SİLMEDEN FARKLIDIR ve olmalıdır:
                           * burada görüşme kayıtları KALIR (`SET NULL`, §1.3).
                           * Aynı metin kullanılsaydı kullanıcı geçmişini
                           * kaybedeceğini sanıp silmekten kaçınırdı.
                           */
                          question="Görüşme kayıtları silinmez; yalnızca bu kişiyle olan bağları kalkar."
                          confirmLabel="Evet, kişiyi sil"
                          ariaLabel={`${row.fullName} kişisini sil`}
                          onConfirm={() => {
                            void deleteSupplierContact(row.id).then(reload);
                          }}
                        />
                      </CardActions>
                    </RecordCard>
                  ))}
                </div>
              )}
            </div>

            {/* --- GÖRÜŞME GEÇMİŞİ ------------------------------------------- */}
            <div className="mt-8">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="font-mono text-[9px] font-semibold tracking-[0.18em] text-fg-3 uppercase">
                  Görüşme geçmişi
                </p>
                <PillButton
                  onClick={() => {
                    setInteractionError(null);
                    setInteractionOpen((open) => !open);
                  }}
                >
                  {interactionOpen ? 'Kapat' : 'Görüşme yaz'}
                </PillButton>
              </div>

              {interactionOpen ? (
                <InteractionForm
                  suppliers={[]}
                  contacts={contacts}
                  // ⚠️ TEDARİKÇİ SABİT: `onSupplierChange` VERİLMEZ, dolayısıyla
                  // seçici hiç gösterilmez. Detay sayfasında hangi firmada
                  // olduğumuz zaten belli.
                  supplierId={supplierId}
                  pending={interactionPending}
                  error={interactionError}
                  onSubmit={(input) => {
                    setInteractionPending(true);
                    setInteractionError(null);
                    createSupplierInteraction({
                      supplierId,
                      occurredOn: input.occurredOn,
                      body: input.body.trim(),
                      ...(input.contactId === '' ? {} : { contactId: input.contactId }),
                    })
                      .then(() => {
                        setInteractionOpen(false);
                        reload();
                      })
                      .catch((caught: unknown) => {
                        setInteractionError(errorMessage(caught));
                      })
                      .finally(() => {
                        setInteractionPending(false);
                      });
                  }}
                  onCancel={() => {
                    setInteractionOpen(false);
                  }}
                />
              ) : null}

              {interactions.length === 0 ? (
                <EmptyState
                  title="Görüşme yok"
                  hint="Bu firmayla ilgili yazdıklarınız asistanın hafızasına girer."
                />
              ) : (
                <div className="flex flex-col gap-2">
                  {interactions.map((row) => (
                    <RecordCard key={row.id}>
                      <CardHeader>
                        <span className="font-mono text-[9px] tracking-[0.1em] text-fg-3 uppercase">
                          {formatDay(row.occurredOn)}
                        </span>
                        {row.contactId === null ? null : (
                          <span className="text-[11.5px] text-fg-3">
                            {contacts.find((contact) => contact.id === row.contactId)?.fullName ??
                              'kişi kaydı silinmiş'}
                          </span>
                        )}
                      </CardHeader>
                      <p className="mt-1.5 text-[12.5px] leading-[1.6] whitespace-pre-wrap text-fg-2">
                        {row.body}
                      </p>
                      {/*
                        ⚠️ BU KARTTA HİÇBİR EYLEM YOK — `CardActions` bile yok.
                        Günlük EKLEME-YALNIZDIR (§1): düzenle/sil ucu, izni ve
                        entity metodu YOK. Boş bir eylem şeridi göstermek
                        olmayan bir yeteneği ima ederdi.
                      */}
                    </RecordCard>
                  ))}
                </div>
              )}
            </div>
          </DeskBody>
        </Desk>
      </RoomScroll>
    </Room>
  );
}

/**
 * Firma künyesi + düzenleme.
 *
 * ⚠️ `onRenamed` sunucunun `staleAfterRename` bayrağını yukarı taşır (§6): ad
 * değiştiyse görüşme vektörleri bayatlamıştır ve kullanıcıya onarım önerilir.
 */
function SupplierFacts({
  supplier,
  onRenamed,
}: {
  readonly supplier: Supplier;
  readonly onRenamed: (stale: boolean) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(supplier.name);
  const [taxNumber, setTaxNumber] = useState(supplier.taxNumber ?? '');
  const [category, setCategory] = useState(supplier.category ?? '');
  const [email, setEmail] = useState(supplier.email ?? '');
  const [phone, setPhone] = useState(supplier.phone ?? '');
  const [website, setWebsite] = useState(supplier.website ?? '');
  const [address, setAddress] = useState(supplier.address ?? '');
  const [paymentTerms, setPaymentTerms] = useState(supplier.paymentTerms ?? '');

  if (!editing) {
    return (
      <div className="rounded-card border border-border bg-surface px-5 py-4 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold tracking-[-0.012em] text-fg">{supplier.name}</p>
            <div className="mt-1">
              <TaxNumber value={supplier.taxNumber} />
            </div>
          </div>
          <PillButton
            onClick={() => {
              setError(null);
              setEditing(true);
            }}
          >
            Düzenle
          </PillButton>
        </div>

        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          <Fact label="Kategori" value={supplier.category} />
          <Fact label="Telefon" value={supplier.phone} />
          <Fact label="E-posta" value={supplier.email} />
          <Fact label="Web" value={supplier.website} />
          <Fact label="Adres" value={supplier.address} />
          <div className="min-w-0">
            <dt className="font-mono text-[8.5px] font-semibold tracking-[0.17em] text-fg-3 uppercase">
              Ödeme koşulları
            </dt>
            <dd className="mt-0.5">
              {/*
                ⚠️ SERBEST METİN OLARAK BASILIR — ayrıştırılmaz (§1.2).
                "60 gün" rozeti üretmek, sunucuda reddedilen yapısal alanı
                arayüzden geri getirmek olurdu.
              */}
              <PaymentTerms value={supplier.paymentTerms} />
            </dd>
          </div>
        </dl>

        <p className="mt-4 font-mono text-[9px] tracking-[0.12em] text-fg-3 uppercase">
          {formatDate(supplier.createdAt)} tarihinde eklendi
        </p>
      </div>
    );
  }

  return (
    <InlinePanel title="Firmayı düzenle">
      {error === null ? null : <FormError message={error} />}

      <FieldGrid>
        <TextField
          id="edit-name"
          label="Firma adı"
          value={name}
          onChange={setName}
          required
          disabled={pending}
          hint="Adı değiştirmek görüşme aramasını etkiler — sonrasında yeniden indeksleme önerilir."
        />
        <TextField
          id="edit-tax"
          label="Vergi numarası"
          value={taxNumber}
          onChange={setTaxNumber}
          disabled={pending}
        />
        <TextField
          id="edit-category"
          label="Kategori"
          value={category}
          onChange={setCategory}
          disabled={pending}
        />
        <TextField
          id="edit-phone"
          label="Telefon"
          value={phone}
          onChange={setPhone}
          disabled={pending}
        />
        <TextField
          id="edit-email"
          label="E-posta"
          value={email}
          onChange={setEmail}
          disabled={pending}
        />
        <TextField
          id="edit-website"
          label="Web"
          value={website}
          onChange={setWebsite}
          disabled={pending}
        />
        <TextField
          id="edit-address"
          label="Adres"
          value={address}
          onChange={setAddress}
          disabled={pending}
        />
        <TextField
          id="edit-payment-terms"
          label="Ödeme koşulları"
          value={paymentTerms}
          onChange={setPaymentTerms}
          disabled={pending}
          hint="Serbest metin — kendi cümlenizle yazın."
        />
      </FieldGrid>

      <FormActions>
        <GhostButton
          onClick={() => {
            setEditing(false);
          }}
          disabled={pending}
        >
          Vazgeç
        </GhostButton>
        <PrimaryButton
          disabled={pending || name.trim() === ''}
          onClick={() => {
            setPending(true);
            setError(null);

            // ⚠️ Boş dize `null` GÖNDERİLİR (temizle), `undefined` DEĞİL
            // (dokunma). Kullanıcı bir alanı boşalttıysa bunu KASTETMİŞTİR.
            updateSupplier(supplier.id, {
              name: name.trim(),
              taxNumber: taxNumber.trim() === '' ? null : taxNumber.trim(),
              category: category.trim() === '' ? null : category.trim(),
              email: email.trim() === '' ? null : email.trim(),
              phone: phone.trim() === '' ? null : phone.trim(),
              website: website.trim() === '' ? null : website.trim(),
              address: address.trim() === '' ? null : address.trim(),
              paymentTerms: paymentTerms.trim() === '' ? null : paymentTerms.trim(),
            })
              .then((result) => {
                setEditing(false);
                onRenamed(result.staleAfterRename);
              })
              .catch((caught: unknown) => {
                setError(errorMessage(caught));
              })
              .finally(() => {
                setPending(false);
              });
          }}
        >
          {pending ? 'Kaydediliyor…' : 'Kaydet'}
        </PrimaryButton>
      </FormActions>
    </InlinePanel>
  );
}

function Fact({ label, value }: { readonly label: string; readonly value: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[8.5px] font-semibold tracking-[0.17em] text-fg-3 uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 text-[12.5px] break-words text-fg-2">{value ?? '—'}</dd>
    </div>
  );
}

function ContactCreateForm({
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  readonly pending: boolean;
  readonly error: string | null;
  readonly onSubmit: (input: {
    fullName: string;
    title: string;
    email: string;
    phone: string;
  }) => void;
  readonly onCancel: () => void;
}) {
  const [fullName, setFullName] = useState('');
  const [title, setTitle] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  return (
    <InlinePanel title="Yeni kişi">
      {error === null ? null : <FormError message={error} />}

      <FieldGrid>
        <TextField
          id="contact-name"
          label="Ad soyad"
          value={fullName}
          onChange={setFullName}
          required
          disabled={pending}
        />
        <TextField
          id="contact-title"
          label="Unvan"
          value={title}
          onChange={setTitle}
          placeholder="Satış sorumlusu"
          disabled={pending}
        />
        <TextField
          id="contact-phone"
          label="Telefon"
          value={phone}
          onChange={setPhone}
          disabled={pending}
        />
        <TextField
          id="contact-email"
          label="E-posta"
          value={email}
          onChange={setEmail}
          disabled={pending}
        />
      </FieldGrid>

      <FormActions>
        <GhostButton onClick={onCancel} disabled={pending}>
          Vazgeç
        </GhostButton>
        <PrimaryButton
          disabled={pending || fullName.trim() === ''}
          onClick={() => {
            onSubmit({ fullName, title, email, phone });
          }}
        >
          {pending ? 'Kaydediliyor…' : 'Kaydet'}
        </PrimaryButton>
      </FormActions>
    </InlinePanel>
  );
}
