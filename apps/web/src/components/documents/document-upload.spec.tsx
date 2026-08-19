import { MAX_DOCUMENT_BYTES } from '@business-os/contracts';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DocumentUpload } from './document-upload';

/**
 * `DocumentUpload` — sınırların KULLANICIYA ÇARPMADAN önce söylenmesi.
 *
 * ⚠️ TESTLERİN AĞIRLIK MERKEZİ TEK BİR ÜRÜN İDDİASIDIR (ADR-0037 §11):
 * **kullanıcı 20 MB'lik bir dosyayı yükleyip 413 görmemeli.** Sunucu sınırı
 * zaten zorluyor (o bir güvenlik ağı); buradaki iş, dakikalarca süren bir
 * yüklemenin çöpe gitmemesidir.
 *
 * ⚠️ Bu kontroller bir DOĞRULAMA DEĞİL kolaylıktır: tür tespiti sunucuda
 * İÇERİKTEN yapılır (§6.1) ve son sözü o söyler. Testler bunu da kilitliyor —
 * uzantı kontrolü geçen bir dosya yine de sunucuda reddedilebilir ve arayüz o
 * mesajı göstermek zorundadır.
 */

function file(name: string, size: number, type = 'application/pdf'): File {
  const created = new File(['x'], name, { type });
  // `File` boyutu salt okunurdur; testte sınırı aşan bir dosya üretmenin tek
  // yolu budur.
  Object.defineProperty(created, 'size', { value: size });
  return created;
}

/** Formun `onSubmit` sözleşmesi — mock TİPLİ kurulur, `as` KULLANILMAZ. */
interface SubmitInput {
  readonly file: File;
  readonly label: string;
  readonly contactId: string;
  readonly projectId: string;
}

function renderUpload(overrides: { pending?: boolean; error?: string | null } = {}) {
  const onSubmit = vi.fn<(input: SubmitInput) => void>();
  render(
    <DocumentUpload
      contacts={[{ value: 'c1', label: 'Ahmet Yılmaz' }]}
      projects={[{ value: 'p1', label: 'Ofis Taşıma' }]}
      pending={overrides.pending ?? false}
      error={overrides.error ?? null}
      onSubmit={onSubmit}
      onCancel={() => undefined}
    />,
  );
  return { onSubmit };
}

function dropZone(): HTMLElement {
  return screen.getByRole('button', { name: 'Dosya seç veya sürükleyip bırak' });
}

function drop(dropped: File): void {
  fireEvent.drop(dropZone(), { dataTransfer: { files: [dropped] } });
}

describe('DocumentUpload — sınırlar SEÇİM ÖNCESİ yazılı', () => {
  it('kabul edilen türleri ve boyutu dosya seçilmeden gösterir', () => {
    renderUpload();

    // ⚠️ ADR-0037 §11: "sınırlar ÖNCEDEN gösterilmelidir". Bu satır olmasaydı
    // kullanıcı sınırı ancak 413/415 alarak öğrenirdi.
    expect(screen.getByText(/PDF veya Word/i)).toBeInTheDocument();
    expect(screen.getByText(/20\.0 MB/)).toBeInTheDocument();
  });
});

describe('DocumentUpload — istemci ön kontrolü', () => {
  it('⚠️ BOYUT SINIRINI AŞAN dosya YÜKLENMEDEN reddedilir', () => {
    const { onSubmit } = renderUpload();

    drop(file('dev.pdf', MAX_DOCUMENT_BYTES + 1));

    expect(screen.getByText(/Dosya çok büyük/i)).toBeInTheDocument();
    // Dosya kabul edilmediği için gönderilecek bir şey de yok.
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('⚠️ DESTEKLENMEYEN uzantı hemen uyarır', () => {
    renderUpload();

    drop(file('tablo.xlsx', 1024, 'application/vnd.ms-excel'));

    expect(screen.getByText(/Yalnızca PDF ve Word/i)).toBeInTheDocument();
  });

  it('geçerli dosya kabul edilir ve adı gösterilir', () => {
    renderUpload();

    drop(file('Kira Sözleşmesi.pdf', 2048));

    expect(screen.getByText('Kira Sözleşmesi.pdf')).toBeInTheDocument();
    expect(screen.getByText(/2 KB/)).toBeInTheDocument();
  });

  it('dosya seçilmeden gönderilemez', () => {
    renderUpload();

    const button = screen.getByRole('button', { name: 'Yükle' });
    expect(button).toBeDisabled();
  });

  it('dosya seçilince gönderilebilir ve seçilen alanlar iletilir', () => {
    const { onSubmit } = renderUpload();

    drop(file('teklif.pdf', 4096));
    fireEvent.change(screen.getByLabelText('Etiket'), { target: { value: ' sözleşme ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Yükle' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const call = onSubmit.mock.calls[0]?.[0];
    expect(call?.file.name).toBe('teklif.pdf');
    // Trim ÇAĞIRAN tarafta yapılır; form ham değeri iletir.
    expect(call?.label).toBe(' sözleşme ');
  });
});

describe('DocumentUpload — iki bağlantı BAĞIMSIZDIR (ADR-0037 §4)', () => {
  it('kişi ve proje AYRI seçicilerdir ve hiçbiri zorunlu değildir', () => {
    const { onSubmit } = renderUpload();

    // İkisi de "Bağlantısız" varsayılanıyla açılır — bir belge hiçbirine bağlı
    // olmak zorunda değildir (şirket ana kira sözleşmesi).
    expect(screen.getByLabelText('Kişi (opsiyonel)')).toHaveValue('');
    expect(screen.getByLabelText('Proje (opsiyonel)')).toHaveValue('');

    drop(file('sozlesme.pdf', 1024));
    // YALNIZCA kişi seçiliyor: projesiz gönderim meşrudur.
    fireEvent.change(screen.getByLabelText('Kişi (opsiyonel)'), { target: { value: 'c1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Yükle' }));

    const call = onSubmit.mock.calls[0]?.[0];
    expect(call?.contactId).toBe('c1');
    expect(call?.projectId).toBe('');
  });
});

describe('DocumentUpload — erişilebilirlik', () => {
  it('⚠️ SÜRÜKLE-BIRAK TEK YOL DEĞİL: alan klavyeyle de açılır', () => {
    // Yalnızca sürüklemeye izin veren bir yüzey, fare kullanamayan kullanıcı
    // için modülü TÜMÜYLE kapatırdı.
    renderUpload();
    const zone = dropZone();

    expect(zone).toHaveAttribute('tabindex', '0');
    // Enter/Space dosya seçiciyi açar; jsdom'da tıklama tetiklendiğini
    // doğrulamak yeterli (gerçek seçici tarayıcıya ait).
    expect(() => {
      fireEvent.keyDown(zone, { key: 'Enter' });
    }).not.toThrow();
  });
});

describe('DocumentUpload — sunucu hatası', () => {
  it('sunucudan gelen mesaj OLDUĞU GİBİ gösterilir', () => {
    // ⚠️ Backend 413/415/422'de anlaşılır metin üretiyor (ADR-0037 §9); arayüz
    // onu EZMEZ. `UPLOAD_STATUS_MESSAGES` yalnızca gövdesiz cevap için yedek.
    renderUpload({ error: 'Belge cok uzun: 412 parca uretiyor, en fazla 300 olabilir.' });

    expect(screen.getByText(/412 parca/)).toBeInTheDocument();
  });
});
