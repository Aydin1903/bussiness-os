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
