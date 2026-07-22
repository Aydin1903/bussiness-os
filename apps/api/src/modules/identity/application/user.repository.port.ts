import type { Email } from '../domain/email.value-object';
import type { User } from '../domain/user.entity';
import type { UserId } from '../../../shared/user-id.value-object';

/** DI token'i. */
export const USER_REPOSITORY = Symbol('USER_REPOSITORY');

/**
 * `platform.users` kaliciligi icin application port'u.
 *
 * ============================================================================
 * LISTELEME METODU YOK — ve bu, istisnanin da istisnasi degildir
 * ============================================================================
 * `users` tenant-scoped DEGILDIR (MULTI_TENANT_ARCHITECTURE 12.4.3) ve RLS ile
 * korunmaz. O yuzden tek savunma DARLIKTIR: yalnizca `findByEmail` ve `findById`.
 * `findAll` benzeri bir metot, tum platformun kullanici listesini donduren tek
 * satirlik bir sizinti kapisidir (Faz 2'de `TenantRepository` icin uygulanan
 * ayni disiplin).
 *
 * `findByEmail` sonucu istemciye ASLA "bulundu/bulunamadi" olarak yansitilmaz;
 * kayit/giris/dogrulama yanitlari hesabin varligindan bagimsiz olarak aynidir
 * (AUTH_ARCHITECTURE P2).
 *
 * Sorgular tenant context'i OLMADAN calisir — kimlik, tenant seciminden oncedir.
 * ============================================================================
 */
export interface UserRepository {
  findById(id: UserId): Promise<User | null>;

  /** Kimlik dogrulamanin giris noktasi (login/kayit/dogrulama). */
  findByEmail(email: Email): Promise<User | null>;

  /** Insert/update ayrimi yapmaz; transaction ACMAZ (sinir use case'tedir). */
  save(user: User): Promise<void>;
}
