import { type PermissionRule } from '../../platform/authz/authz.public';

/**
 * Stok / Envanter'in DEKLARE ettigi permission katalogu (ADR-0025, ADR-0039 §8).
 *
 * ============================================================================
 * ⚠️ ADLAR NITELENMIS: `stock_item`, `item` DEGIL
 * ============================================================================
 * ADR-0037 `document`i NITELEMEDI ve gerekcesini soyle yazdi:
 *
 *   "`finance_category` nitelenmisti cunku bir baska modulun 'kategori'si
 *    olmasi COK MUHTEMELDI (Stok/Envanter)."
 *
 * AYNI TEST `item` icin uygulandi ve SONUC TERSINE CIKTI: "item" bu projedeki
 * en cok talip olan kelimedir. **8. modul (Teklif/Fatura)** tanimi geregi
 * FATURA SATIRI = LINE ITEM kavramini getirecek ve `item:read` o gun ya yeniden
 * adlandirilmak zorunda kalir (BREAKING CHANGE — yayinlanmis bir izin adi
 * degistirmek, o izni tasiyan her rol tanimini ve her testi bozar) ya da iki
 * modul TEK KELIMEYI paylasir.
 *
 * ⚠️ Nitelenen sey YALNIZCA IZIN KAYNAGIDIR. Sema `inventory`, rota
 * `/api/v1/inventory/...`, `data-module="inventory"` — ucu de nitelenmemis
 * kalir cunku onlarda cakisma YOKTUR.
 *
 * ============================================================================
 * ⚠️ KATALOG GENISTIR — ve gerekce Belge'ninkinden FARKLI
 * ============================================================================
 * ADR-0034 §7'nin olcutu aynen tutuyor: _"musteri listesi ve gorev listesi
 * PAYLASILAN is gercekleridir, sirketin nakit akisi degildir."_
 *
 * STOK SEVIYESI PAYLASILAN BIR OPERASYONEL GERCEKTIR — hatta bu listedeki en
 * operasyoneli. Depodan malzeme alan, siparis hazirlayan, uretim yapan kisi TAM
 * OLARAK `member` rolundeki kisidir; onun "kac tane kaldi"yi gorememesi modulun
 * VAR OLUS SEBEBINI ortadan kaldirir.
 *
 * ⚠️ Belge'nin (ADR-0037) _"dar katalog YANLIS BIR GUVENLIK HISSI verirdi"_
 * argumani BURADA GECERLI DEGILDIR ve bu fark kayda geciyor: Belge'de hassasiyet
 * BELGE BASINAYDI (bir teklif taslagi ile bir personel sozlesmesi ayni tabloda),
 * yani rol seviyesinde bir kapi o ayrimi IFADE EDEMIYORDU. Stok verisi kalem
 * bazinda hassasiyet TASIMAZ — bir vidanin adedi ile bir baska vidanin adedi
 * AYNI SINIFTAN bilgidir. Yani burada genis katalog bir TAVIZ degil, DOGRU
 * SEKILDIR.
 *
 * ============================================================================
 * ⚠️ YAN ETKISI: BU MODUL `POST /ask` IZIN FILTRESINI TETIKLEMEZ
 * ============================================================================
 * Iki katkicinin da kapisi `stock_item:read` ve DORT ROL DE onu tasiyor.
 * Filtrenin tek gercek tetikcisi HALA yalnizca Finans'tir (`cashflow:read` /
 * `commentary:read`). Bu acikca kaydediliyor cunku aksi halde bir okuyucu, dar
 * katalogun artik bir konvansiyon oldugunu sanabilir — ya da tersini.
 */

export const STOCK_ITEM_READ = 'stock_item:read';
export const STOCK_ITEM_WRITE = 'stock_item:write';

/**
 * ⚠️ `delete` `write`TAN AYRI DURMAK ZORUNDA.
 *
 * Kalem silmek bu modulde IKI KAT agirdir: `member` silseydi, hicbir hareketi
 * olmayan bir kalemi (yani daha yeni acilmis, belki bir baskasinin acmakta
 * oldugu bir kalemi) yok edebilirdi. Hareketi OLAN kalem zaten silinemez —
 * veritabani reddeder (ADR-0039 §3.4).
 */
export const STOCK_ITEM_DELETE = 'stock_item:delete';

export const STOCK_MOVEMENT_READ = 'stock_movement:read';
export const STOCK_MOVEMENT_WRITE = 'stock_movement:write';

/**
 * ============================================================================
 * ⚠️ `stock_movement:delete` YOKTUR — VE ACILMAYACAKTIR (ADR-0039 §3.3)
 * ============================================================================
 * Defter DEGISTIRILEMEZ. Bir izni ACMAMAK, sonradan KAPATMAKTAN kolaydir:
 * acilmis bir izin, onu tasiyan rollere ve testlere yayilir ve geri almak bir
 * breaking change olur.
 *
 * Koruma UC KATMANLIDIR ve tekrar degil DERINLIKTIR:
 *   1. `StockMovement` sinifinda `update` metodu YOK,
 *   2. bu izin YOK (ve `DELETE /movements/:id` ucu de yok),
 *   3. `movements.item_id -> items.id ON DELETE RESTRICT` — defterin toptan
 *      silinmesini VERITABANI reddeder.
 *
 * ⚠️ Yanlis girilen bir hareketin telafisi TERS YONDE bir hareket yazmaktir;
 * fiziksel sayim akisi (§3.2) bunu otomatik yapar.
 */

export const INVENTORY_PERMISSIONS: readonly PermissionRule[] = [
  { permission: STOCK_ITEM_READ, roles: ['owner', 'admin', 'member', 'viewer'] },
  { permission: STOCK_ITEM_WRITE, roles: ['owner', 'admin', 'member'] },
  { permission: STOCK_ITEM_DELETE, roles: ['owner', 'admin'] },
  { permission: STOCK_MOVEMENT_READ, roles: ['owner', 'admin', 'member', 'viewer'] },
  { permission: STOCK_MOVEMENT_WRITE, roles: ['owner', 'admin', 'member'] },
];
