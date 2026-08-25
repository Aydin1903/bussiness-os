import type { RoleState } from '@/lib/session/use-current-role';

/**
 * Geri bildirim odasının İSTEMCİ TARAFI yüzey kapıları (ADR-0045 §5).
 *
 * ============================================================================
 * ⚠️ BU DOSYA `hr.ts`TEN DAHA KÜÇÜK — VE SEBEBİ BİR KARARDIR
 * ============================================================================
 * İK'da üç ayrı kapı vardı (`compensation:read`, `audit:read`,
 * `employee:write`) ve ücret kapısı FAIL-CLOSED olmak zorundaydı: izinsiz
 * kullanıcı için bölümün SAYFADA HİÇ VAR OLMAMASI gerekiyordu, çünkü bir 403
 * bile "burada bir maaş var" bilgisini ele veriyordu.
 *
 * ⚠️ BURADA GİZLİ BİR YÜZEY YOKTUR: `feedback:read` DÖRT ROLDE DE var (§5),
 * yani gizlenecek bir bölüm, atılmaması gereken bir istek ve sızacak bir uç
 * adı yok. Kataloğun tamamı GENİŞTİR; dar olan tek şey SİLMEDİR.
 *
 * Dolayısıyla bu dosyada TEK bir kapı var ve o da bir VERİ kapısı değil bir
 * EYLEM kapısıdır.
 *
 * ⚠️ Sunucudaki tek doğruluk kaynağı
 * `apps/api/src/modules/feedback/feedback.permissions.ts`tir. Roller orada
 * değişirse burası da güncellenmelidir.
 */

/**
 * `feedback:delete` — owner + admin (§5).
 *
 * ============================================================================
 * ⚠️ `isReadOnly` KULLANILMAZ — o, `member`ı SİLEBİLİR sayardı
 * ============================================================================
 * `isReadOnly` yalnızca `viewer`ı ayırır. Bu modülde `member` YAZAR ama
 * SİLEMEZ (§5) ve ayrım anlamlıdır: bir geri bildirim girmek sahadaki kişinin
 * günlük işidir; ⚠️ bir müşterinin sözünü KALICI OLARAK yok etmek değildir.
 *
 * Silmenin iki ağırlığı var ve ikisi de `create`ten farklı bir yetki ister:
 *   1. Kayıt AI HAFIZASINDAN DA silinir — vektör aynı satırda yaşar (§1.2).
 *   2. Bir TÜRETİLMİŞ RAKAMI değiştirir (ortalama, düşük puan sayısı) ve bir
 *      KVKK işlemidir — yani bir YÖNETİM işlemidir.
 *
 * ⚠️ `unknown` KAPALIDIR ve bu, `isReadOnly`nin fail-open kuralından bilinçli
 * sapmadır. Gerekçe İK'nınkinden FARKLI: burada sızıntı riski yok, ama silme
 * GERİ ALINAMAZ. Rolü henüz öğrenilmemiş bir kullanıcıya geri alınamaz bir
 * eylem göstermek, en kötü hâlde yanlışlıkla basılmış bir düğme demektir —
 * ⚠️ ve iki adımlı onay bile ilk adımı görünür kılar.
 *
 * ⚠️ Kapının kapalı olmasının bedeli görünür ve zararsızdır: rol yüklenene
 * kadar "Sil" düğmesi çıkmaz, sonra çıkar. Fail-open'ın bedeli ise geri
 * alınamaz bir eylemin yanlış kişiye gösterilmesiydi.
 */
export function canDeleteFeedback(role: RoleState): boolean {
  return role === 'owner' || role === 'admin';
}
