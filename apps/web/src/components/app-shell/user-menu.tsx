'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { UserIcon } from '@/components/icons';
import { logout } from '@/lib/session/logout';

/**
 * Kullanıcı menüsü — V1'de MİNİMAL (yalnızca çıkış).
 *
 * Token PII taşımaz (ADR-0020): e-posta/ad client'ta YOKTUR. Profil verisi
 * (görünen ad, avatar) ileride bir `/me` ucuyla gelecek; şimdilik menü yapısal
 * olarak var ve tek eylemi çıkıştır.
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
        className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-fg-muted transition-colors hover:bg-surface hover:text-fg"
      >
        <UserIcon width={16} height={16} />
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
