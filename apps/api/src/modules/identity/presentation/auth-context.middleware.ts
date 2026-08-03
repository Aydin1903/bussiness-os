import { Inject, Injectable, UnauthorizedException, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import {
  runWithPrincipal,
  type AuthenticatedPrincipal,
} from '../../../infrastructure/auth/auth-context';
import { TOKEN_SIGNER, type TokenSigner } from '../application/token-signer.port';

/** `Authorization: Bearer <token>` — tek mesru tasima bicimi. */
const BEARER_PATTERN = /^Bearer (?<token>\S+)$/;

/**
 * `Authorization` basligindaki token'i dogrular ve istek baglamina yazar.
 *
 * ============================================================================
 * UC DAVRANIS — ve neden boyle
 * ============================================================================
 * 1. Baslik YOKSA  -> istek ANONIM devam eder. Kayit/giris gibi uc noktalar
 *    tanimi geregi kimliksizdir; burada 401 vermek onlari kullanilamaz kilardi.
 *    Kimligin ZORUNLU oldugu yerlerde karari `CurrentUserProvider` verir.
 * 2. Baslik VAR ama GECERSIZ -> 401. Sessizce "anonim" saymak, kurcalanmis bir
 *    token'i gorunmez kilardi (fail closed).
 * 3. Baslik VAR ve GECERLI -> principal baglama yazilir; cagri agacinin tamami
 *    onu gorur (AsyncLocalStorage).
 *
 * Token'in KENDISI hicbir yere loglanmaz (P1).
 * ============================================================================
 */
@Injectable()
export class AuthContextMiddleware implements NestMiddleware {
  constructor(@Inject(TOKEN_SIGNER) private readonly tokenSigner: TokenSigner) {}

  async use(request: Request, _response: Response, next: NextFunction): Promise<void> {
    let principal: AuthenticatedPrincipal | null;

    try {
      principal = await this.#authenticate(request);
    } catch (error) {
      // Async middleware'de firlatilan hata Express'e `next` ile verilmelidir;
      // aksi halde istek yanitsiz asili kalir.
      next(error);
      return;
    }

    if (principal === null) {
      next();
      return;
    }

    runWithPrincipal(principal, () => {
      next();
    });
  }

  async #authenticate(request: Request): Promise<AuthenticatedPrincipal | null> {
    const header = request.headers.authorization;

    if (header === undefined || header === '') {
      return null; // anonim istek
    }

    const token = BEARER_PATTERN.exec(header)?.groups?.token;
    if (token === undefined) {
      throw new UnauthorizedException('Authorization basligi Bearer bicimimde olmali.');
    }

    try {
      const verified = await this.tokenSigner.verify(token);
      return {
        userId: verified.userId,
        sessionId: verified.sessionId,
        tenantId: verified.tenantId,
      };
    } catch {
      // Sebep (imza / sure / kid) istemciye SIZDIRILMAZ; hepsi ayni 401.
      throw new UnauthorizedException('Token gecersiz.');
    }
  }
}
