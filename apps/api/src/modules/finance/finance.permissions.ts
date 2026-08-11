import { type PermissionRule } from '../../platform/authz/authz.public';

/**
 * Finans'in DEKLARE ettigi permission katalogu (ADR-0025, ADR-0034 §7).
 *
 * ============================================================================
 * ⚠️ BU KATALOG PROJEDEKI ILK **DAR** KATALOGDUR
 * ============================================================================
 * CRM ve Projeler'de dort rolun DORDU DE okuma aliyordu. Burada almiyor:
 * `member` ve `viewer` finansi HIC gormez (Product Owner karari, 2026-08-10).
 *
 * Gerekce isin tabiatidir: musteri listesi ve gorev listesi PAYLASILAN is
 * gercekleridir, sirketin nakit akisi degildir.
 *
 * ============================================================================
 * BUNUN MIMARI YAN ETKISI — `POST /ask` IZIN FILTRESININ ILK GERCEK TETIKCISI
 * ============================================================================
 * ADR-0031 §5.3 katkicilarin cagiranin izinlerine gore elenmesini "tasarimin en
 * kritik detayi" diye tanimlamisti. O kapi bugune kadar HIC GERCEKTEN
 * TETIKLENMEDI: dort rol de her kaynagi goruyordu (CLAUDE.md: "kapi var,
 * tetikci yok"), ve ADR-0033'un kapanis denetiminde `company:read`'siz bir
 * kullanici URETILEMEDI.
 *
 * Slice 5-6'da Finans katkicilari kaydedildiginde bir `member` gercekten
 * `cashflow:read` tasimayacak ve iki katkici onun sorusunda HIC CAGRILMAYACAK.
 * Yani bu dosya, bir izin mekanizmasini ilk kez GERCEK bir rolle sinanabilir
 * hale getiriyor.
 *
 * ============================================================================
 * `finance_category` NEDEN NITELENMIS AD
 * ============================================================================
 * `category:read` global permission ad uzayinda TEKIL DEGILDIR — Stok/Envanter
 * (ROADMAP §3.5, 6. modul) kendi kategorilerini isteyecek ve ayni string'i
 * talep edecek. `progress_note` zaten bilesik bir ad emsali kurdu.
 *
 * Model BOZULMUYOR: hala `resource:action`, yalnizca resource daha ozgul
 * adlandirildi.
 *
 * ============================================================================
 * KATALOG UCLA BIRLIKTE BUYUR
 * ============================================================================
 * Bu slice YALNIZCA kategorileri aciyor, dolayisiyla yalnizca
 * `finance_category:*` deklare ediliyor. `transaction:*`, `cashflow:read` ve
 * `commentary:*` kendi slice'larinda gelir — var olmayan bir fiili deklare
 * etmek yanlis olurdu (Projeler'de uc slice boyunca uygulanan ayni disiplin).
 * ============================================================================
 */

export const FINANCE_CATEGORY_READ = 'finance_category:read';
export const FINANCE_CATEGORY_WRITE = 'finance_category:write';
export const FINANCE_CATEGORY_DELETE = 'finance_category:delete';

/**
 * Islem izinleri (ADR-0034 §7).
 *
 * ⚠️ `transaction` NITELENMEMIS bir addir ve bu bilinclidir — `category`den
 * FARKLI. Sebep, aynı sorunun cevabinin farkli cikmasidir: bir baska modulun
 * "kategori"si olmasi COK MUHTEMELDIR (Stok/Envanter), bir baska modulun
 * "islem"i olmasi ise degildir. Gereksiz nitelemek de bir maliyettir: her
 * kullanimda okunan daha uzun bir string ve "neden bu nitelenmis, oteki degil"
 * sorusu.
 *
 * ⚠️ `delete` VAR — `interaction`/`progress_note`ta YOKTU. Onlar ekleme-yalniz
 * gunluklerdi; islem ise YASAYAN bir veri kalemidir ve yanlis girilmis bir
 * kayit silinebilmelidir (ADR-0034 §8).
 */
export const TRANSACTION_READ = 'transaction:read';
export const TRANSACTION_WRITE = 'transaction:write';
export const TRANSACTION_DELETE = 'transaction:delete';

/**
 * Nakit akisi ozeti izni (ADR-0034 §7).
 *
 * ============================================================================
 * NEDEN `transaction:read`TEN AYRI
 * ============================================================================
 * "Ozeti gorur ama tek tek islemleri gormez" GERCEK ve klasik bir taleptir:
 * yoneticiye toplam, muhasebeciye detay. `opportunity:read`in `company:read`ten
 * ayri tutulmasiyla ayni gerekce.
 *
 * ⚠️ Ozet, islemlerden TURETILMIS bir bilgidir — yani `cashflow:read` tasiyip
 * `transaction:read` tasimayan biri, gormedigi kayitlarin TOPLAMINI gorur. Bu
 * bir sizinti DEGIL, bilincli bir KABALASTIRMADIR: talebin kendisi tam olarak
 * budur. Ayrimin tersi (detayi gorup toplami gormemek) anlamsiz olurdu.
 *
 * Ayrica Slice 6'nin YAPISAL katkicisinin kapisi budur: `POST /ask`te finans
 * ozetini goren kullanici, bu izni tasiyandir.
 */
export const CASHFLOW_READ = 'cashflow:read';

/**
 * ============================================================================
 * ⚠️ UC PERMISSION DA BUGUN AYNI KUMEYI TASIYOR — AYRIMIN BUGUNKU DEGERI SIFIR
 * ============================================================================
 * Bu acikca kaydediliyor cunku aksi halde bir okuyucu ayrimin bugun bir sey
 * yaptigini sanabilir. Yapmiyor.
 *
 * Yine de ayri tutuluyorlar, `knowledge.permissions.ts`in yazdigi ayni
 * gerekceyle: "iki permission, bugun ayni kume — yarin bagimsiz degisebilir".
 * Degeri tenant-configurable roller (ROADMAP §1.1) geldiginde ortaya cikar; o
 * gun "muhasebeci kategori acar ama silemez" TEK SATIRLIK bir degisiklik olur.
 *
 * `delete` ayrica `write`'tan ayri durmak ZORUNDA: silme geri alinamaz ve
 * (Slice 2'den itibaren) gecmis kayitlarin siniflandirmasina dokunur.
 * ============================================================================
 */
export const FINANCE_PERMISSIONS: readonly PermissionRule[] = [
  { permission: FINANCE_CATEGORY_READ, roles: ['owner', 'admin'] },
  { permission: FINANCE_CATEGORY_WRITE, roles: ['owner', 'admin'] },
  { permission: FINANCE_CATEGORY_DELETE, roles: ['owner', 'admin'] },

  { permission: TRANSACTION_READ, roles: ['owner', 'admin'] },
  { permission: TRANSACTION_WRITE, roles: ['owner', 'admin'] },
  { permission: TRANSACTION_DELETE, roles: ['owner', 'admin'] },

  { permission: CASHFLOW_READ, roles: ['owner', 'admin'] },
];
