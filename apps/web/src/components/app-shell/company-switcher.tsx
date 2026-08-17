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
export function CompanySwitcher({ compact = false }: { compact?: boolean } = {}) {
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

  /*
   * DAR MOD — koridorda (ADR-0038 §2) yalnızca 54 px genişlik var.
   *
   * Şirket ADI oraya sığmaz, ama "hangi şirketteyim" sorusunun cevabı
   * gizlenemez de. Çözüm baş harflerdir: geniş modda zaten rozet olarak
   * duruyorlardı, dar modda rozet TEK BAŞINA kalır ve tam ad `title` +
   * `aria-label` ile taşınır — yani görsel kullanıcı harfleri, ekran okuyucu
   * kullanıcısı tam adı alır.
   */
  if (compact) {
    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => {
            setOpen((value) => !value);
          }}
          disabled={items === null || switching}
          title={label}
          aria-label={`Şirket: ${label}. Değiştirmek için seçin.`}
          className="grid h-8 w-8 place-items-center rounded-[9px] bg-fill-2 text-[10.5px] font-bold text-fg-2 transition-colors hover:bg-fill hover:text-fg disabled:opacity-60"
        >
          {switching ? '···' : initials(label)}
        </button>

        {open ? (
          <Popover
            items={items}
            currentTenantId={currentTenantId}
            onChoose={choose}
            onClose={() => {
              setOpen(false);
            }}
            anchor="left-full ml-2 top-0"
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
        }}
        disabled={items === null || switching}
        className="flex w-full items-center gap-2.5 rounded-[11px] border border-transparent p-2 text-left transition-colors hover:border-border hover:bg-fill hover:shadow-card disabled:opacity-60"
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
        <Popover
          items={items}
          currentTenantId={currentTenantId}
          onChoose={choose}
          onClose={() => {
            setOpen(false);
          }}
          anchor="left-0 mt-2 w-full min-w-[240px]"
        />
      ) : null}
    </div>
  );
}

/**
 * Şirket listesi — iki modun PAYLAŞTIĞI tek gövde.
 *
 * ⚠️ Kopyalanmadı. Dar mod eklenirken bu listeyi ikinci kez yazmak, tenant
 * değiştirme gibi güvenlik sonucu olan bir akışı iki yerde tutmak olurdu;
 * biri düzeltilip diğeri unutulduğunda hata SESSİZ olurdu. Modlar arasındaki
 * tek fark konumlandırmadır ve o da `anchor` ile geçiyor.
 */
function Popover({
  items,
  currentTenantId,
  onChoose,
  onClose,
  anchor,
}: {
  items: MyMembershipItem[] | null;
  currentTenantId: string | undefined;
  onChoose: (tenantId: string) => Promise<void>;
  onClose: () => void;
  anchor: string;
}) {
  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} aria-hidden="true" />
      <div
        className={`absolute z-20 rounded-card border border-border bg-raised p-1 shadow-float ${anchor}`}
      >
        {items !== null && items.length > 0 ? (
          <ul className="flex w-full min-w-[220px] flex-col">
            {items.map((item) => (
              <li key={item.tenantId}>
                <button
                  type="button"
                  onClick={() => {
                    void onChoose(item.tenantId);
                  }}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-fill"
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
          <p className="min-w-[220px] px-3 py-2 text-sm text-fg-muted">
            Üye olduğun bir şirket yok.
          </p>
        )}
      </div>
    </>
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
