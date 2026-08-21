'use client';

import type { Supplier } from '@business-os/contracts';
import { MAX_PAYMENT_TERMS_CHARS } from '@business-os/contracts';
import { useCallback, useEffect, useState } from 'react';

import { EmptyState, Pager, PillButton, PrimaryButton, RISE } from '@/components/module-kit/chrome';
import {
  FieldGrid,
  FormActions,
  GhostButton,
  InlinePanel,
  TextField,
} from '@/components/module-kit/form-kit';
import {
  CardHeader,
  CardMeta,
  CardTitleLink,
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
import { createSupplier, listSuppliers } from '@/lib/api/suppliers';
import { formatDate, PaymentTerms, TaxNumber } from './chrome';
import { SuppliersWall } from './suppliers-wall';
import { SupplierTabs } from './tabs';

export const PAGE_SIZE = 20;

/**
 * TEDARİKÇİ ODASI — firma listesi (ADR-0040 §8.2).
 *
 * Üstte ORTAK duvar, altta tezgah. İkinci rota
 * (`/app/suppliers/interactions`) AYNI duvarı kullanır: ikisi de _"tedarikçi
 * ilişkilerimiz ne durumda"_ sorusunu cevaplıyor (ADR-0038 §6.5).
 *
 * ============================================================================
 * ⚠️ ARAMA SUNUCUDA — ve bu, bu modülde ÖZELLİKLE önemli
 * ============================================================================
 * `search` parametresi ad VE vergi numarası üzerinde çalışır. Randevu'nun
 * "kişi filtresi istemcide" bilinen sınırı burada TEKRARLANMADI, çünkü sonucu
 * daha ağır olurdu: kullanıcı aradığı firmayı bulamayıp "yok" sanır ve AYNI
 * FİRMAYI İKİNCİ KEZ açar. O gün görüşme geçmişi — yani AI'ın hafızası —
 * ikiye bölünür (§1.1).
 *
 * ============================================================================
 * ⚠️ BU EKRANDA BİR "DURUM" SÜTUNU YOKTUR
 * ============================================================================
 * Ne aşama, ne risk rozeti, ne "durgun" işareti. Üçü de ADR §2.1 ve §3.2'nin
 * doğrudan sonucudur: tedarikçinin türetilebilir bir DURUMU yoktur. Bir sütun
 * eklemek, sunucuda reddedilen yapısal katkıcıyı arayüzden geri getirmek
 * olurdu.
 */
export function SuppliersListScreen() {
  const [items, setItems] = useState<readonly Supplier[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [search, setSearch] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);

    // ⚠️ Alanlar KOŞULLU eklenir, `undefined` ATANMAZ:
    // `exactOptionalPropertyTypes` altında "alan yok" ile "alan var ama
    // undefined" AYRI tiplerdir.
    listSuppliers({
      limit: PAGE_SIZE,
      offset,
      ...(search.trim() === '' ? {} : { search: search.trim() }),
    })
      .then((page) => {
        if (!active) {
          return;
        }
        setItems(page.items);
        setTotal(page.total);
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
  }, [offset, search, reloadToken]);

  const create = useCallback(
    (input: {
      name: string;
      taxNumber: string;
      category: string;
      email: string;
      phone: string;
      paymentTerms: string;
    }) => {
      setCreating(true);
      setCreateError(null);

      createSupplier({
        name: input.name,
        // ⚠️ Boş alanlar GÖNDERİLMEZ. Sunucu boş dizeyi zaten `null`a çevirir
        // ama göndermemek niyeti açık tutar: "girilmedi" ile "boş girildi" aynı
        // şeydir (§1).
        ...(input.taxNumber.trim() === '' ? {} : { taxNumber: input.taxNumber.trim() }),
        ...(input.category.trim() === '' ? {} : { category: input.category.trim() }),
        ...(input.email.trim() === '' ? {} : { email: input.email.trim() }),
        ...(input.phone.trim() === '' ? {} : { phone: input.phone.trim() }),
        ...(input.paymentTerms.trim() === '' ? {} : { paymentTerms: input.paymentTerms.trim() }),
      })
        .then(() => {
          setCreateOpen(false);
          setOffset(0);
          setReloadToken((token) => token + 1);
        })
        .catch((caught: unknown) => {
          // ⚠️ 409 (aynı vergi no) BURAYA DÜŞER ve mesajı sunucudan gelir:
          // "Bu vergi numarası zaten kayıtlı … karşılaştırma büyük/küçük harf
          // duyarsızdır." Kendi metnimizi yazsaydık harf duyarsızlığı
          // söylenmezdi ve kullanıcı `TR-1` ile `tr-1`i farklı sanardı.
          setCreateError(errorMessage(caught));
        })
        .finally(() => {
          setCreating(false);
        });
    },
    [],
  );

  return (
    <Room>
      <RoomScroll>
        <RoomTop
          name="Tedarikçi"
          meta={`${String(total)} firma`}
          action={
            <PillButton
              onClick={() => {
                setCreateError(null);
                setCreateOpen((open) => !open);
              }}
            >
              {createOpen ? 'Kapat' : 'Tedarikçi ekle'}
            </PillButton>
          }
        />

        {/* ⚠️ ORTAK DUVAR — görüşme akışı rotası da AYNI bileşeni kullanır. */}
        <SuppliersWall total={total} items={items} loading={loading} />

        <Desk>
          <DeskHead title="Tedarikçiler" right={<SupplierTabs active="suppliers" />} />
          <DeskBody>
            {error === null ? null : <FormError message={error} />}

            {createOpen ? (
              <SupplierCreateForm
                pending={creating}
                error={createError}
                onSubmit={create}
                onCancel={() => {
                  setCreateOpen(false);
                }}
              />
            ) : null}

            <Rise delay={RISE.body}>
              <div className="grid grid-cols-1">
                <TextField
                  id="supplier-search"
                  label="Ara"
                  value={search}
                  onChange={(next) => {
                    setOffset(0);
                    setSearch(next);
                  }}
                  placeholder="Yıldız Civata veya 1234567890"
                  hint="Ad ve vergi numarasında, sunucuda aranır; büyük/küçük harf ayrımı yok."
                />
              </div>
            </Rise>

            {loading ? (
              <DeskSkeleton />
            ) : items.length === 0 ? (
              <EmptyState
                title="Tedarikçi yok"
                hint={
                  search.trim() === ''
                    ? 'Henüz tedarikçi eklenmedi. Firma ekleyip görüşme yazdığınızda konuşulanlar asistanın hafızasına girer.'
                    : 'Aramanızla eşleşen tedarikçi bulunamadı.'
                }
              />
            ) : (
              <Rise delay={RISE.body}>
                <div className="flex flex-col gap-2">
                  {items.map((row) => (
                    <RecordCard key={row.id}>
                      <CardHeader>
                        <CardTitleLink href={`/app/suppliers/${row.id}`}>{row.name}</CardTitleLink>
                        <TaxNumber value={row.taxNumber} />
                      </CardHeader>

                      <div className="mt-1.5">
                        {/*
                          ⚠️ ÖDEME KOŞULU OLDUĞU GİBİ BASILIR — hiçbir şey
                          ayrıştırılmaz (§1.2). Bir "60 gün" rozeti üretmek,
                          sunucuda reddedilen yapısal alanı arayüzden geri
                          getirmek olurdu.
                        */}
                        <PaymentTerms value={row.paymentTerms} />
                      </div>

                      <CardMeta items={[row.category, row.phone, formatDate(row.createdAt)]} />
                    </RecordCard>
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
                setOffset((current) => Math.max(0, current - PAGE_SIZE));
              }}
              onNext={() => {
                setOffset((current) => current + PAGE_SIZE);
              }}
            />
          </DeskBody>
        </Desk>
      </RoomScroll>
    </Room>
  );
}

/**
 * Tedarikçi açma formu.
 *
 * ⚠️ BİR "AŞAMA" YA DA "DURUM" ALANI YOKTUR (§2.1) ve olmayacaktır: satın
 * almada belirsizlik tedarikçide değil SİPARİŞTEDİR. Buraya bir `stage`
 * eklemek, ADR-0036'nın eşiğini de birlikte getirir.
 *
 * ⚠️ ÖDEME KOŞULU TEK SATIRLIK BİR METİN ALANIDIR — üç ayrı sayısal alan
 * (`netDays`, `discountPercent`, `discountDays`) DEĞİL. Kolon hiçbir kısıt
 * taşımıyor; yapısal hâle getirmek taşımadığı bir kesinliği ima ederdi.
 */
function SupplierCreateForm({
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  readonly pending: boolean;
  readonly error: string | null;
  readonly onSubmit: (input: {
    name: string;
    taxNumber: string;
    category: string;
    email: string;
    phone: string;
    paymentTerms: string;
  }) => void;
  readonly onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [taxNumber, setTaxNumber] = useState('');
  const [category, setCategory] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('');

  return (
    <InlinePanel title="Yeni tedarikçi">
      {error === null ? null : <FormError message={error} />}

      <FieldGrid>
        <TextField
          id="supplier-name"
          label="Firma adı"
          value={name}
          onChange={setName}
          placeholder="Yıldız Civata"
          required
          disabled={pending}
        />
        <TextField
          id="supplier-tax"
          label="Vergi numarası"
          value={taxNumber}
          onChange={setTaxNumber}
          placeholder="1234567890"
          disabled={pending}
          // ⚠️ İpucu tekilliği SÖYLER: alan opsiyoneldir ama boş bırakılan her
          // kayıt, aynı firmanın ikinci kez açılmasına kapı açar (§1.1).
          hint="Zorunlu değil ama aynı firmayı iki kez açmayı önleyen tek alan budur."
        />
        <TextField
          id="supplier-category"
          label="Kategori"
          value={category}
          onChange={setCategory}
          placeholder="hammadde"
          disabled={pending}
        />
        <TextField
          id="supplier-phone"
          label="Telefon"
          value={phone}
          onChange={setPhone}
          placeholder="0212 000 00 00"
          disabled={pending}
        />
        <TextField
          id="supplier-email"
          label="E-posta"
          value={email}
          onChange={setEmail}
          placeholder="info@yildizcivata.com"
          disabled={pending}
        />
        <TextField
          id="supplier-payment-terms"
          label="Ödeme koşulları"
          value={paymentTerms}
          onChange={setPaymentTerms}
          placeholder="60 gün vadeli, 10 gün içinde ödemede %2 iskonto"
          disabled={pending}
          hint={`Serbest metin — kendi cümlenizle yazın. En fazla ${String(MAX_PAYMENT_TERMS_CHARS)} karakter.`}
        />
      </FieldGrid>

      <FormActions>
        <GhostButton onClick={onCancel} disabled={pending}>
          Vazgeç
        </GhostButton>
        <PrimaryButton
          disabled={pending || name.trim() === ''}
          onClick={() => {
            onSubmit({ name, taxNumber, category, email, phone, paymentTerms });
          }}
        >
          {pending ? 'Kaydediliyor…' : 'Kaydet'}
        </PrimaryButton>
      </FormActions>
    </InlinePanel>
  );
}
