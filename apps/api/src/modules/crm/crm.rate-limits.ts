/**
 * CRM'in DEKLARE ettigi oran siniri eylemi (ADR-0029 §5, ADR-0031 §4.2).
 *
 * ============================================================================
 * NEDEN AYRI KOVA — `create_note` YENIDEN KULLANILMADI
 * ============================================================================
 * `create_note` Knowledge'in sozlugudur; CRM onu deklare edemez. Ama asil
 * gerekce semantiktir ve ADR-0029 §5'in "iki eylem AYRI KOVADIR" kararinin
 * aynisidir: bunlar FARKLI KISILERIN farkli is akislaridir (satis temsilcisi
 * vs. bilgi yazari). Knowledge not payini bitirmis bir kullanicinin gorusme
 * kaydedememesi anlamsiz olurdu.
 *
 * ============================================================================
 * YENIDEN INDEKSLEME BU KOVAYI PAYLASIR
 * ============================================================================
 * ADR-0029'un yeniden indeksleme notundaki gerekce birebir gecerli: "ayri bir
 * kova, onarimi BUTCESIZ BIR YAN KAPIYA cevirirdi." Ayni maliyet profili
 * (chunk basina bir embedding cagrisi), ayni kova.
 *
 * ⚠️ Oran siniri ISTEK SAYISINI baglar, TOKEN harcamasini degil (ADR-0029 §5
 * bilinen sinir). Asil fren `CRM_REINDEX_BATCH_SIZE`'dir: tek bir onarim
 * cagrisinda kac gorusmenin islenecegini o belirler.
 */
export const CRM_CREATE_INTERACTION_ACTION = 'create_interaction';
