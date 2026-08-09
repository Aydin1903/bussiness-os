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

/**
 * Musteri ozeti uretme payi (ADR-0032 §2).
 *
 * ============================================================================
 * `create_interaction` KOVASINI PAYLASMAZ — yeniden indekslemeden FARKLI
 * ============================================================================
 * Yeniden indeksleme gorusme kovasini PAYLASIR cunku ayni maliyet profilini
 * tasir (parca basina bir embedding) ve ayri bir kova onarimi butcesiz bir yan
 * kapiya cevirirdi.
 *
 * Ozet farklidir ve iki sebeple ayri kova hak eder:
 *   1. FARKLI PORT, FARKLI FIYAT. Bu `LLMPort.complete`tir (completion),
 *      digerleri `EmbeddingPort.embed`. Token basina maliyetleri ayri
 *      buyuklukte; tek kovada birinin tuketimi digerini sessizce kisitlardi.
 *   2. FARKLI IS AKISI. Gorusme yazmak bir KAYIT eylemidir ve gun icinde
 *      onlarca kez olur; ozet okumak bir HAZIRLIK eylemidir (musteriyi
 *      aramadan once). Gunun notlarini girmis bir temsilcinin ozet
 *      alamamasi anlamsiz olurdu — ADR-0029 §5'in "iki eylem AYRI KOVADIR"
 *      kararinin aynisi.
 *
 * ⚠️ Bu kova istek SAYISINI baglar, TOKEN harcamasini degil. Token tarafindaki
 * fren baglam tavanidir (`CRM_SUMMARY_CONTEXT_INTERACTIONS` ve
 * `CRM_SUMMARY_CHARS_PER_INTERACTION`), israf freni ise cagriyi tumden keser.
 */
export const CRM_GENERATE_COMPANY_SUMMARY_ACTION = 'generate_company_summary';
