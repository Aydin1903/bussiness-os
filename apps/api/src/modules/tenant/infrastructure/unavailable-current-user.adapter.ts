import { Injectable } from '@nestjs/common';

import { IdentityUnavailableError, type CurrentUserProvider } from '../../../shared/current-user.port';

/**
 * GECICI kimlik saglayici: her cagriyi REDDEDER.
 *
 * Kullanici kimligi yalnizca dogrulanmis bir token'dan gelebilir (ADR-0004);
 * Identity modulu Faz 3'te gelecek. O zamana kadar kimlik gerektiren her islem
 * kullanilamaz.
 *
 * Alternatif — istek govdesinden `ownerUserId` okumak — bugun zararsiz gorunur
 * ama bir MAYIN doser: politikalar degistirildigi gun istemci kendisini
 * istedigi kullanici olarak tanitabilir hale gelir. DEVELOPMENT_RULES 4'un
 * "en sik gorulen kritik acik" dedigi sey tam olarak budur.
 *
 * Hicbir sey dondurmemek, yanlis bir sey dondurmekten iyidir.
 */
@Injectable()
export class UnavailableCurrentUserProvider implements CurrentUserProvider {
  requireUserId(): string {
    throw new IdentityUnavailableError();
  }
}
