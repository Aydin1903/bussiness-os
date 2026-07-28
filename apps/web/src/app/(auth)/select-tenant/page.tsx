'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import type { MyMembershipItem } from '@business-os/contracts';

import { FormError } from '@/components/ui/form-error';
import { errorMessage } from '@/lib/api/error-message';
import { listMyMemberships } from '@/lib/api/tenants';
import { selectTenant } from '@/lib/session/select-tenant';

/** Rol etiketleri — teknik değerleri kullanıcı diline çevirir. */
const ROLE_LABELS: Record<string, string> = {
  owner: 'Sahip',
  admin: 'Yönetici',
  member: 'Üye',
  viewer: 'İzleyici',
};

/**
 * `/select-tenant` — birden fazla şirkete üye kullanıcının seçim ekranı (ADR-0028).
 *
 * Mount'ta `/me/memberships` çağrılır; bir şirkete tıklanınca `switch-tenant` +
 * `/app`. Liste yalnızca switchable tenant'ları içerir (backend filtresi).
 */
export default function SelectTenantPage() {
  const router = useRouter();
  const [items, setItems] = useState<MyMembershipItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectingId, setSelectingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    listMyMemberships()
      .then((response) => {
        if (active) {
          setItems([...response.items]);
        }
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(errorMessage(caught, 'Şirketler yüklenemedi.'));
        }
      });
    return () => {
      active = false;
    };
  }, []);

  async function choose(tenantId: string): Promise<void> {
    setError(null);
    setSelectingId(tenantId);
    try {
      await selectTenant(tenantId);
      router.push('/app');
    } catch (caught) {
      setError(errorMessage(caught, 'Şirkete geçilemedi.'));
      setSelectingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">Şirket seç</h1>
        <p className="text-sm text-fg-muted">Devam etmek için bir şirket seçin.</p>
      </header>

      <FormError message={error} />

      {items === null && error === null ? (
        <p className="text-sm text-fg-muted">Yükleniyor…</p>
      ) : null}

      {items !== null ? (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.tenantId}>
              <button
                type="button"
                onClick={() => {
                  void choose(item.tenantId);
                }}
                disabled={selectingId !== null}
                className="flex w-full items-center justify-between rounded-lg border border-border bg-bg px-4 py-3 text-left transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="text-sm font-medium text-fg">{item.tenantName}</span>
                <span className="text-xs text-fg-muted">
                  {selectingId === item.tenantId ? 'Geçiliyor…' : (ROLE_LABELS[item.role] ?? item.role)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {items !== null && items.length === 0 ? (
        <p className="text-sm text-fg-muted">Henüz bir şirkete üye değilsin.</p>
      ) : null}

      <p className="text-center text-sm text-fg-muted">
        <Link href="/create-tenant" className="font-medium text-fg underline-offset-2 hover:underline">
          Yeni şirket oluştur
        </Link>
      </p>
    </div>
  );
}
