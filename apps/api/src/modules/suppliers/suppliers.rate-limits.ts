/**
 * Tedarikci Yonetimi'nin DEKLARE ettigi oran siniri eylemi (ADR-0029 §5,
 * ADR-0031 §4.2, ADR-0040 §6).
 *
 * ============================================================================
 * ⚠️ AD `suppliers_embedding` — `create_supplier` ya da `create_interaction`
 * DEGIL
 * ============================================================================
 * ADR-0035'in adlandirma dersi DORDUNCU kez izleniyor. Kural tek cumleyle:
 * **cagri para harciyorsa sayilir, harcamiyorsa sayilmaz.**
 *
 * Bu modulde HARCAMAYAN yollar:
 *   - tedarikci olusturma / guncelleme (`POST` · `PATCH /suppliers`),
 *   - kisi olusturma / guncelleme / silme,
 *   - her turlu okuma.
 *
 * HARCAYAN yollar:
 *   - gorusme yazma (`POST /suppliers/interactions`),
 *   - `POST /suppliers/reindex`.
 *
 * ============================================================================
 * ⚠️ STOK'TAN FARKLI BIR INCELIK: SAYAC BURADA KOSULSUZ
 * ============================================================================
 * Randevu ve Stok'ta not OPSIYONELDI ("notsuz randevu cok yaygin", "bir vidanin
 * notu olmaz") ve pay YALNIZCA not varsa odeniyordu. Burada gorusme metni
 * ZORUNLUDUR — bir gorusme kaydinin metinsiz olmasi diye bir sey yoktur.
 *
 * Sonucu: sayac ile maliyet arasindaki oran SABIT ve BIRE BIRDIR. Bu, oran
 * sinirinin bilinen sinirini (ADR-0029 §5: "istek SAYISINI baglar, TOKEN
 * harcamasini degil") bu modulde PRATIKTE ZARARSIZ kilar.
 *
 * ⚠️ Ama tersi de kayda geciyor: Stok'ta "en sik islem hicbir sey harcamiyor"du
 * (hareket yazmak). Burada EN SIK ISLEM (gorusme yazmak) HER ZAMAN harcar.
 *
 * ============================================================================
 * ⚠️ YENIDEN ADLANDIRMANIN BEDELI ANINDA DEGIL, `reindex`TE ODENIR
 * ============================================================================
 * Stok'ta kalemin ADI degistiginde vektor AYNI ISLEMDE yeniden uretiliyordu ve
 * bu yuzden `PATCH` de pay oduyordu. Burada oyle DEGIL: ad ayri satirda yasar
 * ve bir tedarikcinin 200 gorusmesi olabilir — tek bir `PATCH`i 200 embedding
 * cagrisina cevirmek, oran sinirinin istegi ORTASINDA kesmesi demekti (yarisi
 * yeni, yarisi eski baslikli bir vektor kumesi: en kotu hal).
 *
 * Bu yuzden `PATCH` BEDAVA, onarim ACIK ve BUTCELIDIR.
 *
 * ============================================================================
 * NEDEN AYRI KOVA
 * ============================================================================
 * `inventory_embedding` Stok'un, `document_embedding` Belge'nin sozlugudur;
 * Tedarikci onlari deklare edemez. Asil gerekce semantiktir (ADR-0029 §5):
 * bunlar FARKLI IS AKISLARIDIR. Sabah depo kalemi acmis bir kullanicinin
 * ogleden sonra tedarikci gorusmesi yazamamasi anlamsiz olurdu.
 *
 * ⚠️ Mekanizma PLATFORMUN (`platform.rate_limits`); modul yalnizca kendi
 * kalemini deklare eder ve platform icerigi YORUMLAMAZ. SEKIZINCI modulde de
 * SEKIZINCI bir sayac tablosu ACILMIYOR.
 *
 * ============================================================================
 * KOVA BUYUKLUGU: RANDEVU/STOK SINIFI, BELGE SINIFI DEGIL
 * ============================================================================
 * Belge kucuk bir kova (varsayilan 10) secmisti cunku BIR BELGE = N PARCA = N
 * embedding cagrisi ve N, 300'e kadar cikabiliyordu.
 *
 * Burada oyle DEGIL: chunk tablosu yok (§2.2), yani KAYIT BASINA TAM BIR
 * embedding cagrisi var. Varsayilan bu yuzden 60.
 *
 * ============================================================================
 * YENIDEN INDEKSLEME BU KOVAYI PAYLASIR
 * ============================================================================
 * ADR-0029'un gerekcesi birebir gecerli: "ayri bir kova, onarimi BUTCESIZ BIR
 * YAN KAPIYA cevirirdi." Asil fren `SUPPLIERS_REINDEX_BATCH_SIZE`dir.
 */
export const SUPPLIERS_EMBEDDING_ACTION = 'suppliers_embedding';
