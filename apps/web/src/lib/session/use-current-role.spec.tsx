import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { isReadOnly, useCurrentRole } from './use-current-role';

/**
 * Rol çözümü ve CRM'in kaba yazma kuralı.
 *
 * ============================================================================
 * ASIL İDDİA: FAIL-OPEN
 * ============================================================================
 * Bu kanca bir GÜVENLİK SINIRI DEĞİLDİR (gerçek yetki `PermissionGuard`'da).
 * Rol öğrenilemediğinde yazma yüzeylerinin GİZLENMEMESİ bu yüzden doğrudur:
 * ters yön, geçici bir ağ hatasında bir owner'ı kendi CRM'inde salt okur
 * bırakırdı — hiçbir güvenlik kazancı olmadan.
 *
 * Test bunu kayda geçirir ki, ileride "bilinmiyorsa gizleyelim" sezgisiyle
 * ters çevrilmek istendiğinde gerekçe görünür olsun.
 */
const listMyMemberships = vi.hoisted(() => vi.fn());
const currentTenantId = vi.hoisted((): { value: string | undefined } => ({
  value: 'tenant-1',
}));

vi.mock('@/lib/api/tenants', () => ({ listMyMemberships }));
vi.mock('./session-provider', () => ({
  useSession: () => ({ currentTenantId: currentTenantId.value }),
}));

function Probe() {
  const role = useCurrentRole();
  return <span data-testid="role">{`${role}:${String(isReadOnly(role))}`}</span>;
}

function membership(tenantId: string, role: string) {
  return { tenantId, tenantName: 'Şirket', tenantSlug: 'sirket', role, status: 'active' };
}

beforeEach(() => {
  vi.clearAllMocks();
  currentTenantId.value = 'tenant-1';
});

describe('useCurrentRole', () => {
  it('AKTİF tenant’ın rolünü seçer — listedeki ilkini değil', async () => {
    listMyMemberships.mockResolvedValue({
      items: [membership('tenant-0', 'owner'), membership('tenant-1', 'viewer')],
      total: 2,
      limit: 20,
      offset: 0,
    });

    render(<Probe />);

    await waitFor(() => {
      expect(screen.getByTestId('role')).toHaveTextContent('viewer:true');
    });
  });

  it('viewer salt okur, member DEĞİL', async () => {
    listMyMemberships.mockResolvedValue({
      items: [membership('tenant-1', 'member')],
      total: 1,
      limit: 20,
      offset: 0,
    });

    render(<Probe />);

    await waitFor(() => {
      expect(screen.getByTestId('role')).toHaveTextContent('member:false');
    });
  });

  it('çağrı düşerse rol bilinmez ve salt okur SAYILMAZ (fail-open)', async () => {
    listMyMemberships.mockRejectedValue(new Error('ağ'));

    render(<Probe />);

    await waitFor(() => {
      expect(screen.getByTestId('role')).toHaveTextContent('unknown:false');
    });
  });

  it('aktif tenant listede yoksa rol bilinmez — yanlış bir rol UYDURULMAZ', async () => {
    listMyMemberships.mockResolvedValue({
      items: [membership('baska-tenant', 'owner')],
      total: 1,
      limit: 20,
      offset: 0,
    });

    render(<Probe />);

    await waitFor(() => {
      expect(screen.getByTestId('role')).toHaveTextContent('unknown:false');
    });
  });

  it('tenant seçilmemişken ağa HİÇ çıkmaz', () => {
    currentTenantId.value = undefined;

    render(<Probe />);

    expect(listMyMemberships).not.toHaveBeenCalled();
    expect(screen.getByTestId('role')).toHaveTextContent('unknown:false');
  });
});
