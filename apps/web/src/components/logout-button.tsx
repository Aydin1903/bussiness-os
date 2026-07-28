'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { logout } from '@/lib/session/logout';

/**
 * Çıkış butonu — app shell header'ında (F1'de boş bırakılan yer).
 *
 * `logout()` sunucuda oturumu sonlandırır + istemci izlerini (hint + memory)
 * temizler, sonra `/login`'e gider. `bo_session_hint` silindiği için middleware
 * artık `/app/*`'i login'e yönlendirir.
 */
export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onLogout(): Promise<void> {
    setLoading(true);
    try {
      await logout();
      router.push('/login');
    } catch {
      // logout() istemci temizliğini finally'de yapar; yine de login'e git.
      router.push('/login');
    }
  }

  return (
    <button
      type="button"
      onClick={() => {
        void onLogout();
      }}
      disabled={loading}
      className="rounded-lg px-3 py-1.5 text-sm text-fg-muted transition-colors hover:bg-surface hover:text-fg disabled:opacity-60"
    >
      {loading ? 'Çıkılıyor…' : 'Çıkış'}
    </button>
  );
}
