/**
 * `bo_onboarding_done:<tenantId>` — onboarding wizard'ı bu tarayıcıda kapandı mı.
 *
 * ============================================================================
 * NEDEN GEREKLİ — "notu yoksa göster" tek başına yetmiyor
 * ============================================================================
 * Tetikleme koşulu (ADR-0030 §3) tenant'ın hiç notu olmamasıdır. Ama kullanıcı
 * 7 sorunun **hepsini atlarsa** hiç not oluşmaz: koşul hâlâ doğrudur ve wizard
 * bir sonraki girişte yeniden açılır. Kullanıcının açıkça geçtiği bir akışın
 * onu tekrar karşılaması yanlış.
 *
 * Alternatif "hepsi atlanınca bir işaret notu yaz" idi ve REDDEDİLDİ: `notes`
 * kurumsal hafızadır, içine anlamsız bir kayıt koymak AI'ın bağlamını kirletir.
 *
 * ============================================================================
 * GÜVENLİK DEĞERİ YOKTUR — `bo_last_tenant` ile aynı felsefe
 * ============================================================================
 * Bu yalnızca bir UX ipucudur. Kurcalanması, silinmesi veya başka bir tarayıcıda
 * bulunmaması en kötü ihtimalle wizard'ı bir kez daha gösterir; hiçbir veriye
 * erişim açmaz, hiçbir yetki taşımaz. Bu yüzden doğrulanmaz ve sunucuya
 * GÖNDERİLMEZ.
 *
 * `localStorage`, cookie DEĞİL: bunu okuyan bir middleware ya da sunucu yok.
 * Cookie olsaydı değer her istekte boşuna taşınırdı (`bo_last_tenant`'ın cookie
 * olma sebebi middleware'in onu okumasıdır — burada öyle bir ihtiyaç yok).
 *
 * ============================================================================
 * İKİNCİ GÖREVİ: gereksiz istek engelleme
 * ============================================================================
 * Bayrak aynı zamanda "bu tenant'ın notu var" bilgisini önbelleğe alır. Bayrak
 * varsa dashboard her açılışında varlık kontrolü isteği ATILMAZ.
 * ============================================================================
 */
const KEY_PREFIX = 'bo_onboarding_done:';

function storage(): Storage | undefined {
  // SSR'da `window` yoktur; ayrıca gizli mod/kısıtlı ayarlarda `localStorage`
  // erişimi istisna fırlatabilir. İkisinde de sessizce yokmuş gibi davranırız —
  // sonucu wizard'ın bir kez daha gösterilmesidir, kırılma değil.
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function isOnboardingCompleted(tenantId: string): boolean {
  return storage()?.getItem(KEY_PREFIX + tenantId) === '1';
}

export function markOnboardingCompleted(tenantId: string): void {
  try {
    storage()?.setItem(KEY_PREFIX + tenantId, '1');
  } catch {
    // Kota dolu veya yazma yasak. Yutulur: bayrak yazılamazsa wizard bir daha
    // sorulur, ki bu tolere edilebilir — istisnayı yukarı bırakmak akışı
    // kırardı ve kullanıcı için çok daha kötü olurdu.
  }
}
