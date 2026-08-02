import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Button } from './button';

describe('Button', () => {
  it('loading iken metni değişir ve devre dışı olur (çift gönderim engellenir)', () => {
    render(<Button loading>Kaydet</Button>);

    const button = screen.getByRole('button');
    expect(button.hasAttribute('disabled')).toBe(true);
    expect(button.textContent).toContain('Lütfen bekleyin');
  });

  it('normalde çocukları gösterir ve tıklamayı iletir', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Kaydet</Button>);

    const button = screen.getByRole('button');
    expect(button.textContent).toBe('Kaydet');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
