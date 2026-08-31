import { describe, expect, it, vi } from 'vitest';

import RootPage from './page';

/**
 * `/` — kök rota GEÇİCİ olarak `/login`'e yönlendirir.
 *
 * ============================================================================
 * ⚠️ BU BİR GÜVENLİK DÜZELTMESİNİN KİLİDİDİR
 * ============================================================================
 * Kök rota Faz 1'den beri bir sağlık kartı çiziyordu — **ortam**, **uptime** ve
 * **veritabanı gecikmesi** dahil — ve `middleware.ts`'in kapsamı DIŞINDA olduğu
 * için kimliksiz herkese açıktı.
 *
 * ⚠️ Sızıntı SESSİZDİ: sayfa çalışıyordu, hiçbir test kırmızı yanmıyordu, lint
 * uyarmıyordu. Bir gün birisi "kök sayfa boş kalmasın" diye eski kartı geri
 * getirirse bu testler kırmızı yanar ve gerekçeyi okumak zorunda kalır.
 */
vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

describe('Kök rota', () => {
  it('⚠️ `/login`e yönlendirir — sağlık verisi ÇİZMEZ', () => {
    expect(() => RootPage()).toThrow('NEXT_REDIRECT:/login');
  });

  it('⚠️ GEÇİCİ yönlendirme (307) — `permanentRedirect` (308) DEĞİL', async () => {
    // ⚠️ 308 tarayıcılar tarafından KALICI olarak önbelleğe alınır. `/` yakında
    // landing page olacak (ROADMAP §7); 308 yazılsaydı, siteye daha önce girmiş
    // her tarayıcı landing page yayına alındıktan sonra da `/login`e gitmeye
    // DEVAM EDERDİ ve hata SESSİZ olurdu — sunucu doğru sayfayı sunar, istemci
    // onu hiç istemez.
    // ⚠️ Kaynak dosya OKUNUYOR, mock'a bakılmıyor: `next/navigation` bu dosyada
    // taklit edildiği için ondan bir şey çıkarmak, kendi taklidimizi test etmek
    // olurdu. İddia KODUN KENDİSİ hakkındadır.
    // ⚠️ MODÜLLER DESTRUCTURE EDİLMEZ (`const { join } = ...`) — bu bir üslup
    // tercihi değil, `@typescript-eslint/unbound-method`in (base config'te
    // `strictTypeChecked` üzerinden `error`) reddettiği bir kalıptır: bir metodu
    // nesnesinden koparmak, `this`in sessizce kaybolmasına açık kapı bırakır.
    // `path.join` tam olarak öyle bir metottur.
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const source = await fs.readFile(path.join(process.cwd(), 'src/app/page.tsx'), 'utf8');

    // ⚠️ YORUMLAR AYIKLANIYOR: dosyanın kendi gerekçesi `permanentRedirect`
    // kelimesini AÇIKLAMAK için geçiriyor. Ham metinde aramak, gerekçeyi yazmayı
    // cezalandıran bir test olurdu — iddia KODA dair olmalı, anlatıya değil.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

    expect(code).toMatch(/\bredirect\s*\(\s*'\/login'\s*\)/);
    expect(code).not.toMatch(/permanentRedirect/);
  });

  it('⚠️ SAĞLIK VERİSİ SIZDIRAN hiçbir alan kalmadı', () => {
    // Eski kart bu dört değeri kimliksiz yayınlıyordu. Biri geri gelirse bu
    // test kırmızı yanar.
    expect(RootPage.toString()).not.toMatch(/uptimeSeconds|latencyMs|dependencies|fetchHealth/);
  });
});
