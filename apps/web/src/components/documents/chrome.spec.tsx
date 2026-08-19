import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { formatBytes, IndexPill, TypePill, UnsearchableNote } from './chrome';

/**
 * Belge kabuk parçaları — ve ADR-0037 §6.3'ün ARAYÜZ YÜKÜMLÜLÜĞÜ.
 *
 * ============================================================================
 * ⚠️ BU DOSYANIN AĞIRLIK MERKEZİ TEK BİR CÜMLEDİR
 * ============================================================================
 * ADR-0037 §6.3: _"Sessiz olmamasını sağlayan şey `chunkCount: 0`ın açıkça
 * dönmesidir ve **arayüz bunu görünür kılmak ZORUNDADIR**. O cümle yazılmazsa
 * karar sessiz başarısızlığa döner: kullanıcı sözleşmesini yüklediğini sanır,
 * aylar sonra aradığında bulamaz ve sebebini asla öğrenemez."_
 *
 * Yani `chunkCount: 0` bir HATA değildir (taranmış bir PDF'te metin gerçekten
 * yoktur) ama SÖYLENMESİ gereken bir durumdur — ve bunu söyleyen tek şey bu
 * bileşenlerdir. Aşağıdaki testler o yükümlülüğü kilitler: rozet sessizleşirse
 * kırmızı yanar.
 */

describe('IndexPill — ADR-0037 §6.3 yükümlülüğü', () => {
  it('⚠️ `chunkCount: 0` GÖRÜNÜR bir uyarıya dönüşür', () => {
    render(<IndexPill chunkCount={0} />);

    // Rozet SESSİZ KALAMAZ: metin okunamadığında kullanıcı bunu ekranda
    // görmelidir.
    expect(screen.getByText('Aranamıyor')).toBeInTheDocument();
  });

  it('⚠️ uyarı RENGE DEĞİL METNE dayanır (renk körlüğü — FRONTEND §4.8)', () => {
    render(<IndexPill chunkCount={0} />);

    // Renk sınıfı da var ama TEK taşıyıcı o değil: "Aranamıyor" kelimesi
    // rengi görmeyen kullanıcı için de anlamı taşır.
    const pill = screen.getByText('Aranamıyor');
    expect(pill.textContent).not.toBe('');
    expect(pill.getAttribute('title')).toMatch(/aramalarda bulunamaz/i);
  });

  it('parça varsa sayıyı yazar — "aranamıyor" DEMEZ', () => {
    render(<IndexPill chunkCount={12} />);

    expect(screen.getByText('12 parça')).toBeInTheDocument();
    expect(screen.queryByText('Aranamıyor')).not.toBeInTheDocument();
  });
});

describe('UnsearchableNote', () => {
  it('NE OLDUĞUNU ve BELGENİN KAYBOLMADIĞINI birlikte söyler', () => {
    render(<UnsearchableNote />);

    // ⚠️ İki bilgi de şart: yalnızca "aranamaz" demek kullanıcıya belgenin
    // kaybolduğunu düşündürürdü.
    expect(screen.getByText(/taranmış/i)).toBeInTheDocument();
    expect(screen.getByText(/içeriği aramalarda/i)).toBeInTheDocument();
    expect(screen.getByText(/indirilebilir/i)).toBeInTheDocument();
  });
});

describe('TypePill', () => {
  it('MIME yerine insan dili yazar', () => {
    render(<TypePill mimeType="application/pdf" />);

    expect(screen.getByText('PDF')).toBeInTheDocument();
  });
});

describe('formatBytes', () => {
  it('bayt, KB ve MB eşiklerini doğru gösterir', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});
