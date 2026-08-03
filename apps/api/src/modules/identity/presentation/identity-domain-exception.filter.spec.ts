import { HttpException, HttpStatus, type ArgumentsHost } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import {
  EmailNotVerifiedError,
  InvalidCredentialsError,
  InvalidEmailError,
  InvalidTokenError,
  PasswordPolicyError,
  TooManyLoginAttemptsError,
  InconsistentUserStateError,
} from '../domain/identity.error';
import { IdentityDomainExceptionFilter } from './identity-domain-exception.filter';

const filter = new IdentityDomainExceptionFilter();
// Filtre yaniti kendisi yazmaz; host kullanilmaz.
const host = {} as ArgumentsHost;

function statusOf(error: Parameters<typeof filter.catch>[0]): number {
  try {
    filter.catch(error, host);
  } catch (thrown) {
    if (thrown instanceof HttpException) {
      return thrown.getStatus();
    }
  }
  throw new Error('HttpException bekleniyordu');
}

function messageOf(error: Parameters<typeof filter.catch>[0]): string {
  try {
    filter.catch(error, host);
  } catch (thrown) {
    if (thrown instanceof HttpException) {
      return thrown.message;
    }
  }
  throw new Error('HttpException bekleniyordu');
}

describe('IdentityDomainExceptionFilter — kimlik dogrulama sonuclari', () => {
  it('gecersiz kimligi 401 e cevirir', () => {
    expect(statusOf(new InvalidCredentialsError())).toBe(HttpStatus.UNAUTHORIZED);
  });

  it('gecersiz token i 401 e cevirir', () => {
    expect(statusOf(new InvalidTokenError('imza'))).toBe(HttpStatus.UNAUTHORIZED);
  });

  it('dogrulanmamis e-postayi 403 e cevirir (ayirt edilebilir)', () => {
    expect(statusOf(new EmailNotVerifiedError())).toBe(HttpStatus.FORBIDDEN);
  });

  it('oran sinirini 429 a cevirir', () => {
    expect(statusOf(new TooManyLoginAttemptsError())).toBe(HttpStatus.TOO_MANY_REQUESTS);
  });
});

describe('IdentityDomainExceptionFilter — girdi dogrulama', () => {
  it('parola politikasi ihlalini 422 ye cevirir', () => {
    expect(statusOf(new PasswordPolicyError(['too-short']))).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
  });

  it('gecersiz e-posta bicimini 422 ye cevirir', () => {
    expect(statusOf(new InvalidEmailError('bicim'))).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
  });
});

describe('IdentityDomainExceptionFilter — eslenmemis hatalar', () => {
  it('bilinmeyen kodu 500 e cevirir', () => {
    expect(statusOf(new InconsistentUserStateError('bozuk satir'))).toBe(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  });

  it('500 durumunda ic mesaji istemciye SIZDIRMAZ', () => {
    // Eslenmemis hata bir sunucu kusurudur; mesaji ic detay tasiyabilir.
    expect(messageOf(new InconsistentUserStateError('bozuk satir'))).toBe('Internal server error');
  });

  it('eslenmis hatalarda domain mesajini korur', () => {
    expect(messageOf(new EmailNotVerifiedError())).toContain('dogrulanmamis');
  });
});
