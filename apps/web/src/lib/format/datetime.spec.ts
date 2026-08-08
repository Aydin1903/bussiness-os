import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  calendarDayDelta,
  formatCalendarDay,
  isToday,
  localClock,
  localDay,
  localRelativeWhen,
  localShortDate,
  todayCalendarDay,
} from './datetime';

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

/**
 * ============================================================================
 * TAKVİM GÜNÜ — ANDAN AYRI BİR TİP
 * ============================================================================
 * Bu blok bir TUZAĞI kanıtlamak için var: `crm.interactions.occurred_on` bir
 * PostgreSQL `date` kolonudur ve `"2026-08-05"` olarak gelir. Onu `Date`'e
 * çevirip yerel alıcılarla okumak, NEGATİF UTC ofsetlerinde günü bir geriye
 * kaydırır.
 *
 * Dilim burada bilerek `America/Chicago`'ya (UTC-5) alınır: dosyanın geri
 * kalanı UTC+3'te koşuyor ve UTC+3'te bu hata GÖRÜNMEZ — geliştirme
 * makinesinde asla fark edilmeyecek bir hatanın testi, o makinenin dilimiyle
 * yazılamaz.
 */
describe('formatCalendarDay — negatif UTC ofsetinde', () => {
  const ISTANBUL = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = 'America/Chicago';
  });

  afterAll(() => {
    process.env.TZ = ISTANBUL;
  });

  it('takvim gününü OLDUĞU GİBİ biçimler', () => {
    expect(formatCalendarDay('2026-08-05')).toBe('5 Ağu');
  });

  it('⚠️ `localShortDate` AYNI girdide bir gün GERİ verir — bu fonksiyonun varlık sebebi', () => {
    // Kanıt: an-biçimleyicisi takvim gününde kullanılamaz.
    expect(localShortDate('2026-08-05')).toBe('4 Ağu');
    expect(formatCalendarDay('2026-08-05')).not.toBe(localShortDate('2026-08-05'));
  });

  it('yerel takvim günü UTC gününden farklıyken bile YEREL olanı verir', () => {
    // Chicago'da 5 Ağustos 21:00 → UTC'de 6 Ağustos 02:00.
    const localEvening = new Date(2026, 7, 5, 21, 0, 0);
    expect(todayCalendarDay(localEvening)).toBe('2026-08-05');
  });
});

describe('formatCalendarDay — biçim', () => {
  it('baştaki sıfırı DÜŞÜRÜR', () => {
    expect(formatCalendarDay('2026-01-03')).toBe('3 Oca');
  });

  it('geçersiz girdide metnin kendisini döner (uydurmaz)', () => {
    expect(formatCalendarDay('bozuk')).toBe('bozuk');
    expect(formatCalendarDay('2026-13-01')).toBe('2026-13-01');
  });
});

/**
 * Takvim günü FARKI — takiplerin "gecikmiş" hesabı buna dayanır.
 *
 * Dilim `America/Chicago`: hem negatif UTC ofseti hem de YAZ SAATİ olan bir
 * dilim. Türkiye 2016'dan beri kalıcı UTC+3'tür, yani DST tuzağı dosyanın
 * varsayılan diliminde HİÇ görünmez.
 */
describe('calendarDayDelta', () => {
  const ISTANBUL = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = 'America/Chicago';
  });

  afterAll(() => {
    process.env.TZ = ISTANBUL;
  });

  it('geçmiş gün NEGATİF döner (takip gecikmiş)', () => {
    expect(calendarDayDelta('2026-08-01', '2026-08-08')).toBe(-7);
  });

  it('aynı gün sıfır', () => {
    expect(calendarDayDelta('2026-08-08', '2026-08-08')).toBe(0);
  });

  it('gelecek gün POZİTİF döner', () => {
    expect(calendarDayDelta('2026-08-12', '2026-08-08')).toBe(4);
  });

  it('YAZ SAATİ geçişini doğru sayar — aradaki gün 47 saat sürse bile', () => {
    // ABD yaz saati 8 Mart 2026'da başlar; 7→9 Mart yerel olarak 47 saattir.
    expect(calendarDayDelta('2026-03-09', '2026-03-07')).toBe(2);
  });

  it('ay ve yıl sınırını aşar', () => {
    expect(calendarDayDelta('2027-01-01', '2026-12-30')).toBe(2);
  });

  it('geçersiz girdide `null` — sayı UYDURULMAZ', () => {
    expect(calendarDayDelta('bozuk', '2026-08-08')).toBeNull();
    expect(calendarDayDelta('2026-08-08', 'bozuk')).toBeNull();
  });
});
