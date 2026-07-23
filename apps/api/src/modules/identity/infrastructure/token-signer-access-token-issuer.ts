import { type TokenSigner } from '../application/token-signer.port';
import {
  type IssueTenantAccessTokenInput,
  type TenantAccessTokenIssuer,
} from '../identity.public';

/**
 * `TenantAccessTokenIssuer`'in implementasyonu — `TOKEN_SIGNER`'i sarar.
 *
 * Identity'nin `identity.public.ts`'te actigi dar yetenegi somutlastirir: disari
 * yalnizca "tenant-scoped access token bas" acilir, ham imzalayici DEGIL. Bu
 * sinif imzalayiciyi modul ICINDE tutar; `platform/session` yalnizca arayuzu
 * gorur.
 *
 * Saf bir adapter'dir: karar VERMEZ, yalnizca cevirir. Erisim kararini
 * `TENANT_ACCESS_QUERY` verir ve cagiran (switch-tenant use case) `granted`
 * dondugunde buraya gelir.
 */
export class TokenSignerAccessTokenIssuer implements TenantAccessTokenIssuer {
  constructor(private readonly tokenSigner: TokenSigner) {}

  issue(input: IssueTenantAccessTokenInput): Promise<string> {
    return this.tokenSigner.signAccessToken({
      userId: input.userId,
      sessionId: input.sessionId,
      tenantId: input.tenantId,
    });
  }
}
