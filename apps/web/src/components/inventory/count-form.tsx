'use client';

import {
  MAX_MOVEMENT_NOTE_CHARS,
  MOVEMENT_DIRECTION_LABELS,
  type CountResult,
} from '@business-os/contracts';
import { useState } from 'react';

import { GhostButton, InlinePanel, TextField } from '@/components/module-kit/form-kit';
import { PrimaryButton } from '@/components/module-kit/chrome';
import { FormError } from '@/components/ui/form-error';

/**
 * FİZİKSEL SAYIM EKRANI (ADR-0039 §3.2, §11.3).
 *
 * ============================================================================
 * ⚠️ BU BİLEŞENDE FARK (DELTA) HİÇBİR YERDE HESAPLANMAZ VE GÖSTERİLMEZ
 * ============================================================================
 * Bu, bu ekranın var oluş kuralıdır ve kapanış denetiminin ayrı bir maddesidir.
 *
 * Bileşen MEVCUT MİKTARI PROP OLARAK BİLE ALMAZ. Alsaydı, ekranda
 * "12 → 9 (‑3)" gibi bir önizleme göstermek bir satır kod olurdu ve o satır
 * SESSİZ BİR YALAN üretirdi: istemcinin okuduğu miktar ile isteğin sunucuya
 * ulaştığı an arasında başka bir hareket yazılabilir. O durumda ekranda
 * gösterilen fark ile sunucunun yazdığı düzeltme AYRIŞIR — ve kullanıcı
 * ekrandakine inanır.
 *
 * Doğru sıra: kullanıcı SAYDIĞINI yazar → sunucu kalem satırını
 * `SELECT ... FOR UPDATE` ile kilitler → mevcut miktarı türetir → farkı
 * hesaplar → düzeltme hareketini yazar → SONUCU döner. Ekran yalnızca o
 * SONUCU gösterir.
 *
 * ⚠️ Bileşenin `currentQuantity` gibi bir prop'u YOKTUR ve eklenmemelidir —
 * bir birim testi bunu kilitliyor (`count-form.spec.tsx`).
 *
 * ============================================================================
 * ⚠️ `adjusted: false` BİR HATA DEĞİLDİR — VE SÖYLENMEK ZORUNDADIR
 * ============================================================================
 * Sayım tuttuysa sunucu hiçbir satır yazmaz (olmamış bir akışı deftere yazmak
 * yalan olurdu — ADR-0039 §3.2). Ekran bunu AÇIKÇA söylemezse kullanıcı
 * işlemin başarısız olduğunu sanar ve tekrar tekrar dener.
 *
 * ⚠️ Bunun bedeli de kayıtlıdır (ADR-0039 § Bilinen sınırlar): "sayım yapıldı
 * ve tuttu" bilgisi HİÇBİR YERDE kalmaz. Bir sayım günlüğü v2'dir; bugün onu
 * uydurma bir hareketle temsil etmek defteri kirletmek olurdu.
 */
export function CountForm({
  itemName,
  unit,
  pending,
  error,
  result,
  onSubmit,
  onCancel,
}: {
  readonly itemName: string;
  readonly unit: string;
  readonly pending: boolean;
  readonly error: string | null;
  /** ⚠️ SUNUCUDAN dönen sonuç — istemcide türetilmiş hiçbir sayı içermez. */
  readonly result: CountResult | null;
  readonly onSubmit: (input: { countedQuantity: string; note: string }) => void;
  readonly onCancel: () => void;
}) {
  const [counted, setCounted] = useState('');
  const [note, setNote] = useState('');

  const trimmed = counted.trim();
  const ready = trimmed !== '' && !pending;

  return (
    <InlinePanel title={`${itemName} — fiziksel sayım`}>
      {error === null ? null : <FormError message={error} />}

      <p className="mb-4 max-w-[62ch] text-[12.5px] leading-[1.6] text-fg-2">
        Depoda <span className="font-semibold text-fg">saydığınız</span> miktarı yazın — farkı
        değil. Sunucu mevcut stoğu kilit altında okur, farkı kendisi hesaplar ve gerekiyorsa bir
        düzeltme hareketi yazar.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          id="count-quantity"
          label={`Sayılan miktar (${unit})`}
          type="number"
          value={counted}
          onChange={setCounted}
          placeholder="0"
          required
          disabled={pending}
          hint="Rafta gerçekten kaç tane olduğunu yazın."
        />
        <TextField
          id="count-note"
          label="Açıklama (opsiyonel)"
          value={note}
          onChange={setNote}
          placeholder="yıl sonu sayımı"
          disabled={pending}
          hint={`En fazla ${String(MAX_MOVEMENT_NOTE_CHARS)} karakter.`}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <PrimaryButton
          onClick={() => {
            if (ready) {
              onSubmit({ countedQuantity: trimmed, note: note.trim() });
            }
          }}
          disabled={!ready}
        >
          {pending ? 'Sayım işleniyor…' : 'Sayımı kaydet'}
        </PrimaryButton>
        <GhostButton onClick={onCancel} disabled={pending}>
          Vazgeç
        </GhostButton>
      </div>

      {result === null ? null : <CountOutcome result={result} unit={unit} />}
    </InlinePanel>
  );
}

/**
 * SAYIM SONUCU — TAMAMEN SUNUCUDAN.
 *
 * ⚠️ Buradaki her sayı `result` içinden gelir. Hiçbiri istemcide hesaplanmaz:
 * `quantity` sunucunun onayladığı yeni miktardır, düzeltme miktarı ve yönü ise
 * sunucunun YAZDIĞI hareketin kendisidir.
 *
 * ⚠️ `result.movement.quantity` gösterilir ama bu bir "fark önizlemesi" DEĞİL
 * bir OLGUDUR: deftere yazılmış satırın miktarı. Aradaki fark zamanlamadır —
 * bu sayı yazıldıktan SONRA okunuyor, önce tahmin edilmiyor.
 */
function CountOutcome({ result, unit }: { readonly result: CountResult; readonly unit: string }) {
  if (!result.adjusted) {
    return (
      <div className="mt-4 rounded-card border border-border bg-sunken px-3.5 py-2.5">
        <p className="text-[12.5px] font-semibold text-fg">Sayım tuttu — düzeltme gerekmedi.</p>
        <p className="mt-1 text-[11.5px] leading-[1.6] text-fg-3">
          Kayıtlı stok {result.quantity} {unit} ve saydığınız miktar aynı. Deftere hiçbir satır
          yazılmadı; bu bir hata değildir.
        </p>
      </div>
    );
  }

  const movement = result.movement;

  return (
    <div className="mt-4 rounded-card border border-accent bg-tint px-3.5 py-2.5">
      <p className="text-[12.5px] font-semibold text-fg">
        Sayım kaydedildi — stok {result.quantity} {unit} olarak güncellendi.
      </p>
      {movement === null ? null : (
        <p className="mt-1 text-[11.5px] leading-[1.6] text-fg-2">
          Deftere{' '}
          <span className="font-semibold">
            {MOVEMENT_DIRECTION_LABELS[movement.direction].toLocaleLowerCase('tr-TR')} yönünde{' '}
            {movement.quantity} {unit}
          </span>{' '}
          düzeltme hareketi yazıldı. ⚠️ Bu hareket geri alınamaz ve düzenlenemez; defter
          değiştirilemez.
        </p>
      )}
    </div>
  );
}
