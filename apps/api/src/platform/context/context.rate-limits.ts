/**
 * Context Engine'in oran siniri eylemi (ADR-0029 §5, ADR-0031 §4.2).
 *
 * Deger `'ask'` OLARAK KORUNDU — `platform.rate_limits` satirlari ve mevcut
 * kullanicilarin pencere sayaclari bu adla yaziliyor. Adi degistirmek, calisan
 * kotalari sessizce sifirlardi; kazanci ise yalnizca kozmetik olurdu.
 */
export const CONTEXT_ASK_ACTION = 'ask';
