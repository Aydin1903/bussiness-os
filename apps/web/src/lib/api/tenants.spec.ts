import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { mockResponse, stubFetch, urlsOf } from '../../../test/fetch-mock';
import { clearSession, getIdentityToken, setSession } from '../session/session-store';
import { ApiError } from './problem';
import { createTenant, listMyMemberships } from './tenants';

/**
 * TENANT-ÖNCESİ UÇLAR — kimlik token'ının kurtarılması.
 *
 * ============================================================================
 * BU DOSYA BİR ÇÖKMEDEN DOĞDU
 * ============================================================================
 * `listMyMemberships()` `async` DEĞİLDİ ve kimlik token'ını **argüman
 * konumunda** okuyan `requireIdentityToken()` senkron `throw` ediyordu. Yani
 * hata promise kurulmadan ÖNCE, çağrının kendi satırında atılıyordu:
 *
 *   listMyMemberships().then(…).catch(…)
 *   ^^^^^^^^^^^^^^^^^^^^ burada fırlatır — `.catch` HİÇ BAĞLANMAZ
 *
 * `/select-tenant` bunu bir `useEffect` içinde çağırıyordu; fırlatma efektten
 * dışarı taşıp React'e ulaşıyor ve SAYFA ÇÖKÜYORDU. Sayfanın `.catch`'i doğru
 * yazılmıştı, ona sıra hiç gelmiyordu.
 *
 * ⚠️ Kusur "oturumsuz açılmıyor" gibi görünüyordu; asıl yolu SAYFA
 * YENİLEMEDİR — memory session yenilemede kaybolur (FRONTEND §3.3).
 */

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Sözleşmeye uyan boş liste — şema `limit`/`offset` de ister. */
const BOS_LISTE = { items: [], total: 0, limit: 20, offset: 0 };

describe('tenant-öncesi uçlar — kimlik kurtarma', () => {
  beforeEach(() => {
    clearSession();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('memory’de token VARSA yenileme YAPILMAZ', async () => {
    setSession({ identityToken: 'id-hazir' });
    const fetchMock = stubFetch(() => mockResponse(200, BOS_LISTE));

    await listMyMemberships();

    const urls = urlsOf(fetchMock);
    expect(urls.filter((u) => u.includes('/auth/refresh'))).toHaveLength(0);
    expect(urls.some((u) => u.includes('/me/memberships'))).toBe(true);
  });

  it('⚠️ memory BOŞSA refresh cookie’siyle KURTARIR (sayfa yenileme yolu)', async () => {
    /*
     * Asıl kusurun düzeltildiği yer burasıdır: eskiden bu senaryo bir
     * `ApiError` FIRLATIYORDU; artık kimlik tazelenir ve istek atılır.
     */
    const fetchMock = stubFetch((url) =>
      url.includes('/auth/refresh')
        ? mockResponse(200, { identityToken: 'id-tazelendi' })
        : mockResponse(200, BOS_LISTE),
    );

    await listMyMemberships();

    const urls = urlsOf(fetchMock);
    expect(urls.some((u) => u.includes('/auth/refresh'))).toBe(true);
    expect(urls.some((u) => u.includes('/me/memberships'))).toBe(true);
    expect(getIdentityToken()).toBe('id-tazelendi');
  });

  it('⚠️ kurtarma da başarısızsa SENKRON FIRLATMAZ — REDDEDİLEN PROMISE döner', async () => {
    /*
     * ⚠️ TESTİN ASIL İDDİASI BUDUR ve şekli önemlidir: `expect(...).rejects`
     * yerine önce fonksiyon ÇAĞRILIR, sonra sonucun bir promise olduğu
     * doğrulanır. Senkron bir `throw` bu satırda patlar ve test kırmızı yanar —
     * yani eski kusur geri gelirse yakalanır.
     */
    stubFetch(() => mockResponse(401, { detail: 'oturum yok' }));

    const sonuc = listMyMemberships();

    expect(sonuc).toBeInstanceOf(Promise);
    await expect(sonuc).rejects.toBeInstanceOf(ApiError);
  });

  it('`createTenant` de aynı şekilde REDDEDİLEN PROMISE döner', async () => {
    // Aynı kusur buradaydı ama görünmüyordu: çağrısı bir `try` bloğundaydı.
    stubFetch(() => mockResponse(401, { detail: 'oturum yok' }));

    const sonuc = createTenant({ name: 'Acme', slug: 'acme' });

    expect(sonuc).toBeInstanceOf(Promise);
    await expect(sonuc).rejects.toBeInstanceOf(ApiError);
  });

  it('⚠️ EŞ ZAMANLI kurtarma TEK bir /auth/refresh yapar (ADR-0021)', async () => {
    /*
     * ⚠️ BU TEST, DÜZELTMENİN KENDİ AÇACAĞI DELİĞİ KAPATIR.
     *
     * Kurtarma eklenince `/select-tenant` şunu yapabilir hâle geldi: liste
     * yüklenirken (`listMyMemberships` → tazeleme) kullanıcı bir şirkete
     * tıklar (`selectTenant` → tazeleme). İkisi de `refreshIdentityToken()`
     * çağırır.
     *
     * Single-flight olmasaydı AYNI refresh cookie'si backend'e İKİ KEZ
     * sunulurdu ve ADR-0021'in yeniden kullanım tespiti **tüm token ailesini**
     * iptal ederdi — kullanıcı sebepsiz düşerdi. `refresh.ts`in kendi başlığı
     * bunu "pazarlık edilemez" diye yazıyordu ama kural yalnızca
     * `refreshSession()` yolunda uygulanıyordu.
     */
    const fetchMock = stubFetch(async (url) => {
      await delay(10); // çağrıların gerçekten çakışması için
      return url.includes('/auth/refresh')
        ? mockResponse(200, { identityToken: 'id-tek' })
        : mockResponse(200, BOS_LISTE);
    });

    await Promise.all([listMyMemberships(), listMyMemberships(), listMyMemberships()]);

    const refreshCalls = urlsOf(fetchMock).filter((u) => u.includes('/auth/refresh'));

    expect(refreshCalls).toHaveLength(1); // 3 değil, 1
  });
});
