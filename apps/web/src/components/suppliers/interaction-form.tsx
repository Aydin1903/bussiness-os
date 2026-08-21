'use client';

import { MAX_INTERACTION_BODY_CHARS, type Supplier } from '@business-os/contracts';
import { useState } from 'react';

import { PrimaryButton } from '@/components/module-kit/chrome';
import {
  FieldGrid,
  FormActions,
  GhostButton,
  InlinePanel,
  SelectField,
  TextAreaField,
  TextField,
} from '@/components/module-kit/form-kit';
import { FormError } from '@/components/ui/form-error';

/**
 * GÖRÜŞME YAZMA FORMU (ADR-0040 §1, §2.2).
 *
 * ============================================================================
 * ⚠️ BU FORM "DÜZENLE" MODUNDA AÇILAMAZ — VE BU BİR EKSİK DEĞİL
 * ============================================================================
 * Günlük EKLEME-YALNIZDIR: sunucuda `PATCH`/`DELETE` ucu yok, izin adı
 * `create` (`write` DEĞİL), entity'de `update` metodu yok. Bir "düzenle"
 * düğmesi eklemek, dördünü birden yalanlayan bir arayüz olurdu.
 *
 * ⚠️ Kullanıcıya bu AÇIKÇA söylenir (aşağıdaki ipucu). Söylenmeseydi kayıt
 * yazan biri "sonra düzeltirim" diye aceleyle yazar ve düzeltemediğini
 * ANCAK SONRA öğrenirdi.
 *
 * ============================================================================
 * ⚠️ KARAKTER SAYACI SERTTİR — SESSİZ KIRPMA YASAK (§2.2)
 * ============================================================================
 * Sınır `contracts`taki TEK kaynaktan gelir (`MAX_INTERACTION_BODY_CHARS`,
 * sunucuda `TARGET_CHUNK_CHARS`a eşitlenmiş). Bu modülde chunk tablosu YOKTUR:
 * metin TEK bir vektöre gömülür, dolayısıyla bir parçanın büyüklüğünde kalmak
 * zorundadır.
 *
 * Aşılırsa sunucu **422** döner ve kırpmaz. Buradaki sayaç o reddi ÖNCEDEN
 * görünür kılar; iki tarafta ayrı sayı yazılsaydı kullanıcı "1250/1250, tamam"
 * görür ve sunucudan hata alırdı.
 *
 * ⚠️ Uzun bir e-posta zincirinin doğru yeri BU ALAN DEĞİL, Belge modülüdür —
 * ipucu bunu söyler. Yalnızca "çok uzun" demek, kullanıcıyı metni keserek
 * yarısını KAYBETMEYE iterdi.
 */
export function InteractionForm({
  suppliers,
  contacts,
  supplierId,
  onSupplierChange,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  /** Tedarikçi seçici için; detay sayfasında BOŞ geçilir. */
  readonly suppliers: readonly Supplier[];
  /**
   * ⚠️ Yalnızca SEÇİLİ tedarikçinin kişileri gelir. Tüm kişileri listelemek,
   * başka bir tedarikçinin kişisini seçtirirdi ve sunucu **404** dönerdi
   * (§1.3) — kullanıcı sebebini anlayamazdı.
   */
  readonly contacts: readonly { id: string; fullName: string }[];
  /**
   * ⚠️ TEDARİKÇİ SEÇİMİ KONTROLLÜDÜR — form onu kendi içinde TUTMAZ.
   *
   * Sebep §1.3'tür: kişi listesi SEÇİLİ TEDARİKÇİYE bağlıdır ve onu çağıran
   * çeker. Seçim formun içinde kalsaydı çağıran hangi firmanın kişilerini
   * isteyeceğini BİLEMEZDİ — ya hepsini listelerdi (başka firmanın kişisi
   * seçilir, sunucu **404** döner, kullanıcı sebebini anlamaz) ya da bir
   * "köprü" bileşeniyle seçimi dışarı sızdırırdı.
   *
   * ⚠️ Detay sayfasında bu değer SABİTTİR ve `onSupplierChange` verilmez —
   * seçici o zaman hiç gösterilmez.
   */
  readonly supplierId: string;
  readonly onSupplierChange?: (id: string) => void;
  readonly pending: boolean;
  readonly error: string | null;
  readonly onSubmit: (input: {
    supplierId: string;
    contactId: string;
    occurredOn: string;
    body: string;
  }) => void;
  readonly onCancel: () => void;
}) {
  const [contactId, setContactId] = useState('');
  const [occurredOn, setOccurredOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [body, setBody] = useState('');

  const tooLong = body.trim().length > MAX_INTERACTION_BODY_CHARS;
  const incomplete = supplierId === '' || body.trim() === '';

  return (
    <InlinePanel title="Yeni görüşme">
      {error === null ? null : <FormError message={error} />}

      <FieldGrid>
        {onSupplierChange === undefined ? null : (
          <SelectField
            id="interaction-supplier"
            label="Tedarikçi"
            value={supplierId}
            onChange={(next) => {
              onSupplierChange(next);
              // ⚠️ Tedarikçi değişince kişi SIFIRLANIR: eski seçim artık başka
              // bir firmanın kişisidir ve sunucu onu 404 ile reddederdi (§1.3).
              setContactId('');
            }}
            options={[
              { value: '', label: 'Seçin…' },
              ...suppliers.map((row) => ({ value: row.id, label: row.name })),
            ]}
            disabled={pending}
          />
        )}

        <SelectField
          id="interaction-contact"
          label="Kişi"
          value={contactId}
          onChange={setContactId}
          options={[
            { value: '', label: 'Belirtilmedi' },
            ...contacts.map((row) => ({ value: row.id, label: row.fullName })),
          ]}
          disabled={pending || supplierId === ''}
          // ⚠️ Boş bırakmak MEŞRUDUR: santral, genel e-posta, ilk temas.
          hint="Zorunlu değil — santral ya da genel e-posta üzerinden görüşüldüyse boş bırakın."
        />

        <TextField
          id="interaction-date"
          label="Görüşme tarihi"
          type="date"
          value={occurredOn}
          onChange={setOccurredOn}
          disabled={pending}
          // ⚠️ SAAT SORULMAZ: bir tedarikçi görüşmesinin saati anlamlı bir
          // boyut değildir (`date` kolonu). Randevu'nun tersi karar.
          hint="Gün yeterli; saat kaydedilmez."
        />
      </FieldGrid>

      <div className="mt-4">
        <TextAreaField
          id="interaction-body"
          label="Ne konuşuldu"
          value={body}
          onChange={setBody}
          rows={6}
          placeholder="Fiyat listesi güncellendi, M8 vidada %6 zam. Mart sonuna kadar eski fiyat geçerli."
          disabled={pending}
          error={
            tooLong
              ? `Metin çok uzun: ${String(body.trim().length)} / ${String(MAX_INTERACTION_BODY_CHARS)} karakter.`
              : null
          }
          hint={`${String(body.trim().length)} / ${String(MAX_INTERACTION_BODY_CHARS)} karakter · Kayıt sonradan düzenlenemez ve silinemez — yanlışsa yenisi yazılır. Uzun bir yazışma metnini belge olarak yüklemek daha doğrudur.`}
        />
      </div>

      <FormActions>
        <GhostButton onClick={onCancel} disabled={pending}>
          Vazgeç
        </GhostButton>
        <PrimaryButton
          disabled={pending || incomplete || tooLong}
          onClick={() => {
            onSubmit({ supplierId, contactId, occurredOn, body });
          }}
        >
          {pending ? 'Kaydediliyor…' : 'Kaydet'}
        </PrimaryButton>
      </FormActions>
    </InlinePanel>
  );
}
