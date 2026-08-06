import { type PermissionRule } from '../authz/authz.public';

/**
 * Context Engine'in DEKLARE ettigi permission katalogu (ADR-0025, ADR-0031 §5.3).
 *
 * ============================================================================
 * `knowledge:ask` -> `context:ask` (breaking change, Product Owner onayi)
 * ============================================================================
 * Uc artik Knowledge'a ait DEGIL: `POST /api/v1/ask` tum modullerin katkisini
 * birlestirir. Izni `knowledge:` onekiyle birakmak, platform ucunu bir is
 * modulunun sozlugune baglardi.
 *
 * ROLLER DEGISMEDI (owner, admin, member; `viewer` HARIC). Faz 4'un karari
 * sessizce cevrilmiyor — ADR-0031 §6, viewer'a `context:ask` vermenin artik
 * GUVENLI oldugunu (katkicilar zaten izne gore eleniyor) ama bunun AYRI bir
 * karar oldugunu soyluyor.
 * ============================================================================
 *
 * ⚠️ `context:ask` "soru sorabilir mi" (MALIYET) sorusudur. "Hangi kaynaklari
 * gorur" (ICERIK) AYRI bir sorudur ve katkici basina, o katkicinin kendi
 * permission'i ile yanitlanir.
 */
export const CONTEXT_ASK = 'context:ask';

export const CONTEXT_PERMISSIONS: readonly PermissionRule[] = [
  { permission: CONTEXT_ASK, roles: ['owner', 'admin', 'member'] },
];
