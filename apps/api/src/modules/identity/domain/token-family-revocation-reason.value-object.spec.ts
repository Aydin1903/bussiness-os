import { describe, expect, it } from 'vitest';

import { InvalidTokenFamilyRevocationReasonError } from './identity.error';
import {
  parseTokenFamilyRevocationReason,
  TOKEN_FAMILY_REVOCATION_REASONS,
} from './token-family-revocation-reason.value-object';

describe('parseTokenFamilyRevocationReason', () => {
  it.each(TOKEN_FAMILY_REVOCATION_REASONS)('gecerli nedeni ("%s") ayristirir', (reason) => {
    expect(parseTokenFamilyRevocationReason(reason)).toBe(reason);
  });

  it('yeniden kullanim nedenini icerir (asil koruma)', () => {
    expect(TOKEN_FAMILY_REVOCATION_REASONS).toContain('token-reuse-detected');
  });

  it('bilinmeyen nedeni reddeder', () => {
    expect(() => parseTokenFamilyRevocationReason('unknown-reason')).toThrow(
      InvalidTokenFamilyRevocationReasonError,
    );
  });
});
