/**
 * Zaman damgası biçimlendirme — TEK KAYNAK.
 *
 * ============================================================================
 * SÖZLEŞME: SUNUCU UTC KONUŞUR, EKRAN YEREL KONUŞUR
 * ============================================================================
 * Backend her zaman UTC ISO-8601 döndürür (`2026-08-05T08:21:50.174Z`) ve bu
 * DEĞİŞMEMELİDİR: çok tenant'lı bir sistemde sunucunun "saat" diye bir yeri
 * yoktur — kullanıcılar farklı zaman dilimlerinde olur, sunucu kendi
 * dilimini dayatırsa herkes için yanlış olur. Dönüşüm, dilimi BİLİNEN tek
 * yerde, yani tarayıcıda yapılır.
 *
 * Buradaki her fonksiyon `Date`'in YEREL alıcılarını (`getHours`, `getDate`,
 * `getMonth`, `getFullYear`) kullanır. Bunlar tarayıcının diliminde çalışır,
 * yani dönüşüm kendiliğinden olur.
 *
 * ============================================================================
 * `toISOString()` BURADA YASAK
 * ============================================================================
 * `new Date(iso).toISOString().slice(0, 10)` UTC tarihini verir, yerel tarihi
 * DEĞİL. UTC+3'te 06 Ağustos 01:30'da oluşturulan bir kayıt `2026-08-05`
 * yazardı — bir gün geride. Bu hata `note-list.tsx`'te gerçekten vardı ve bu
 * modülün yazılma sebebidir.
 *
 * ============================================================================
 * `toLocaleDateString` DE KULLANILMIYOR
 * ============================================================================
 * Önceki uygulamaların haklı gerekçesi korundu: locale'e bağlı biçimlendirme
 * sunucu ile istemcide farklı çıktı verip Next.js hydration uyuşmazlığı
 * üretebilir ve test ortamının yerel ayarına bağımlı olur. Ay adları bu yüzden
 * sabit bir Türkçe dizidir. Yerel DİLİM kullanılır, yerel BİÇİM değil — ikisi
 * ayrı şeydir.
 */

/** Türkçe kısa ay adları — locale'e bağımlı olmamak için sabit. */
const MONTHS = [
  'Oca',
  'Şub',
  'Mar',
  'Nis',
  'May',
  'Haz',
  'Tem',
  'Ağu',
  'Eyl',
  'Eki',
  'Kas',
  'Ara',
] as const;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** ISO metnini `Date`'e çevirir; geçersizse `null`. */
function parse(iso: string): Date | null {
  const parsed = Date.parse(iso);
  return Number.isNaN(parsed) ? null : new Date(parsed);
}

/**
 * `"14:05"` — tarayıcının YEREL saati.
 *
 * Geçersiz girdide `fallback` döner (çağıran "Bugün" gibi bir metin geçebilir).
 */
export function localClock(iso: string, fallback = ''): string {
  const date = parse(iso);
  return date === null ? fallback : `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * `"2026-08-05"` — YEREL takvim günü.
 *
 * ⚠️ `toISOString().slice(0, 10)` DEĞİL: o UTC gününü verir.
 */
export function localDay(iso: string, fallback = ''): string {
  const date = parse(iso);
  if (date === null) {
    return fallback;
  }
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** `"5 Ağu"` — yerel gün + sabit Türkçe ay kısaltması. */
export function localShortDate(iso: string, fallback = ''): string {
  const date = parse(iso);
  if (date === null) {
    return fallback;
  }
  return `${String(date.getDate())} ${MONTHS[date.getMonth()] ?? ''}`;
}

/**
 * ============================================================================
 * TAKVİM GÜNÜ (`YYYY-MM-DD`) — ANDAN AYRI BİR TİPTİR
 * ============================================================================
 * Yukarıdaki fonksiyonlar bir ANI (UTC ISO-8601) yerel dilime çevirir.
 * Aşağıdakiler ise PostgreSQL `date` kolonlarından gelen TAKVİM GÜNLERİ
 * içindir (`crm.interactions.occurred_on`, `crm.opportunities.next_follow_up_on`)
 * ve dilim dönüşümüne SOKULMAZ.
 *
 * ⚠️ Bir takvim gününü `Date`'e çevirmek SESSİZ BİR HATADIR.
 * `Date.parse('2026-08-05')` değeri UTC gece yarısı sayar; `getDate()` ise
 * yerel dilimde okur. UTC-5'te sonuç **4 Ağustos** çıkar — görüşmenin günü bir
 * gün geriye kayar. UTC+3'te doğru göründüğü için bu hata geliştirme
 * makinesinde ASLA fark edilmez; bu yüzden ayrı fonksiyon olarak yazıldı,
 * `localShortDate` yeniden kullanılmadı.
 *
 * Çözüm basit: metin zaten parçalıdır, ayrıştırmaya gerek yoktur.
 * ============================================================================
 */

/** `"2026-08-05"` → `"5 Ağu"`. Geçersiz girdide metnin kendisi döner. */
export function formatCalendarDay(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (match === null) {
    return day;
  }

  const [, , month, dayOfMonth] = match;
  const monthName = MONTHS[Number(month) - 1];

  return monthName === undefined ? day : `${String(Number(dayOfMonth))} ${monthName}`;
}

/** Tarayıcının YEREL takvim gününü `YYYY-MM-DD` olarak verir. */
export function todayCalendarDay(now: Date = new Date()): string {
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * İki takvim günü arasındaki GÜN farkı: `day - reference`.
 *
 * Negatif = geçmişte (takip GECİKMİŞ), `0` = bugün, pozitif = gelecek.
 * Geçersiz girdide `null` — sayı uydurulmaz.
 *
 * ============================================================================
 * NEDEN `Date.UTC`
 * ============================================================================
 * İki tarafı da UTC gece yarısına sabitlemek farkı TAM SAYI yapar: aradaki
 * gün sayısı ne olursa olsun bölme sonucu tamdır.
 *
 * Yerel `new Date(y, m, d)` ile aynı hesap, yaz saati geçen bir aralıkta 47
 * ya da 49 saat üretir (ölçüldü: `America/Chicago`, 7→9 Mart 2026 = 47 saat).
 * `Math.round` küçük aralıklarda bunu toparlar, ama doğruluk yuvarlamanın
 * şansına kalır — aralık büyüdükçe kalan saatler birikir. UTC'ye sabitlemek
 * doğruluğu YAPISAL kılar, yuvarlamaya bırakmaz.
 *
 * Bu, dilim dönüşümü DEĞİLDİR: her iki gün de aynı biçimde sabitlendiği için
 * ofset sadeleşir. Karşılaştırmanın referansı yine YEREL bugündür
 * (`todayCalendarDay`) — kullanıcının takvimi, sunucununki değil.
 */
export function calendarDayDelta(
  day: string,
  reference: string = todayCalendarDay(),
): number | null {
  const left = toUtcMidnight(day);
  const right = toUtcMidnight(reference);

  if (left === null || right === null) {
    return null;
  }

  return Math.round((left - right) / 86_400_000);
}

/** `YYYY-MM-DD` → UTC gece yarısı (ms); biçim tutmuyorsa `null`. */
function toUtcMidnight(day: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (match === null) {
    return null;
  }

  const [, year, month, dayOfMonth] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(dayOfMonth));
}

/** İki `Date` aynı YEREL takvim gününde mi. */
export function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Zaman damgası, YEREL olarak bugün mü. */
export function isToday(iso: string, now: Date = new Date()): boolean {
  const date = parse(iso);
  return date !== null && isSameLocalDay(date, now);
}

/**
 * `"07:52"` · `"Dün 18:20"` · `"3 Ağu"` — hepsi yerel.
 *
 * Bugünse yalnızca saat (gün zaten belli), dünse "Dün" öneki, daha eskiyse
 * tarih. Saat, tarih gösterilen durumda DÜŞER: eski bir kayıtta dakika
 * hassasiyeti bilgi taşımaz, yer kaplar.
 */
export function localRelativeWhen(iso: string, now: Date = new Date()): string {
  const date = parse(iso);
  if (date === null) {
    return '';
  }

  const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}`;

  if (isSameLocalDay(date, now)) {
    return clock;
  }

  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  if (isSameLocalDay(date, yesterday)) {
    return `Dün ${clock}`;
  }

  return localShortDate(iso);
}
