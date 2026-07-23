import { Injectable } from '@nestjs/common';

import { UnauthenticatedError, type CurrentUserProvider } from '../../shared/current-user.port';
import { getPrincipal } from './auth-context';

/**
 * `CurrentUserProvider`'in uretim implementasyonu.
 *
 * Kimligi DOGRULANMIS token'dan gelen istek baglamindan okur — istek govdesinden
 * DEGIL (DEVELOPMENT_RULES 4.5). Baglami auth middleware kurar; burasi yalnizca
 * okur, dolayisiyla Tenant modulu Identity'yi import etmeden dogrulanmis kimlige
 * ulasir.
 *
 * Kimlik yoksa `null` DONMEZ, HATA firlatir: cagiran tarafi "kullanici yoksa ne
 * yapayim" kararina zorlamak, o karari her endpoint'te tekrar vermek demektir ve
 * biri yanlis verir (port sozlesmesi).
 *
 * Faz 2'deki `UnavailableCurrentUserProvider` bu sinifla DEGISTIRILDI — o,
 * Identity gelene kadar her cagriyi reddeden bilincli bir kapiydi.
 */
@Injectable()
export class ContextCurrentUserProvider implements CurrentUserProvider {
  requireUserId(): string {
    const principal = getPrincipal();

    if (principal === undefined) {
      throw new UnauthenticatedError();
    }

    return principal.userId;
  }
}
