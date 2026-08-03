import { describe, expect, it } from 'vitest';

import { UnauthenticatedError } from '../../shared/current-user.port';
import { runWithPrincipal } from './auth-context';
import { ContextCurrentUserProvider } from './context-current-user.adapter';

const provider = new ContextCurrentUserProvider();
const USER_ID = '018f3a2b-7c4d-7e1f-9b3c-4d5e6f7a8b9c';
const SESSION_ID = '018f3a2b-7c4d-7e1f-8a2b-0000000000f1';

describe('ContextCurrentUserProvider', () => {
  it('dogrulanmis kimligi baglamdan okur', () => {
    const userId = runWithPrincipal(
      { userId: USER_ID, sessionId: SESSION_ID, tenantId: null },
      () => provider.requireUserId(),
    );

    expect(userId).toBe(USER_ID);
  });

  it('kimliksiz istekte HATA firlatir (null DONMEZ)', () => {
    // Cagiran tarafi "kullanici yoksa ne yapayim" kararina zorlamak, o karari
    // her endpoint'te tekrar vermek demektir ve biri yanlis verir.
    expect(() => provider.requireUserId()).toThrow(UnauthenticatedError);
  });

  it('baglam sona erdiginde kimlik SIZMAZ', () => {
    runWithPrincipal({ userId: USER_ID, sessionId: SESSION_ID, tenantId: null }, () =>
      provider.requireUserId(),
    );

    // Bir sonraki istek onceki kullanicinin kimligini gormemeli.
    expect(() => provider.requireUserId()).toThrow(UnauthenticatedError);
  });

  it('ic ice baglamda en yakin kimligi dondurur', () => {
    const other = '018f3a2b-7c4d-7e1f-9b3c-000000000abc';

    const seen = runWithPrincipal({ userId: USER_ID, sessionId: SESSION_ID, tenantId: null }, () =>
      runWithPrincipal({ userId: other, sessionId: SESSION_ID, tenantId: null }, () =>
        provider.requireUserId(),
      ),
    );

    expect(seen).toBe(other);
  });
});
