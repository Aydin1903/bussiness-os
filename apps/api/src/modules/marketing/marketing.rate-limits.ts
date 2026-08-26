/**
 * Kampanya modulunun DEKLARE ettigi oran siniri eylemi (ADR-0029 §5,
 * ADR-0047 §8).
 *
 * ============================================================================
 * ⚠️ AD `marketing_embedding` — `create_campaign` DEGIL
 * ============================================================================
 * ADR-0035'in adlandirma dersi ALTINCI kez izleniyor. Kural tek cumleyle:
 * **cagri para harciyorsa sayilir, harcamiyorsa sayilmaz.**
 *
 * HARCAMAYAN yollar:
 *   - ⚠️ SONUC NOTSUZ kampanya yazma (`POST /campaigns`, `resultNote` yok),
 *   - ⚠️ yalnizca `status` / `crmCompanyId` degistiren `PATCH` (§4.2),
 *   - okuma (liste, detay),
 *   - SILME — hicbir saglayici cagrisi uretmez.
 *
 * HARCAYAN yollar:
 *   - sonuc notlu yazma,
 *   - ⚠️ GOMULEN BIR ALANI degistiren `PATCH`,
 *   - `POST /campaigns/reindex`.
 *
 * ============================================================================
 * ⚠️ `PATCH`IN SAYMASI, GERI BILDIRIM'DEN AYRILDIGIMIZ NOKTADIR
 * ============================================================================
 * `feedback.responses` GUNCELLENMIYORDU, yani orada boyle bir yol yoktu.
 * Burada var — ve sayilmasaydi, kotasi dolmus bir tenant sinirsiz yeniden
 * gomme yaptirabilirdi: ⚠️ SINIRIN ARKASINDAN DOLASAN BIR YOL.
 *
 * ============================================================================
 * YENIDEN INDEKSLEME BU KOVAYI PAYLASIR
 * ============================================================================
 * ADR-0029'un gerekcesi birebir gecerli, SEKIZINCI kez: "ayri bir kova,
 * onarimi BUTCESIZ BIR YAN KAPIYA cevirirdi."
 */
export const MARKETING_EMBEDDING_ACTION = 'marketing_embedding';
