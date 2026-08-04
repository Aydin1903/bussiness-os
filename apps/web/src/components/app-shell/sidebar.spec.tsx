import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Sidebar } from './sidebar';

/**
 * Gezinme — hangi modulun GERCEK, hangisinin placeholder oldugu.
 *
 * Bu ayrim bir kez kaydi: "Bilgi Bankasi" Faz 4'te tamamen calisir hale
 * geldigi halde sidebar Faz 3'ten kalma "yakinda" rozetini tasimaya devam
 * ediyordu ve modul kullanici icin ERISILEMEZ kalmisti. Test o gerilemenin
 * tekrarini engeller.
 */
describe('Sidebar', () => {
  it('Bilgi Bankasi GERCEK bir link', () => {
    render(<Sidebar collapsed={false} />);

    expect(screen.getByRole('link', { name: 'Bilgi Bankası' })).toHaveAttribute(
      'href',
      '/app/knowledge',
    );
  });

  it('Genel Bakis link olarak durur', () => {
    render(<Sidebar collapsed={false} />);

    expect(screen.getByRole('link', { name: 'Genel Bakış' })).toHaveAttribute('href', '/app');
  });

  it('henuz gelmemis moduller link DEGIL', () => {
    // Olmayan bir seye tiklanabilir gorunum vermek, vaat etmektir.
    render(<Sidebar collapsed={false} />);

    for (const label of ['Müşteriler', 'Finans', 'Projeler']) {
      expect(screen.queryByRole('link', { name: label })).not.toBeInTheDocument();
    }
  });

  it('yalnizca placeholder moduller "yakinda" rozeti tasir', () => {
    render(<Sidebar collapsed={false} />);

    expect(screen.getAllByText('yakında')).toHaveLength(3);
  });
});
