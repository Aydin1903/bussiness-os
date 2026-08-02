import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Her testten sonra render edilen DOM'u temizle (test izolasyonu).
afterEach(() => {
  cleanup();
});
