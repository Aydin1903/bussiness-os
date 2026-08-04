import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OnboardingGate } from './onboarding-gate';

/**
 * Dashboard kapısı — tetikleme koşulu (ADR-0030 §3) burada uygulanır.
 *
 * `notesExist` ve `getCurrentTenantId` MOCK'lanır; test edilen şey kapının
 * KARARIDIR: ne zaman yönlendirir, ne zaman ağa çıkar, hata olunca ne yapar.
 */
const notesExist = vi.hoisted(() => vi.fn());
const replace = vi.hoisted(() => vi.fn());
const getCurrentTenantId = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/knowledge', () => ({ notesExist }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
vi.mock('@/lib/session/session-store', () => ({ getCurrentTenantId }));

const TENANT_ID = '018f3a2b-7c4d-7e1f-8a2b-0000000000a1';
const FLAG_KEY = `bo_onboarding_done:${TENANT_ID}`;

function renderGate() {
  return render(
    <OnboardingGate>
      <p>Genel Bakis icerigi</p>
    </OnboardingGate>,
  );
}

function dashboard(): HTMLElement | null {
  return screen.queryByText('Genel Bakis icerigi');
}

beforeEach(() => {
  getCurrentTenantId.mockReturnValue(TENANT_ID);
  notesExist.mockResolvedValue({ hasNotes: true });
  window.localStorage.clear();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('OnboardingGate — tetikleme', () => {
  it('NOT YOKSA onboarding e yonlendirir', async () => {
    notesExist.mockResolvedValue({ hasNotes: false });

    renderGate();

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/app/onboarding');
    });
  });

  it('yonlendirme surerken DASHBOARD CIZILMEZ', async () => {
    notesExist.mockResolvedValue({ hasNotes: false });

    renderGate();

    await waitFor(() => {
      expect(replace).toHaveBeenCalled();
    });
    // Bir an gorunup kaybolmasi, bu bilesenin var olma sebebini yok ederdi.
    expect(dashboard()).not.toBeInTheDocument();
  });

  it('NOT VARSA dashboard cizilir, yonlendirme YOK', async () => {
    notesExist.mockResolvedValue({ hasNotes: true });

    renderGate();

    await waitFor(() => {
      expect(dashboard()).toBeInTheDocument();
    });
    expect(replace).not.toHaveBeenCalled();
  });
});

describe('OnboardingGate — bayrak', () => {
  it('bayrak VARSA aga HIC cikilmaz', async () => {
    window.localStorage.setItem(FLAG_KEY, '1');

    renderGate();

    await waitFor(() => {
      expect(dashboard()).toBeInTheDocument();
    });
    expect(notesExist).not.toHaveBeenCalled();
  });

  it('not bulununca bayrak YAZILIR — sonraki acilislarda sorgu olmasin', async () => {
    notesExist.mockResolvedValue({ hasNotes: true });

    renderGate();

    await waitFor(() => {
      expect(window.localStorage.getItem(FLAG_KEY)).toBe('1');
    });
  });

  it('not YOKKEN bayrak yazilmaz (wizard henuz gecilmedi)', async () => {
    notesExist.mockResolvedValue({ hasNotes: false });

    renderGate();

    await waitFor(() => {
      expect(replace).toHaveBeenCalled();
    });
    expect(window.localStorage.getItem(FLAG_KEY)).toBeNull();
  });

  it('bayrak TENANT BASINADIR — baska tenant in bayragi sayilmaz', async () => {
    window.localStorage.setItem('bo_onboarding_done:baska-tenant', '1');
    notesExist.mockResolvedValue({ hasNotes: false });

    renderGate();

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/app/onboarding');
    });
  });
});

describe('OnboardingGate — kenar durumlar', () => {
  it('kontrol HATA verirse DASHBOARD gosterilir, wizard DEGIL', async () => {
    // Bu bir yetki kapisi degil KARSILAMA kapisidir: supheye dusunce birine
    // kurulum sihirbazi dayatmak, notu olan bir sirkete "bastan taniselim"
    // demek olurdu.
    notesExist.mockRejectedValue(new Error('ag hatasi'));

    renderGate();

    await waitFor(() => {
      expect(dashboard()).toBeInTheDocument();
    });
    expect(replace).not.toHaveBeenCalled();
  });

  it('tenant YOKSA sorgu yapilmaz ve dashboard cizilir', async () => {
    // AppShell zaten oturum/tenant yonlendirmesini yapiyor; burada kontrol
    // edilecek bir hafiza yok.
    getCurrentTenantId.mockReturnValue(undefined);

    renderGate();

    await waitFor(() => {
      expect(dashboard()).toBeInTheDocument();
    });
    expect(notesExist).not.toHaveBeenCalled();
  });
});
