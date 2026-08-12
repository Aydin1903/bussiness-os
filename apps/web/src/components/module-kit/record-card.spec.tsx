import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CardActions, CardHeader } from './record-card';

/**
 * Kayıt kartının başlık satırı ve eylem şeridi.
 *
 * ============================================================================
 * NE TEST EDİLİYOR: DÜZEN DEĞİL, DÜZENİN ÖNKOŞULLARI
 * ============================================================================
 * Gerçek kabul ölçütü ölçümdür — "taşma 0, bindirme ≤0, başlık satır sayısı
 * onay açık/kapalı aynı" — ve jsdom bunu ÖLÇEMEZ: düzen hesaplanmaz,
 * `getBoundingClientRect` her yerde sıfır döner. O ölçüm gerçek tarayıcıda
 * yapılır ve raporlanır.
 *
 * Burada kilitlenen şey, ölçümü mümkün kılan üç sınıftır. Üçü de "gereksiz
 * görünür" ve bir temizlik turunda silinmeye adaydır; silindiklerinde hata
 * SESSİZDİR — geniş ekranda kart kusursuz görünür, yalnızca dar ekranda ya da
 * silme onayı açıldığında bozulur. Ne lint ne tip denetimi yakalar.
 *
 * Bu dosya `CardHeader` module-kit'e çıkarıldığı işte yazıldı: aynı satır o
 * güne kadar üç modülün sekiz kart bileşenine elle kopyalanmıştı ve YEDİSİNDE
 * `flex-wrap` eksikti.
 */
describe('CardHeader', () => {
  it('⚠️ `flex-wrap` TAŞIR — kabul ölçütünü tam olarak bu sağlıyor', () => {
    // Sarma olmadan eylem şeridi genişlediğinde tek çıkış yolu başlığı
    // sıkıştırmaktır: başlık ikinci satıra iner ve kart silme onayı
    // açıldığında ZIPLAR. Sarma ile şerit kendi satırına geçer, başlığa
    // dokunulmaz — "başlık satır sayısı onay açık/kapalı aynı" maddesi budur.
    render(
      <CardHeader>
        <span>Başlık</span>
      </CardHeader>,
    );

    const header = screen.getByText('Başlık').parentElement;
    expect(header?.className).toContain('flex-wrap');
  });

  it('sarma sonrası dikey boşluk verir — şerit başlığa yapışmaz', () => {
    render(
      <CardHeader>
        <span>Başlık</span>
      </CardHeader>,
    );

    expect(screen.getByText('Başlık').parentElement?.className).toContain('gap-y-');
  });
});

describe('CardActions', () => {
  it('⚠️ `min-w-0` TAŞIR, `shrink-0` TAŞIMAZ — burası taşma hatasının yeriydi', () => {
    // `shrink-0` iki düğme için doğruydu, ama `ConfirmDelete` şeridin İÇİNE
    // uzun bir soru cümlesi koyar. Küçülmeyi reddeden şerit kartı taşırıyor ve
    // `RecordCard`'ın `overflow-hidden`'ı "Evet, sil" / "Vazgeç" düğmelerini
    // kartın kenarından KIRPIYORDU.
    render(
      <CardActions>
        <span>Sil</span>
      </CardActions>,
    );

    const actions = screen.getByText('Sil').parentElement;
    expect(actions?.className).toContain('min-w-0');
    expect(actions?.className).not.toContain('shrink-0');
  });

  it('başlık örtüsünün ÜSTÜNDE kalır — kart linki düğmeleri yutmaz', () => {
    // `relative z-10` olmadan `CardTitleLink`'in `after:inset-0` örtüsü
    // düğmelerin üstünü kaplar ve tıklamalar linke gider.
    render(
      <CardActions>
        <span>Sil</span>
      </CardActions>,
    );

    const actions = screen.getByText('Sil').parentElement;
    expect(actions?.className).toContain('relative');
    expect(actions?.className).toContain('z-10');
  });
});
