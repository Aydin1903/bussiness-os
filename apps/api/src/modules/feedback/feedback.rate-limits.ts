/**
 * Musteri Geri Bildirimi'nin DEKLARE ettigi oran siniri eylemi (ADR-0029 §5,
 * ADR-0045 §8).
 *
 * ============================================================================
 * ⚠️ AD `feedback_embedding` — `create_feedback` DEGIL
 * ============================================================================
 * ADR-0035'in adlandirma dersi BESINCI kez izleniyor. Kural tek cumleyle:
 * **cagri para harciyorsa sayilir, harcamiyorsa sayilmaz.**
 *
 * HARCAMAYAN yollar:
 *   - ⚠️ YORUMSUZ geri bildirim yazma (`POST /feedback`, `comment` yok),
 *   - okuma (liste, detay),
 *   - ⚠️ SILME — hicbir saglayici cagrisi uretmez.
 *
 * HARCAYAN yollar:
 *   - YORUMLU geri bildirim yazma,
 *   - `POST /feedback/reindex`.
 *
 * ============================================================================
 * ⚠️ SAYAC KOSULLU — VE BU, TEDARIKCI'DEN AYRILDIGIMIZ YER
 * ============================================================================
 * `suppliers_embedding` KOSULSUZDU cunku gorusme metni ZORUNLUYDU: her yazma
 * bir cagri uretiyordu ve sayac ile maliyet arasindaki oran BIRE BIRDI.
 *
 * Burada yorum OPSIYONELDIR (ADR-0045 §1.4) — Randevu'nun `serviceNote`u ve
 * Stok'un `note`u ile ayni sinif. Yorumsuz bir kayit saglayiciya HIC GITMEZ ve
 * payi da DUSMEZ.
 *
 * ⚠️ Kosulsuz bir sayac, kotasini "kac geri bildirim girdim" diye sayan bir
 * kullaniciya YANLIS BILGI verirdi ve bu bilgi SESSIZ kalirdi. ⚠️ Ustelik bu
 * modulde bedel DAHA AGIR olurdu: bir isletme QR kodla YALNIZCA PUAN topluyor
 * olabilir — yani HICBIR embedding uretmeyen bir kullanim deseni, kosulsuz bir
 * sayacta saatte 60 kayitla SINIRLANIRDI.
 *
 * ============================================================================
 * NEDEN AYRI KOVA
 * ============================================================================
 * `suppliers_embedding` Tedarikci'nin, `inventory_embedding` Stok'un
 * sozlugudur; Geri Bildirim onlari deklare edemez. Asil gerekce semantiktir
 * (ADR-0029 §5): bunlar FARKLI IS AKISLARIDIR. Sabah tedarikci gorusmesi
 * yazmis bir kullanicinin ogleden sonra musteri anketi girememesi anlamsiz
 * olurdu.
 *
 * ⚠️ Mekanizma PLATFORMUN (`platform.rate_limits`); modul yalnizca kendi
 * kalemini deklare eder ve platform icerigi YORUMLAMAZ. ONUNCU modulde de
 * ONUNCU bir sayac tablosu ACILMIYOR.
 *
 * ============================================================================
 * KOVA BUYUKLUGU: RANDEVU/STOK/TEDARIKCI SINIFI (60), BELGE SINIFI (10) DEGIL
 * ============================================================================
 * Belge kucuk bir kova secmisti cunku BIR BELGE = N PARCA = N embedding
 * cagrisi ve N, 300'e kadar cikabiliyordu. Burada chunk tablosu YOK (§1.2),
 * yani KAYIT BASINA EN FAZLA BIR cagri var.
 *
 * ============================================================================
 * YENIDEN INDEKSLEME BU KOVAYI PAYLASIR
 * ============================================================================
 * ADR-0029'un gerekcesi birebir gecerli, YEDINCI kez: "ayri bir kova, onarimi
 * BUTCESIZ BIR YAN KAPIYA cevirirdi." Asil fren `FEEDBACK_REINDEX_BATCH_SIZE`.
 */
export const FEEDBACK_EMBEDDING_ACTION = 'feedback_embedding';
