/**
 * Finans'in DEKLARE ettigi oran siniri eylemi (ADR-0029 §5, ADR-0031 §4.2,
 * ADR-0034 §9).
 *
 * ============================================================================
 * NEDEN AYRI KOVA
 * ============================================================================
 * `create_progress_note` Projeler'in, `create_interaction` CRM'in sozlugudur;
 * Finans onlari deklare edemez. Ama asil gerekce semantiktir ve ADR-0029 §5'in
 * "iki eylem AYRI KOVADIR" kararinin aynisidir: bunlar FARKLI IS AKISLARIDIR.
 * Gunun proje notlarini girmis bir kullanicinin ay sonu finans yorumunu
 * yazamamasi anlamsiz olurdu.
 *
 * ⚠️ Mekanizma PLATFORMUN (`platform.rate_limits`); modul yalnizca kendi
 * kalemini deklare eder ve platform icerigi YORUMLAMAZ (ADR-0031 §4.2).
 * DORDUNCU modulde de DORDUNCU bir tablo acilmiyor — desenin ise yaradiginin
 * olcusu budur.
 *
 * ============================================================================
 * YENIDEN INDEKSLEME BU KOVAYI PAYLASIR
 * ============================================================================
 * ADR-0029'un gerekcesi birebir gecerli: "ayri bir kova, onarimi BUTCESIZ BIR
 * YAN KAPIYA cevirirdi." Ayni maliyet profili (parca basina bir embedding
 * cagrisi), ayni kova.
 *
 * ⚠️ Oran siniri ISTEK SAYISINI baglar, TOKEN harcamasini degil (ADR-0029 §5
 * bilinen sinir; ROADMAP §8.1'de olculebilir hale geldi ama hala
 * zorlanmiyor). Asil fren `FINANCE_REINDEX_BATCH_SIZE`dir: tek bir onarim
 * cagrisinda kac yorumun islenecegini o belirler.
 */
export const FINANCE_CREATE_COMMENTARY_ACTION = 'create_commentary';
