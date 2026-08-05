import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { isToday, localClock, localDay, localRelativeWhen, localShortDate } from './datetime';

/**
 * Zaman damgası biçimlendirme — YEREL saat sözleşmesi.
 *
 * ============================================================================
 * TESTLER UTC'DE KOŞARSA HİÇBİR ŞEY KANITLAMAZ
 * ============================================================================
 * `TZ=UTC` altında "UTC göster" ile "yerel göster" AYNI sonucu verir; bozuk bir
 * uygulama da yeşil yanar. Bu yüzden dilim burada UTC'den FARKLI bir değere
 * sabitlenir (`Europe/Istanbul`, UTC+3 — kullanıcının dilimi).
 *
 * Sabit dilim ayrıca testi CI makinesinin ayarından bağımsız kılar.
 */
const ORIGINAL_TZ = process.env.TZ;

beforeAll(() => {
  process.env.TZ = 'Europe/Istanbul';
});

afterAll(() => {
  process.env.TZ = ORIGINAL_TZ;
});

describe('localClock — sunucu UTC, ekran yerel', () => {
  it('UTC damgasını +3 kaydırarak gösterir', () => {
    // Bu tam olarak API'nin döndürdüğü biçim.
    expect(localClock('2026-08-05T08:51:23.390Z')).toBe('11:51');
  });

  it('gün sınırını doğru geçer (UTC 22:30 → ertesi gün 01:30)', () => {
    expect(localClock('2026-08-05T22:30:00.000Z')).toBe('01:30');
  });

  it('geçersiz damgada fallback döner', () => {
    expect(localClock('bozuk', 'Bugün')).toBe('Bugün');
  });
});

describe('localDay — YEREL takvim günü', () => {
  it('gece yarısından sonraki kayıt BİR GÜN GERİDE görünmez', () => {
    // Bu, `note-list.tsx`'te GERÇEKTEN yaşanan hatanın testi:
    // `toISOString().slice(0, 10)` burada '2026-08-05' derdi.
    expect(localDay('2026-08-05T22:30:00.000Z')).toBe('2026-08-06');
  });

  it('gün ortasında UTC ile aynı günü verir', () => {
    expect(localDay('2026-08-05T08:21:50.174Z')).toBe('2026-08-05');
  });

  it('ay ve gün iki haneye tamamlanır', () => {
    expect(localDay('2026-01-02T12:00:00.000Z')).toBe('2026-01-02');
  });
});

describe('localShortDate', () => {
  it('sabit Türkçe ay kısaltması kullanır', () => {
    expect(localShortDate('2026-08-03T09:00:00.000Z')).toBe('3 Ağu');
  });

  it('yerel güne göre hesaplar', () => {
    // UTC 2 Ağu 23:00 → yerel 3 Ağu 02:00
    expect(localShortDate('2026-08-02T23:00:00.000Z')).toBe('3 Ağu');
  });
});

describe('isToday — yerel gün karşılaştırması', () => {
  it('yerel olarak aynı gündeyse true', () => {
    const now = new Date('2026-08-06T05:00:00.000Z'); // yerel 08:00
    expect(isToday('2026-08-05T22:30:00.000Z', now)).toBe(true); // yerel 01:30
  });

  it('UTC günü aynı ama yerel günü farklıysa false', () => {
    const now = new Date('2026-08-05T12:00:00.000Z'); // yerel 5 Ağu 15:00
    expect(isToday('2026-08-05T22:30:00.000Z', now)).toBe(false); // yerel 6 Ağu
  });

  it('geçersiz damgada false', () => {
    expect(isToday('bozuk')).toBe(false);
  });
});

describe('localRelativeWhen', () => {
  const now = new Date('2026-08-05T12:00:00.000Z'); // yerel 5 Ağu 15:00

  it('bugünse yalnızca saat', () => {
    expect(localRelativeWhen('2026-08-05T08:51:00.000Z', now)).toBe('11:51');
  });

  it('dünse "Dün" öneki', () => {
    expect(localRelativeWhen('2026-08-04T15:20:00.000Z', now)).toBe('Dün 18:20');
  });

  it('daha eskiyse tarih (saat DÜŞER)', () => {
    expect(localRelativeWhen('2026-08-01T06:00:00.000Z', now)).toBe('1 Ağu');
  });

  it('geçersiz damgada boş metin', () => {
    expect(localRelativeWhen('bozuk', now)).toBe('');
  });
});
