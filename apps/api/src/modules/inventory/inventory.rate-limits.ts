/**
 * Stok / Envanter'in DEKLARE ettigi oran siniri eylemi (ADR-0029 §5,
 * ADR-0031 §4.2, ADR-0039 §5).
 *
 * ============================================================================
 * ⚠️ AD `inventory_embedding` — `create_item` ya da `create_movement` DEGIL
 * ============================================================================
 * ADR-0035'in adlandirma dersi UCUNCU kez izleniyor ve burada AYRIM EN KESKIN:
 *
 *   - Bu modulun EN SIK islemi HAREKET YAZMAKTIR ve bir hareket HICBIR SEY
 *     HARCAMAZ: ne embedding cagrisi, ne token. Bir depo gorevlisi gunde yuzlerce
 *     hareket yazabilir ve tek kurus AI maliyeti uretmez.
 *   - AI maliyeti yalnizca KALEM NOTU olan yazma yollarindan gelir: notlu kalem
 *     olusturma, notu ya da AD/SKU'yu degistiren `PATCH` (§6.2 — baslik
 *     degistigi icin vektor yeniden uretilir) ve `reindex`.
 *
 * `create_movement` adli bir sayac, kotasini "kac hareket yazdim" diye sayan bir
 * kullaniciya YANLIS BILGI verirdi — ve bu yanlis bilgi SESSIZ kalirdi: hicbir
 * hata dusmez, yalnizca kota beklenmedik bir anda biter ya da hic bitmez.
 *
 * Kural tek cumleyle: **cagri para harciyorsa sayilir, harcamiyorsa sayilmaz.**
 *
 * ============================================================================
 * ⚠️ `PATCH` ILE ILGILI INCE NOKTA: AD DEGISIMI DE PAY ODER
 * ============================================================================
 * Onceki modullerde yalnizca NOT degisimi pay oderdi. Burada kalemin ADI ya da
 * SKU'su degistiginde de oder, cunku ikisi de BAGLAM BASLIGINA girer (§6.2) ve
 * vektor AYNI ISLEMDE yeniden uretilir.
 *
 * Bu, "bayatlama penceresi yok" kazanciyla AYNI MADALYONUN diger yuzudur:
 * bedava degildir, sayaca yansir. Ayrim use case'te yapilir, burada degil.
 *
 * ============================================================================
 * NEDEN AYRI KOVA
 * ============================================================================
 * `document_embedding` Belge'nin, `appointment_embedding` Randevu'nun
 * sozlugudur; Stok onlari deklare edemez. Asil gerekce semantiktir
 * (ADR-0029 §5): bunlar FARKLI IS AKISLARIDIR. Sabah sozlesme yuklemis bir
 * kullanicinin ogleden sonra depo kalemi acamamasi anlamsiz olurdu.
 *
 * ⚠️ Mekanizma PLATFORMUN (`platform.rate_limits`); modul yalnizca kendi
 * kalemini deklare eder ve platform icerigi YORUMLAMAZ (ADR-0031 §4.2).
 * YEDINCI modulde de YEDINCI bir sayac tablosu ACILMIYOR.
 *
 * ============================================================================
 * KOVA BUYUKLUGU: RANDEVU SINIFI, BELGE SINIFI DEGIL
 * ============================================================================
 * Belge kucuk bir kova (varsayilan 10) secmisti cunku BIR BELGE = N PARCA = N
 * embedding cagrisi ve N, 300'e kadar cikabiliyordu.
 *
 * Burada oyle DEGIL: chunk tablosu yok (§5), yani KAYIT BASINA EN FAZLA BIR
 * embedding cagrisi var — Randevu ile ayni maliyet profili. Varsayilan bu yuzden
 * `APPOINTMENTS_EMBEDDING_RATE_LIMIT` ile ayni sinifta (60).
 *
 * ⚠️ Oran siniri ISTEK SAYISINI baglar, TOKEN harcamasini degil (ADR-0029 §5
 * bilinen sinir). Bu modulde sinir PRATIKTE zararsizdir cunku sayac ile maliyet
 * arasindaki oran SABITTIR: bir istek en fazla bir cagri.
 *
 * ============================================================================
 * YENIDEN INDEKSLEME BU KOVAYI PAYLASIR
 * ============================================================================
 * ADR-0029'un gerekcesi birebir gecerli: "ayri bir kova, onarimi BUTCESIZ BIR
 * YAN KAPIYA cevirirdi." Ayni maliyet profili, ayni kova. Asil fren
 * `INVENTORY_REINDEX_BATCH_SIZE`dir.
 */
export const INVENTORY_EMBEDDING_ACTION = 'inventory_embedding';
