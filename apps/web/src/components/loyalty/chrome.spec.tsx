import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BalanceMark, DirectionMark, UnresolvedContact, toPointDirection } from './chrome';

describe('DirectionMark', () => {
  it('⚠️ YON RENKTE DEGIL METINDE — isaret VE etiket birlikte', () => {
    // ⚠️ FRONTEND §4.8: renk hicbir yerde TEK ayirt edici olmaz. "Kazanim
    // yesil, kullanim kirmizi" renk korlugu altinda AYNI gorunurdu ve bu, bir
    // bakiye hareketinde kabul edilemez bir belirsizliktir.
    const { rerender } = render(<DirectionMark direction="earn" points={50} />);
    expect(screen.getByText('Kazanım')).toBeInTheDocument();
    expect(screen.getByText(/^\+/)).toBeInTheDocument();

    rerender(<DirectionMark direction="spend" points={50} />);
    expect(screen.getByText('Kullanım')).toBeInTheDocument();
    expect(screen.getByText(/^−/)).toBeInTheDocument();
  });

  it('⚠️ SAKLANAN MIKTAR HER IKI YONDE DE POZITIF gosterilir', () => {
    // Isaret `direction`dadir, miktarda DEGIL (ADR-0051 §1.4).
    render(<DirectionMark direction="spend" points={120} />);
    expect(screen.getByText('−120')).toBeInTheDocument();
  });

  it('ekran okuyucu icin sembol DEGIL, CUMLE okunur', () => {
    render(<DirectionMark direction="spend" points={40} />);
    expect(screen.getByLabelText('Kullanım 40 puan')).toBeInTheDocument();
  });
});

describe('BalanceMark', () => {
  it('bakiyeyi binlik ayracli ve `puan` birimiyle yazar', () => {
    render(<BalanceMark balance={12_400} />);
    expect(screen.getByText(/12\.400/)).toBeInTheDocument();
    expect(screen.getByText('puan')).toBeInTheDocument();
  });

  it('⚠️ NEGATIF BAKIYE GORUNUR — ADR-0051 §4.4 in kabul ettigi TEK riskin karsiligi', () => {
    // ⚠️ "Bakiye negatife dusemez" bir SATIRLAR ARASI kosuldur ve bir `CHECK`
    // onu goremez; tek dayanak kod yolu + `FOR UPDATE` kilididir. Kilit bir
    // gun atlanirsa negatif bakiye OLUSABILIR — ve ADR bunu "ama GORUNURDUR"
    // diye kabul eder. ⚠️ Sifirin altini sessizce `0` gostermek, o tek riski
    // GORUNMEZ kilardi: gurultulu bir yanlisligi sessize cevirirdi.
    render(<BalanceMark balance={-30} />);
    expect(screen.getByText(/-30/)).toBeInTheDocument();
    expect(screen.getByTitle('Negatif bakiye — beklenmeyen bir durum')).toBeInTheDocument();
  });

  it('pozitif bakiyede uyari BASLIGI YOKTUR', () => {
    render(<BalanceMark balance={10} />);
    expect(screen.queryByTitle('Negatif bakiye — beklenmeyen bir durum')).toBeNull();
  });
});

describe('UnresolvedContact', () => {
  it('⚠️ "SILINMIS" DEMEZ — o kelime kaydin BIR ZAMANLAR VAR OLDUGUNU sizdirirdi', () => {
    // ADR-0035'in yazili karari. Uc durum ayirt edilemez: kisi silinmis ·
    // baska tenant'in · `contact:read` yok.
    const { container } = render(<UnresolvedContact />);

    expect(screen.getByText('Müşteri kaydı bulunamadı')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/silin/i);
  });
});

describe('toPointDirection', () => {
  it('⚠️ UCUNCU BIR YON YOKTUR — `adjustment` `null` doner', () => {
    expect(toPointDirection('earn')).toBe('earn');
    expect(toPointDirection('spend')).toBe('spend');
    expect(toPointDirection('adjustment')).toBeNull();
    expect(toPointDirection('')).toBeNull();
  });
});
