import { describe, expect, it } from 'vitest';

import { UserId } from '../../../shared/user-id.value-object';
import { Email } from './email.value-object';
import {
  InconsistentUserStateError,
  InvalidUserCreatedAtError,
  InvalidUserStatusTransitionError,
} from './identity.error';
import { type UserStatus } from './user-status.value-object';
import { User, type UserState } from './user.entity';

const USER_ID = UserId.create('018f3a2b-7c4d-7e1f-9b3c-4d5e6f7a8b9c');
const EMAIL = Email.create('user@example.com');
const NOW = new Date('2026-07-22T10:00:00.000Z');

function persisted(overrides: Partial<UserState> = {}): UserState {
  return {
    id: USER_ID,
    email: EMAIL,
    emailVerified: true,
    status: 'active',
    createdAt: NOW,
    ...overrides,
  };
}

describe('User.register', () => {
  it('kullaniciyi pending durumunda olusturur', () => {
    const user = User.register({ id: USER_ID, email: EMAIL, createdAt: NOW });

    expect(user.status).toBe('pending');
  });

  it('e-postayi dogrulanmamis olarak baslatir', () => {
    // AUTH_ARCHITECTURE 8: kayit hicbir sey dogrulamaz.
    const user = User.register({ id: USER_ID, email: EMAIL, createdAt: NOW });

    expect(user.emailVerified).toBe(false);
    expect(user.isActive).toBe(false);
  });

  it('kimligi ve e-postayi tasir', () => {
    const user = User.register({ id: USER_ID, email: EMAIL, createdAt: NOW });

    expect(user.id.equals(USER_ID)).toBe(true);
    expect(user.email.equals(EMAIL)).toBe(true);
  });

  it('gecersiz olusturulma zamanini reddeder', () => {
    expect(() =>
      User.register({ id: USER_ID, email: EMAIL, createdAt: new Date('gecersiz') }),
    ).toThrow(InvalidUserCreatedAtError);
  });

  it('olusturulma zamanini kopyalar (disaridan mutasyona kapali)', () => {
    const createdAt = new Date(NOW.getTime());
    const user = User.register({ id: USER_ID, email: EMAIL, createdAt });

    createdAt.setFullYear(1990);

    expect(user.createdAt).toEqual(NOW);
  });
});

describe('User — durum gecisleri', () => {
  it('verifyEmail: pending -> active ve e-postayi dogrular', () => {
    const user = User.register({ id: USER_ID, email: EMAIL, createdAt: NOW });

    user.verifyEmail();

    expect(user.status).toBe('active');
    expect(user.emailVerified).toBe(true);
    expect(user.isActive).toBe(true);
  });

  it('verifyEmail: zaten aktif kullanicida reddedilir', () => {
    const user = User.fromPersistence(persisted({ status: 'active' }));

    expect(() => {
      user.verifyEmail();
    }).toThrow(InvalidUserStatusTransitionError);
  });

  it('lock: active -> locked', () => {
    const user = User.fromPersistence(persisted({ status: 'active' }));

    user.lock();

    expect(user.status).toBe('locked');
  });

  it('lock: pending kullanicida reddedilir', () => {
    const user = User.register({ id: USER_ID, email: EMAIL, createdAt: NOW });

    expect(() => {
      user.lock();
    }).toThrow(InvalidUserStatusTransitionError);
  });

  it('unlock: locked -> active', () => {
    const user = User.fromPersistence(persisted({ status: 'locked' }));

    user.unlock();

    expect(user.status).toBe('active');
  });

  it('deactivate: pending kullaniciyi kapatir', () => {
    const user = User.register({ id: USER_ID, email: EMAIL, createdAt: NOW });

    user.deactivate();

    expect(user.status).toBe('deactivated');
  });

  it('deactivate terminaldir: tekrar gecis reddedilir', () => {
    const user = User.fromPersistence(persisted({ status: 'active' }));
    user.deactivate();

    expect(() => {
      user.unlock();
    }).toThrow(InvalidUserStatusTransitionError);
  });
});

describe('User.fromPersistence — yeniden kurma', () => {
  it.each<UserStatus>(['pending', 'active', 'locked', 'deactivated'])(
    'gecerli "%s" durumunu geri getirir',
    (status) => {
      const emailVerified = status !== 'pending';
      const user = User.fromPersistence(persisted({ status, emailVerified }));

      expect(user.status).toBe(status);
    },
  );

  it('gecersiz olusturulma zamanini reddeder', () => {
    expect(() => User.fromPersistence(persisted({ createdAt: new Date('gecersiz') }))).toThrow(
      InvalidUserCreatedAtError,
    );
  });

  it('createdAt getter kopya doner (ic durum disaridan degistirilemez)', () => {
    const user = User.fromPersistence(persisted());

    const read = user.createdAt;
    read.setFullYear(1990);

    expect(user.createdAt).toEqual(NOW);
  });
});

describe('User.fromPersistence — tutarlilik invariant.i', () => {
  it('pending + dogrulanmis e-posta tutarsizdir', () => {
    expect(() =>
      User.fromPersistence(persisted({ status: 'pending', emailVerified: true })),
    ).toThrow(InconsistentUserStateError);
  });

  it('active + dogrulanmamis e-posta tutarsizdir', () => {
    expect(() =>
      User.fromPersistence(persisted({ status: 'active', emailVerified: false })),
    ).toThrow(InconsistentUserStateError);
  });

  it('locked + dogrulanmamis e-posta tutarsizdir', () => {
    expect(() =>
      User.fromPersistence(persisted({ status: 'locked', emailVerified: false })),
    ).toThrow(InconsistentUserStateError);
  });

  it('deactivated + dogrulanmamis e-posta gecerlidir (dogrulanmadan kapatilmis hesap)', () => {
    const user = User.fromPersistence(persisted({ status: 'deactivated', emailVerified: false }));

    expect(user.status).toBe('deactivated');
    expect(user.emailVerified).toBe(false);
  });

  it('deactivated + dogrulanmis e-posta da gecerlidir', () => {
    const user = User.fromPersistence(persisted({ status: 'deactivated', emailVerified: true }));

    expect(user.emailVerified).toBe(true);
  });
});
