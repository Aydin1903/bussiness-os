/**
 * PostgreSQL hatalarini Drizzle'in sarmalayicisi ARDINDAN okumak icin.
 *
 * ============================================================================
 * NEDEN GEREKLI
 * ============================================================================
 * Drizzle, pg hatasini KENDI hata nesnesine sarar ve mesaji
 * "Failed query: insert into ..." olarak degistirir. Orijinal PostgreSQL
 * hatasi — `code`, `constraint`, gercek mesaj — `cause` zincirinde kalir.
 *
 * Yalnizca ust seviyeye bakan bir kontrol kisit ihlalini SESSIZCE kacirir ve
 * ham veritabani hatasi cagirana kadar sizar. Bu, bu projede iki kez ayni
 * sekilde ortaya cikti: repository'de unique ihlali domain hatasina
 * cevrilmedi, testte RLS ihlali ayirt edilemedi.
 *
 * ============================================================================
 * NEDEN `shared/` DEGIL DE `infrastructure/database/`
 * ============================================================================
 * `shared/` kernel'i CLAUDE.md geregi FRAMEWORK'SUZDUR: `Result`, base tipler,
 * domain hatalari. SQLSTATE kodlari ve Drizzle'in sarmalama davranisi ise
 * altyapi bilgisidir — kernel'e konsaydi, domain katmaninin dolayli olarak
 * PostgreSQL'i "bilmesi" mumkun hale gelirdi.
 *
 * Buraya konmasi ayni paylasimi saglar (repository'ler ve entegrasyon
 * testleri erisir) ama kernel'i temiz birakir.
 * ============================================================================
 */

/** SQLSTATE 23505 — unique_violation. */
export const PG_UNIQUE_VIOLATION = '23505';

/**
 * SQLSTATE 23503 — foreign_key_violation.
 *
 * `ON DELETE RESTRICT` tasiyan bir FK'nin silmeyi reddetmesi de bu kodu verir;
 * yani "var olmayan bir satira isaret ettin" ile "bu satir hala kullaniliyor"
 * AYNI koddur. Ayrimi yapan sey KISIT ADIDIR — `isPgError`'in ucuncu
 * parametresinin neden onerildigi tam olarak budur.
 */
export const PG_FOREIGN_KEY_VIOLATION = '23503';

/**
 * Hata ve tum `cause` atalarini sirayla dolasir.
 *
 * Dongusel `cause` zincirlerine karsi korumalidir: kendini referans eden bir
 * zincir sonsuz donguye girerdi ve bu, hata YOLUNDA olusan bir kilitlenme
 * olurdu — yani en kotu anda.
 */
function* causeChain(error: unknown): Generator<object> {
  const seen = new Set<unknown>();
  let current = error;

  while (typeof current === 'object' && current !== null && !seen.has(current)) {
    seen.add(current);
    yield current;
    current = 'cause' in current ? current.cause : null;
  }
}

/**
 * Zincirde verilen SQLSTATE kodunu ve (verildiyse) kisit adini tasiyan bir
 * hata var mi?
 *
 * Kisit adi ISTEGE BAGLI ama verilmesi onerilir: kod tek basina "bir unique
 * ihlali oldu" der, hangi kisitin ihlal edildigini soylemez. Yanlis kisiti
 * yakalayan bir ceviri, kullaniciya yanlis hata mesaji gosterir.
 */
export function isPgError(error: unknown, code: string, constraint?: string): boolean {
  for (const link of causeChain(error)) {
    if (!('code' in link) || link.code !== code) {
      continue;
    }

    if (constraint === undefined) {
      return true;
    }

    if ('constraint' in link && link.constraint === constraint) {
      return true;
    }
  }

  return false;
}

/**
 * Zincirdeki mesajlardan herhangi biri kalibi karsiliyor mu?
 *
 * RLS ihlali gibi, SQLSTATE'i ayirt edici olmayan durumlar icin. Ust seviye
 * mesaja bakan bir iddia bunu goremez cunku Drizzle mesaji degistirmistir.
 */
export function pgErrorMatches(error: unknown, pattern: RegExp): boolean {
  for (const link of causeChain(error)) {
    if ('message' in link && typeof link.message === 'string' && pattern.test(link.message)) {
      return true;
    }
  }

  return false;
}
