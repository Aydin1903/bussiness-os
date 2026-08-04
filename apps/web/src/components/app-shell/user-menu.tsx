'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { UserIcon } from '@/components/icons';
import { logout } from '@/lib/session/logout';

/**
 * Kullanıcı menüsü — V1'de MİNİMAL (şifre değiştir + çıkış).
 *
 * Token PII taşımaz (ADR-0020): e-posta/ad client'ta YOKTUR. Profil verisi
 * (görünen ad, avatar) ileride bir `/me` ucuyla gelecek; şimdilik menü yapısal
 * olarak var ve hesap eylemlerini barındırır.
 */
export function UserMenu() {
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
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
        }}
        aria-label="Kullanıcı menüsü"
        className="flex w-full items-center gap-2.5 rounded-[10px] p-2 text-left transition-colors hover:bg-fill"
      >
        <span className="flex h-[27px] w-[27px] shrink-0 items-center justify-center rounded-full bg-fill-2 text-fg-2">
          <UserIcon width={14} height={14} />
        </span>
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-fg-2">Hesabım</span>
        <span className="text-[13px] leading-none tracking-[0.05em] text-fg-3">···</span>
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
          <div className="absolute right-0 z-20 mt-2 w-44 rounded-card border border-border bg-bg p-1 shadow-lg">
            <Link
              href="/app/change-password"
              onClick={() => {
                setOpen(false);
              }}
              className="block w-full rounded-lg px-3 py-2 text-left text-sm text-fg hover:bg-surface"
            >
              Şifre Değiştir
            </Link>
            <button
              type="button"
              onClick={() => {
                void onLogout();
              }}
              disabled={loading}
              className="w-full rounded-lg px-3 py-2 text-left text-sm text-fg hover:bg-surface disabled:opacity-60"
            >
              {loading ? 'Çıkılıyor…' : 'Çıkış'}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
