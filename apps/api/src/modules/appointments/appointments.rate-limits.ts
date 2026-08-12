/**
 * Randevu'nun DEKLARE ettigi oran siniri eylemi (ADR-0029 §5, ADR-0031 §4.2,
 * ADR-0035 §9).
 *
 * ============================================================================
 * ⚠️ AD `appointment_embedding` — `create_appointment` DEGIL
 * ============================================================================
 * Onceki uc modul `create_interaction` · `create_progress_note` ·
 * `create_commentary` yaziyor. Bu modul o kaliptan BILINCLI OLARAK AYRISIR ve
 * sebep, SINIRLANAN SEYIN FARKLI OLMASIDIR:
 *
 *   - Onceki uclunde AI maliyeti ureten sey kayit OLUSTURMAKTI ve HER
 *     olusturma bir embedding demekti; ad ile olcu birebir ortusuyordu.
 *   - Burada ortusmuyor. NOTSUZ BIR RANDEVU HICBIR SEY HARCAMAZ (ve notsuz
 *     randevu bu modulde COK YAYGINDIR — takvime yalnizca saat yazmak),
 *     buna karsilik bir GUNCELLEME harcar (not degistiginde vektor yeniden
 *     uretilir, ADR-0035 §5).
 *
 * `create_` oneki, sayacin NE OLCTUGU konusunda YANLIS BILGI verirdi ve bu
 * yanlis bilgi SESSIZ kalirdi: kotasini "kac randevu actim" diye sayan bir
 * kullanici, hic randevu acmadan kotasini tuketebilirdi.
 *
 * ⚠️ SAYAC YALNIZCA GERCEKTEN EMBEDDING URETILEN YOLLARDA ARTAR. Kural tek
 * cumleyle: **cagri para harciyorsa sayilir, harcamiyorsa sayilmaz.**
 *
 * ============================================================================
 * NEDEN AYRI KOVA
 * ============================================================================
 * `create_commentary` Finans'in, `create_progress_note` Projeler'in
 * sozlugudur; Randevu onlari deklare edemez. Asil gerekce semantiktir
 * (ADR-0029 §5): bunlar FARKLI IS AKISLARIDIR. Ay sonu finans yorumunu yazmis
 * bir kullanicinin gunun randevusuna not dusememesi anlamsiz olurdu.
 *
 * ⚠️ Mekanizma PLATFORMUN (`platform.rate_limits`); modul yalnizca kendi
 * kalemini deklare eder ve platform icerigi YORUMLAMAZ (ADR-0031 §4.2).
 * BESINCI modulde de BESINCI bir sayac tablosu ACILMIYOR.
 *
 * ============================================================================
 * YENIDEN INDEKSLEME BU KOVAYI PAYLASIR
 * ============================================================================
 * ADR-0029'un gerekcesi birebir gecerli: "ayri bir kova, onarimi BUTCESIZ BIR
 * YAN KAPIYA cevirirdi." Ayni maliyet profili (kayit basina bir embedding
 * cagrisi), ayni kova.
 *
 * ⚠️ Oran siniri ISTEK SAYISINI baglar, TOKEN harcamasini degil (ADR-0029 §5
 * bilinen sinir). Asil fren `APPOINTMENTS_REINDEX_BATCH_SIZE`dir.
 *
 * ⚠️ Bu modulde token basi maliyet ONCEKILERDEN DUSUKTUR ve sebebi §3'tur:
 * chunking yok, yani kayit basina EN FAZLA BIR embedding cagrisi var. Finans'ta
 * uzun bir yorum onlarca cagri uretebilir; burada notun tamami tek bir
 * parcaya sigmak ZORUNDA (`MAX_SERVICE_NOTE_CHARS`).
 */
export const APPOINTMENT_EMBEDDING_ACTION = 'appointment_embedding';
