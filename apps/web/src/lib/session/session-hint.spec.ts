import { beforeEach, describe, expect, it } from 'vitest';

import { clearSessionHint, setSessionHint } from './session-hint';

function hasHint(): boolean {
  return document.cookie.split('; ').some((c) => c.startsWith('bo_session_hint='));
}

describe('session-hint (bo_session_hint çerezi)', () => {
  beforeEach(() => {
    clearSessionHint();
  });

  it('setSessionHint çerezi yazar', () => {
    expect(hasHint()).toBe(false);
    setSessionHint();
    expect(hasHint()).toBe(true);
  });

  it('clearSessionHint çerezi siler', () => {
    setSessionHint();
    clearSessionHint();
    expect(hasHint()).toBe(false);
  });
});
