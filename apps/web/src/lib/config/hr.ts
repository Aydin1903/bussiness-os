import type { RoleState } from '@/lib/session/use-current-role';

/**
 * İK'nın İSTEMCİ TARAFI yüzey kapıları (ADR-0043 §4.2, §7.1).
 *
 * ============================================================================
 * ⚠️ BU DOSYA `isReadOnly`'DEN BİLİNÇLİ OLARAK AYRILIYOR — FAIL-CLOSED
 * ============================================================================
 * `use-current-role.ts` FAIL-OPEN'dır ve gerekçesi doğrudur: rol öğrenilemezse
 * yüzeyler ÇİZİLİR, çünkü bedeli "çalışmayan bir düğme"dir ve gerçek yetkiyi
 * sunucu verir.
 *
 * ⚠️ ÜCRET YÜZEYİNDE BU GEÇERLİ DEĞİLDİR ve fark bedelin şeklindedir:
 *
 *     fail-open'ın bedeli  -> çalışmayan bir düğme (görünür, zararsız)
 *     BURADAKİ bedel       -> ⚠️ ATILMAMASI GEREKEN BİR İSTEK + var olmaması
 *                             gereken bir DOM bölümü
 *
 * ADR-0043 §4.2'nin şartı "veri sızmasın" DEĞİL — onu sunucu zaten sağlıyor
 * (`compensation:read` → 403, entegrasyon testleriyle kanıtlı). Şart, izinsiz
 * kullanıcı için ücret bölümünün SAYFADA HİÇ VAR OLMAMASIDIR. Bir 403 alıp
 * yutmak bunu sağlamaz: istek ağ sekmesinde görünür, uç adı sızar ve "burada
 * bir maaş var" bilgisi kendini ele verir.
 *
 * Bu yüzden `unknown` rol BURADA KAPALIDIR.
 *
 * ============================================================================
 * ⚠️ NEDEN KATALOĞU KOPYALAMAK BURADA GÜVENLİ — SAPMA ASİMETRİKTİR
 * ============================================================================
 * `use-current-role.ts` haklı olarak uyarıyor: kataloğu istemciye kopyalamak
 * İKİNCİ BİR DOĞRULUK KAYNAĞI yaratır ve sunucu değişince sessizce ayrışır.
 *
 * Burada kabul edilebilir olmasının sebebi, ayrışmanın İKİ YÖNDE DE ZARARSIZ
 * olmasıdır:
 *
 *   kopya ÇOK KATI ise  -> owner/admin bölümü GÖREMEZ. Görünür, bildirilebilir
 *                          bir hata; veri sızmaz.
 *   kopya ÇOK GEVŞEK ise -> istek atılır, sunucu **403** döner, bölüm boş
 *                          kalır. Yine sızıntı YOK.
 *
 * Yani bu kopya hiçbir yönde bir VERİ SIZINTISI üretemez — en fazla bir yüzey
 * hatası. `isReadOnly`'nin uyardığı risk (sessiz yetki genişlemesi) bu kapı
 * için YAPISAL OLARAK imkânsızdır.
 *
 * ⚠️ Sunucudaki tek doğruluk kaynağı `apps/api/src/modules/hr/hr.permissions.ts`
 * ve `platform/audit/audit.permissions.ts`'tir. Roller orada değişirse burası
 * da güncellenmelidir.
 */

/**
 * `compensation:read` — owner + admin (ADR-0043 §7.1).
 *
 * ⚠️ `unknown` KAPALIDIR (yukarıdaki fail-closed gerekçesi).
 */
export function canReadCompensation(role: RoleState): boolean {
  return role === 'owner' || role === 'admin';
}

/** `compensation:write` — owner + admin. Okuma ile aynı küme. */
export function canWriteCompensation(role: RoleState): boolean {
  return canReadCompensation(role);
}

/**
 * `audit:read` — owner + admin (Slice 1, `audit.permissions.ts`).
 *
 * ⚠️ Ayrı bir fonksiyon: bugün aynı role kümesine çözülüyor ama AYRI BİR
 * İZİNDİR. Tek fonksiyona bağlansaydı, biri değiştiğinde diğeri sessizce
 * onunla birlikte değişirdi.
 */
export function canReadAudit(role: RoleState): boolean {
  return role === 'owner' || role === 'admin';
}

/**
 * `employee:write` / `employee:delete` — owner + admin (§7.1).
 *
 * ⚠️ `isReadOnly` KULLANILMAZ: o, `viewer`ı ayırır ve `member`ı yazabilir
 * sayar. Bu modülde `member` DE YAZAMAZ — Teklif/Fatura'dan bilinçli sapma:
 * bir teklif yazmak satışın günlük işidir, BİR MESLEKTAŞIN KAYDINI
 * DEĞİŞTİRMEK kimsenin günlük işi değildir.
 *
 * ⚠️ Burada fail-OPEN doğrudur (yüzey kapısı değil, düğme kapısı): `unknown`
 * rol düğmeyi görür ve sunucu gerekirse 403 döner.
 */
export function canWriteEmployee(role: RoleState): boolean {
  return role === 'owner' || role === 'admin' || role === 'unknown';
}

/**
 * `leave:request` — owner + admin + member (ADR-0044 §6).
 *
 * ⚠️ `employee:write`ten BILINCLI olarak GENIS: bir meslektasin kaydini
 * degistirmek kimsenin gunluk isi degildir ama KENDI IZININI ISTEMEK tam
 * olarak herkesin isidir. Dar olsaydi modul, izin sisteminin VAR OLMA SEBEBINI
 * karsilamazdi.
 *
 * ⚠️ Burada FAIL-OPEN dogrudur (dugme kapisi, yuzey kapisi degil): `unknown`
 * rol dugmeyi gorur ve sunucu gerekirse 403 doner.
 */
export function canRequestLeave(role: RoleState): boolean {
  return role !== 'viewer';
}

/** `leave:decide` — owner + admin. Onaylamak bir YONETIM islemidir. */
export function canDecideLeave(role: RoleState): boolean {
  return role === 'owner' || role === 'admin' || role === 'unknown';
}
