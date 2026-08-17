'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { UserIcon } from '@/components/icons';
import { logout } from '@/lib/session/logout';
import { useTheme } from '@/lib/theme/theme-provider';
import type { ThemeChoice } from '@/lib/theme/theme';

/**
 * Tema seçimi — ÜÇ DURUM, iki değil (ADR-0038 Dilim 1).
 *
 * İkili bir anahtar (açık/koyu) kullanıcıyı bir tarafı seçmeye ZORLAR ve
 * "işletim sistemimi takip et" seçeneğini yok eder — oysa varsayılan davranış
 * budur ve geri dönülebilir olmalıdır.
 *
 * ⚠️ Etiketler renk DEĞİL, sözcük taşır. Yalnızca güneş/ay ikonu koymak, bu
 * kontrolü tanımayan bir kullanıcı için anlamsız olurdu; ayrıca üçüncü durumun
 * ("Sistem") ikonu yoktur.
 */
const THEME_OPTIONS: readonly { readonly value: ThemeChoice; readonly label: string }[] = [
  { value: 'system', label: 'Sistem' },
  { value: 'light', label: 'Açık' },
  { value: 'dark', label: 'Koyu' },
];

function ThemePicker() {
  const { choice, setChoice } = useTheme();

  return (
    <div className="px-3 pt-2 pb-1">
      <p className="pb-1.5 font-mono text-[9px] font-semibold tracking-[0.18em] text-fg-3 uppercase">
        Görünüm
      </p>
      {/*
        `radiogroup` — `role="group"` DEĞİL. Üç seçenek birbirini dışlar ve
        ekran okuyucu kullanıcısı ok tuşlarıyla dolaşabilmeli; bir düğme
        yığını bunu vermez.
      */}
      <div
        role="radiogroup"
        aria-label="Görünüm teması"
        className="flex gap-0.5 rounded-[10px] border border-border p-0.5"
      >
        {THEME_OPTIONS.map((option) => {
          const active = option.value === choice;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => {
                setChoice(option.value);
              }}
              className={[
                'flex-1 rounded-[7px] px-2 py-1.5 text-[11.5px] transition-colors',
                active ? 'bg-fill-2 font-semibold text-fg' : 'font-medium text-fg-3 hover:text-fg',
              ].join(' ')}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Kullanıcı menüsü — V1'de MİNİMAL (şifre değiştir + çıkış).
 *
 * Token PII taşımaz (ADR-0020): e-posta/ad client'ta YOKTUR. Profil verisi
 * (görünen ad, avatar) ileride bir `/me` ucuyla gelecek; şimdilik menü yapısal
 * olarak var ve hesap eylemlerini barındırır.
 */
export function UserMenu({ compact = false }: { compact?: boolean } = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onLogout(): Promise<void> {
    setLoading(true);
    try {
      await logout();
    } finally {
      router.push('/login');
    }
  }

  return (
    <div className="relative">
      {/*
        DAR MOD — koridorda 54 px genişlik var (ADR-0038 §2). "Hesabım" metni
        sığmaz; erişilebilir ad `aria-label`da zaten duruyor ve iki modda da
        AYNI, yani ekran okuyucu kullanıcısı için hiçbir şey değişmiyor.
      */}
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
        }}
        aria-label="Kullanıcı menüsü"
        className={
          compact
            ? 'grid h-8 w-8 place-items-center rounded-full bg-fill-2 text-fg-2 transition-colors hover:bg-fill hover:text-fg'
            : 'flex w-full items-center gap-2.5 rounded-[10px] p-2 text-left transition-colors hover:bg-fill'
        }
      >
        {compact ? (
          <UserIcon width={15} height={15} />
        ) : (
          <>
            <span className="flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-full bg-fill-2 text-fg-2">
              <UserIcon width={14} height={14} />
            </span>
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-fg-2">
              Hesabım
            </span>
            <span className="text-[13px] leading-none tracking-[0.05em] text-fg-3">···</span>
          </>
        )}
      </button>

      {open ? (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => {
              setOpen(false);
            }}
            aria-hidden="true"
          />
          <div
            className={`absolute bottom-full z-20 mb-2 w-52 rounded-card border border-border bg-raised p-1 shadow-float ${
              compact ? 'left-0' : 'right-0'
            }`}
          >
            <ThemePicker />
            <div className="my-1 h-px bg-border" />
            <Link
              href="/app/change-password"
              onClick={() => {
                setOpen(false);
              }}
              className="block w-full rounded-lg px-3 py-2 text-left text-sm text-fg hover:bg-fill"
            >
              Şifre Değiştir
            </Link>
            <button
              type="button"
              onClick={() => {
                void onLogout();
              }}
              disabled={loading}
              className="w-full rounded-lg px-3 py-2 text-left text-sm text-fg hover:bg-fill disabled:opacity-60"
            >
              {loading ? 'Çıkılıyor…' : 'Çıkış'}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
