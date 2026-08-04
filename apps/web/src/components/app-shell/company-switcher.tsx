'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import type { MyMembershipItem } from '@business-os/contracts';

import { CheckIcon, ChevronDownIcon } from '@/components/icons';
import { listMyMemberships } from '@/lib/api/tenants';
import { selectTenant } from '@/lib/session/select-tenant';
import { useSession } from '@/lib/session/session-provider';

/**
 * Şirket (tenant) seçici — gerçek `/me/memberships` verisiyle bağlanır ve tenant
 * değiştirmeyi GERÇEKTEN yapar (ADR-0028, ADR-0020 aşama 2).
 *
 * Mevcut tenant `currentTenantId`'den (session store, `useSession` ile reaktif)
 * bulunur. Bir şirkete tıklama → `selectTenant` (yeni access token + currentTenantId
 * + bo_last_tenant; identity dolduysa refresh cookie ile retry). Sonra `router.refresh()`:
 * gerçek tenant-scoped veri geldiğinde otomatik yeniden çekilir.
 */
export function CompanySwitcher() {
  const router = useRouter();
  const { currentTenantId } = useSession();
  const [items, setItems] = useState<MyMembershipItem[] | null>(null);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    listMyMemberships()
      .then((response) => {
        if (active) {
          setItems([...response.items]);
        }
      })
      .catch(() => {
        if (active) {
          setError(true);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  const current = items?.find((item) => item.tenantId === currentTenantId);
  const label = current?.tenantName ?? (error ? 'Şirketler yüklenemedi' : 'Şirket seç');

  async function choose(tenantId: string): Promise<void> {
    if (tenantId === currentTenantId) {
      setOpen(false);
      return;
    }
    setSwitching(true);
    try {
      await selectTenant(tenantId);
      setOpen(false);
      router.refresh();
    } catch {
      setError(true);
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
        }}
        disabled={items === null || switching}
        className="flex w-full items-center gap-2.5 rounded-[11px] border border-transparent p-2 text-left transition-colors hover:border-border hover:bg-raised hover:shadow-card disabled:opacity-60"
      >
        {/* Şirket rozeti: baş harfler. İkon yerine harf — çok şirketli bir
            üründe "hangi şirketteyim" sorusuna en hızlı cevap budur. */}
        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] bg-accent text-[11.5px] font-bold text-accent-fg shadow-card">
          {initials(label)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold tracking-[-0.012em] text-fg">
            {switching ? 'Geçiliyor…' : label}
          </span>
          <span className="block text-[11px] text-fg-3">Şirket değiştir</span>
        </span>
        <ChevronDownIcon className="shrink-0 text-fg-3" width={14} height={14} />
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
          <div className="absolute left-0 z-20 mt-2 w-full min-w-[240px] rounded-card border border-border bg-raised p-1 shadow-float">
            {items !== null && items.length > 0 ? (
              <ul className="flex flex-col">
                {items.map((item) => (
                  <li key={item.tenantId}>
                    <button
                      type="button"
                      onClick={() => {
                        void choose(item.tenantId);
                      }}
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface"
                    >
                      <span className="truncate text-fg">{item.tenantName}</span>
                      {item.tenantId === currentTenantId ? (
                        <CheckIcon className="shrink-0 text-fg" width={16} height={16} />
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-3 py-2 text-sm text-fg-muted">Üye olduğun bir şirket yok.</p>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Şirket adından en fazla iki baş harf. Boşsa nötr bir işaret döner. */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (words.length === 0) {
    return '—';
  }
  return words.map((word) => word[0]?.toLocaleUpperCase('tr') ?? '').join('');
}
