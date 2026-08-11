'use client';

import {
  createFinanceTransactionSchema,
  DIRECTION_LABELS,
  type CreateFinanceTransactionRequest,
  type FinanceCategory,
  type FinanceDirection,
  type FinanceTransactionRow,
} from '@business-os/contracts';
import { useState } from 'react';

import {
  FieldGrid,
  FormActions,
  GhostButton,
  InlinePanel,
  SelectField,
  TextAreaField,
  TextField,
} from '@/components/module-kit/form-kit';
import { PrimaryButton } from '@/components/module-kit/chrome';
import { FormError } from '@/components/ui/form-error';
import {
  emptyToNull,
  fieldErrors,
  NO_FIELD_ERRORS,
  type FieldErrors,
} from '@/components/module-kit/field-errors';

/** Bugünün takvim günü — `<input type="date">` ile aynı biçim. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Gelir/gider kaydı formu.
 *
 * ============================================================================
 * ⚠️ KATEGORİ LİSTESİ YÖNE GÖRE DARALIR
 * ============================================================================
 * Bir gelir kaydına gider kategorisi seçilemez — bileşik FK bunu veritabanı
 * seviyesinde zaten imkânsız kılıyor (ADR-0034 §3c) ve sunucu 422 döndürüyor.
 * Formun işi o hatayı ÖNCEDEN engellemektir: yön değişince seçim TEMİZLENİR.
 *
 * Temizlememek daha "kibar" görünürdü ve yanlış olurdu: kullanıcı seçtiği
 * kategoriyi ekranda görürken kaydet düğmesine basıp 422 alırdı.
 *
 * ⚠️ ARŞİVLENMİŞ kategoriler listeye HİÇ GİRMEZ (`includeArchived` gönderilmez):
 * arşivlemenin var olma sebebi tam olarak budur.
 */
export function TransactionForm({
  initial,
  categories,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  initial?: FinanceTransactionRow;
  categories: readonly FinanceCategory[];
  pending: boolean;
  error: string | null;
  onSubmit: (body: CreateFinanceTransactionRequest) => void;
  onCancel: () => void;
}) {
  const [direction, setDirection] = useState<FinanceDirection>(initial?.direction ?? 'expense');
  const [amount, setAmount] = useState(initial?.amount ?? '');
  const [currency, setCurrency] = useState(initial?.currency ?? 'TRY');
  const [occurredOn, setOccurredOn] = useState(initial?.occurredOn ?? today());
  const [description, setDescription] = useState(initial?.description ?? '');
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '');
  const [errors, setErrors] = useState<FieldErrors>(NO_FIELD_ERRORS);

  const selectable = categories.filter((category) => category.direction === direction);

  function submit(): void {
    const parsed = createFinanceTransactionSchema.safeParse({
      direction,
      amount: amount.trim(),
      currency: currency.trim(),
      occurredOn,
      description: emptyToNull(description),
      categoryId: categoryId === '' ? null : categoryId,
    });

    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }

    setErrors(NO_FIELD_ERRORS);
    onSubmit(parsed.data);
  }

  return (
    <InlinePanel title={initial ? 'Kaydı düzenle' : 'Yeni kayıt'}>
      <FieldGrid>
        <SelectField
          id="tx-direction"
          label="Yön"
          value={direction}
          onChange={(value) => {
            setDirection(value === 'income' ? 'income' : 'expense');
            // ⚠️ Seçim TEMİZLENİR — gerekçe dosya başında.
            setCategoryId('');
          }}
          options={[
            { value: 'expense', label: DIRECTION_LABELS.expense },
            { value: 'income', label: DIRECTION_LABELS.income },
          ]}
        />

        <TextField
          id="tx-occurred"
          label="Tarih"
          type="date"
          value={occurredOn}
          onChange={setOccurredOn}
          required
          disabled={pending}
          error={errors.occurredOn ?? null}
        />

        <TextField
          id="tx-amount"
          label="Tutar"
          value={amount}
          onChange={setAmount}
          placeholder="1500.50"
          required
          disabled={pending}
          error={errors.amount ?? null}
          hint="En fazla iki ondalık. Ondalık ayracı NOKTA."
        />

        <TextField
          id="tx-currency"
          label="Para birimi"
          value={currency}
          onChange={setCurrency}
          placeholder="TRY"
          required
          disabled={pending}
          error={errors.currency ?? null}
          hint="Üç harfli kod. Farklı para birimleri TOPLANMAZ."
        />

        <SelectField
          id="tx-category"
          label="Kategori"
          value={categoryId}
          onChange={setCategoryId}
          disabled={pending}
          options={[
            { value: '', label: 'Kategorisiz' },
            ...selectable.map((category) => ({ value: category.id, label: category.name })),
          ]}
          hint={
            selectable.length === 0
              ? 'Bu yönde kategori yok — Kategoriler sekmesinden açabilirsiniz.'
              : 'Sonradan da seçebilirsiniz.'
          }
        />
      </FieldGrid>

      <TextAreaField
        id="tx-description"
        label="Açıklama"
        value={description}
        onChange={setDescription}
        rows={3}
        disabled={pending}
        error={errors.description ?? null}
        hint="Listede görünür. Yapay zekâ bu alanı OKUMAZ — dönem yorumları için Nakit akışı sekmesini kullanın."
      />

      <FormError message={error} />

      <FormActions>
        <PrimaryButton type="button" disabled={pending} onClick={submit}>
          {pending ? 'Kaydediliyor…' : 'Kaydet'}
        </PrimaryButton>
        <GhostButton disabled={pending} onClick={onCancel}>
          Vazgeç
        </GhostButton>
      </FormActions>
    </InlinePanel>
  );
}
