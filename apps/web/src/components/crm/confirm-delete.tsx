'use client';

import { useState } from 'react';

import { CardAction } from './record-card';

/**
 * İki adımlı silme onayı — SATIR İÇİ.
 *
 * ============================================================================
 * NEDEN `window.confirm` DEĞİL
 * ============================================================================
 * İki gerekçe, ikisi de bağlayıcı:
 *
 * 1. TASARIM — tarayıcının kendi diyaloğu işletim sisteminin yüzeyidir;
 *    Atölye'nin sıcak paleti, tipografisi ve köşeleri orada yoktur. Ürünün en
 *    geri alınamaz eylemi, ürüne hiç benzemeyen bir kutuda sorulurdu.
 *
 * 2. ODAK — `confirm()` iş parçacığını bloklar ve testte/otomasyonda ekranı
 *    tümden kilitler.
 *
 * ============================================================================
 * NEDEN İKİ ADIM
 * ============================================================================
 * Silme GERİ ALINAMAZ ve şirkette CASCADE'dir: kişiler ve görüşmeler de gider,
 * yani AI hafızasından da silinir (ADR-0031 §7). Tek tıklık bir "Sil", yanlış
 * karta basmayı kalıcı veri kaybına çevirirdi. İkinci adım, NE'nin gideceğini
 * de açıkça yazar — "emin misiniz" tek başına bilgi taşımaz.
 */
export function ConfirmDelete({
  question,
  confirmLabel = 'Evet, sil',
  pending = false,
  ariaLabel,
  onConfirm,
}: {
  /** NE'nin silineceğini açıkça söyleyen cümle. */
  question: string;
  confirmLabel?: string;
  pending?: boolean;
  /** Ekran okuyucu adı — aynı sayfadaki diğer "Sil" düğmelerinden ayırır. */
  ariaLabel?: string;
  onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <CardAction
        danger
        {...(ariaLabel === undefined ? {} : { ariaLabel })}
        onClick={() => {
          setArmed(true);
        }}
      >
        Sil
      </CardAction>
    );
  }

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-end gap-x-2.5 gap-y-1.5 rounded-[11px] bg-fill px-3 py-2"
    >
      <p className="text-[11.5px] leading-[1.5] text-fg-2">{question}</p>

      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={pending}
          onClick={onConfirm}
          className={[
            'rounded-[9px] px-2.5 py-1.5 text-[11.5px] font-semibold tracking-[-0.004em]',
            'text-danger transition-colors duration-150 hover:bg-fill-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
          ].join(' ')}
        >
          {pending ? 'Siliniyor…' : confirmLabel}
        </button>

        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setArmed(false);
          }}
          className={[
            'rounded-[9px] px-2.5 py-1.5 text-[11.5px] font-medium tracking-[-0.004em]',
            'text-fg-3 transition-colors duration-150 hover:bg-fill-2 hover:text-fg',
            'disabled:cursor-not-allowed disabled:opacity-50',
          ].join(' ')}
        >
          Vazgeç
        </button>
      </div>
    </div>
  );
}
