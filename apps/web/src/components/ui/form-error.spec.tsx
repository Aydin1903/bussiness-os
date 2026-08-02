import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FormError } from './form-error';

describe('FormError', () => {
  it('mesaj verilince alert olarak gösterir (erişilebilirlik)', () => {
    render(<FormError message="Bir şeyler ters gitti" />);

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toBe('Bir şeyler ters gitti');
  });

  it('mesaj null/boş ise HİÇBİR ŞEY render etmez', () => {
    const { container } = render(<FormError message={null} />);
    expect(container.querySelector('[role="alert"]')).toBeNull();

    const { container: empty } = render(<FormError message="" />);
    expect(empty.querySelector('[role="alert"]')).toBeNull();
  });
});
