'use client';

import { MAX_MOVEMENT_NOTE_CHARS, type MovementDirection } from '@business-os/contracts';
import { useState } from 'react';

import { GhostButton, InlinePanel, TextField } from '@/components/module-kit/form-kit';
import { FormError } from '@/components/ui/form-error';

/**
 * HAREKET YAZMA FORMU (ADR-0039 §11.3).
 *
 * ============================================================================
 * ⚠️ GİRİŞ VE ÇIKIŞ AYRI, NET İKİ BUTONDUR — TEK DÜĞME + AÇILIR LİSTE DEĞİL
 * ============================================================================
 * ADR-0039 §11.3'ün uyarısı doğrudan buraya uygulanıyor:
 *
 *   _"Arayüzde 'düzeltme' ile 'giriş/çıkış' aynı düğmeye bağlanırsa kullanıcı
 *   sayım sonucunu bir çıkış olarak yazmaya çalışır ve FARK YERİNE MUTLAK
 *   DEĞERİ girer — hata sessiz olur ve stoğu tamamen bozar."_
 *
 * Uygulaması üç kuralı birden taşır:
 *
 *   1. YÖN, MİKTARDAN AYRI SEÇİLİR. Kullanıcı bir işaret yazmaz; iki ayrı
 *      buton vardır ve hangisine bastığı ekranda GÖRÜNÜR kalır.
 *   2. MİKTAR HER ZAMAN POZİTİF girilir (`min="0.001"`). Negatif bir sayı
 *      yönle birlikte ÇİFT İŞARET üretirdi ve toplama sessizce ters çalışırdı
 *      (ADR-0039 §3.1).
 *   3. ⚠️ SAYIM BU FORMDA YOKTUR. Fiziksel sayım AYRI bir akıştır
 *      (`CountForm`) ve ayrı görünür — çünkü orada girilen sayı bir AKIŞ değil
 *      bir ÖLÇÜMDÜR.
 *
 * ⚠️ Bu formun ürettiği hareket ASLA `isCorrection` taşımaz: o bayrağı
 * üretebilen tek yol sayım ucudur (sunucuda da öyle — gövdede böyle bir alan
 * yok).
 */
export function MovementForm({
  itemName,
  unit,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  readonly itemName: string;
  readonly unit: string;
  readonly pending: boolean;
  readonly error: string | null;
  readonly onSubmit: (input: {
    direction: MovementDirection;
    quantity: string;
    note: string;
  }) => void;
  readonly onCancel: () => void;
}) {
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');

  const trimmed = quantity.trim();
  const ready = trimmed !== '' && !pending;

  function submit(direction: MovementDirection): void {
    if (!ready) {
      return;
    }
    onSubmit({ direction, quantity: trimmed, note: note.trim() });
  }

  return (
    <InlinePanel title={`${itemName} — hareket yaz`}>
      {error === null ? null : <FormError message={error} />}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          id="movement-quantity"
          label={`Miktar (${unit})`}
          type="number"
          value={quantity}
          onChange={setQuantity}
          placeholder="0"
          required
          disabled={pending}
          /*
            ⚠️ İPUCU METNİ BİR SÜS DEĞİL: kullanıcıya işaret YAZMAMASI
            gerektiğini söyler. Bu cümle olmasaydı "-5" yazan bir kullanıcı
            sunucudan 422 alır ve sebebini anlamazdı.
          */
          hint="Her zaman POZİTİF girilir; yön aşağıdaki butonla seçilir."
        />
        <TextField
          id="movement-note"
          label="Açıklama (opsiyonel)"
          value={note}
          onChange={setNote}
          placeholder="irsaliye 4412"
          disabled={pending}
          hint={`En fazla ${String(MAX_MOVEMENT_NOTE_CHARS)} karakter. Aramaya girmez.`}
        />
      </div>

      {/*
        ⚠️ İKİ AYRI BUTON — ve ikisi de BİRİNCİL. Biri birincil biri ikincil
        olsaydı, "doğal" olanın hangisi olduğu hakkında bir iddiada bulunmuş
        olurduk; bir depoda giriş de çıkış da günlük işin normalidir.

        Butonlar YÖNÜ ADIYLA söyler ("Giriş yaz" / "Çıkış yaz") — bir ok ikonu
        ya da renk tek başına yeterli olmazdı (FRONTEND §4.8).
      */}
      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          disabled={!ready}
          onClick={() => {
            submit('in');
          }}
          className={ACTION_IN}
        >
          Giriş yaz
        </button>
        <button
          type="button"
          disabled={!ready}
          onClick={() => {
            submit('out');
          }}
          className={ACTION_OUT}
        >
          Çıkış yaz
        </button>
        <GhostButton onClick={onCancel} disabled={pending}>
          Vazgeç
        </GhostButton>
      </div>

      {/*
        ⚠️ MEVCUTTAN FAZLA ÇIKIŞ ENGELLENMEZ (ADR-0039 §Alternatifler) — ve
        kullanıcı bunu ÖNCEDEN bilmelidir. Engellemek işletmeyi yalan söylemeye
        iterdi (satış kaydını girip irsaliyeyi bekleyen kullanıcı); negatif stok
        kayda geçer ve listede kritik olarak görünür.
      */}
      <p className="mt-3 text-[11.5px] leading-[1.6] text-fg-3">
        Mevcuttan fazla çıkış yazılabilir; stok negatife düşerse kayıt tutulur ve listede
        <span className="font-semibold text-danger"> kritik </span>
        olarak işaretlenir. Fiziksel sayım bunu düzeltmenin yoludur.
      </p>
    </InlinePanel>
  );
}

const ACTION_BASE =
  'inline-flex min-h-11 items-center rounded-[11px] px-4 text-[12.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45';

const ACTION_IN = `${ACTION_BASE} bg-accent text-accent-fg hover:opacity-90`;

/*
 * ⚠️ Çıkış butonu DOLGU DEĞİL ÇERÇEVE taşır ve bu bir hiyerarşi iddiası
 * değildir: iki dolu buton yan yana durduğunda göz hangisine basacağını
 * seçemez. Fark yalnızca GÖRSEL AYIRT EDİCİLİK içindir — ikisi de aynı boyutta,
 * aynı dokunma hedefinde ve aynı erişilebilir ağırlıkta.
 */
const ACTION_OUT = `${ACTION_BASE} border border-accent text-ink hover:bg-tint`;
