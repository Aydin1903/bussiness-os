/**
 * Context Engine'in DISA ACIK yuzeyi (ARCHITECTURE §6.1, ADR-0031 §5.1).
 *
 * ============================================================================
 * NEDEN VAR — lint kurali BU IHLALI YAKALADI
 * ============================================================================
 * Knowledge ilk yazimda `platform/context/application/retrieval-contributor.port`
 * dosyasini DOGRUDAN import ediyordu. `import/no-restricted-paths` bunu
 * derlemede reddetti: "context modulunun internal kodu disaridan import
 * edilemez."
 *
 * Kural haklıydi. Bir modulun katkici KAYDETMEK icin bilmesi gereken sey
 * yalnizca SOZLESMEDIR (port + token); `AskUseCase`, kayit defterinin
 * implementasyonu ya da prompt'lar onu ILGILENDIRMEZ. Bu dosya o dar yuzeyi
 * cizer — `authz.public.ts` ile birebir ayni desen ve ayni gerekce.
 *
 * ⚠️ Buraya bir sey EKLEMEDEN once sorulacak soru: "bunu bir IS MODULU bilmek
 * ZORUNDA mi?" Cevap hayirsa `application/` altinda kalir.
 * ============================================================================
 */
export {
  RETRIEVAL_CONTRIBUTOR_REGISTRY,
  type ContextFragment,
  type ContributeInput,
  // ADR-0036: katkici turunu MODUL deklare eder, bu yuzden tip disa aciktir.
  type ContributionKind,
  type RetrievalContributor,
  type RetrievalContributorRegistry,
} from './application/retrieval-contributor.port';
