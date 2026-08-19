import type { DocumentRow } from '@business-os/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DocumentDetailScreen } from './document-detail-screen';

/**
 * Belge detayı — DOSYA DEĞİŞTİRME akışı (ADR-0037 §7).
 *
 * ============================================================================
 * ⚠️ BU DOSYA NE TEST EDER, NE ETMEZ
 * ============================================================================
 * **Etmez:** eski R2 nesnesinin gerçekten silindiğini ve yeni embedding'in
 * üretildiğini. Onlar SUNUCU davranışıdır ve orada kanıtlı: `document.use-cases
 * .spec` ("YENİ anahtar üretir ve ESKİ nesneyi siler", "parçalar TÜMÜYLE
 * silinip yeniden üretilir") + kapanış denetiminin canlı ölçümü (MinIO nesne
 * sayısı 3 → 2, belge başına tek nesne).
 *
 * **Eder:** ARAYÜZ AKIŞINI. Burada kilitlenen tek şey şudur —
 *
 *   1. "Dosyayı değiştir" tek başına HİÇBİR ŞEY GÖNDERMEZ,
 *   2. dosya seçilince geri alınamazlık uyarısı GÖRÜNÜR,
 *   3. onaydan sonra uç ÇAĞRILIR,
 *   4. dönen `chunkCount` ekranda TAZELENİR,
 *   5. etiket ve bağlantılar EKRANDA DEĞİŞMEZ.
 *
 * Dördüncüsü sessiz bir yanlışı önler: eski dosyanın parça sayısı ekranda
 * kalsaydı, aranabilir sanılan bir belge sessizce aranamaz hale gelirdi (§6.3).
 */

const getDocument = vi.hoisted(() => vi.fn());
/**
 * ⚠️ Mock TİPLİ kurulur — `as` KULLANILMAZ (DEVELOPMENT_RULES 2.3). Tip
 * verilmeseydi `mock.calls[0]` `any` olurdu ve çağrı imzasını doğrulayan
 * iddia hiçbir şey garanti etmezdi.
 */
const replaceDocumentFile = vi.hoisted(() => vi.fn<(id: string, file: File) => Promise<unknown>>());
const updateDocument = vi.hoisted(() => vi.fn());
const deleteDocument = vi.hoisted(() => vi.fn());
const downloadDocument = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/documents', () => ({
  getDocument,
  replaceDocumentFile,
  updateDocument,
  deleteDocument,
  downloadDocument,
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const ID = '018f3a2b-7c4d-7e1f-8a2b-00000000000d';

function row(overrides: Partial<DocumentRow> = {}): DocumentRow {
  return {
    id: ID,
    tenantId: '018f3a2b-7c4d-7e1f-9b3c-0000000000a1',
    originalFilename: 'Kira Sozlesmesi.pdf',
    storageKey: 'tenants/t/documents/d/eski-kira.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 2048,
    label: 'sözleşme',
    crmContactId: null,
    projectId: null,
    createdByUserId: 'u',
    createdAt: '2026-08-18T09:00:00.000Z',
    updatedAt: '2026-08-18T09:00:00.000Z',
    contactName: 'Ahmet Yılmaz',
    projectName: 'Ofis Taşıma',
    chunkCount: 12,
    ...overrides,
  };
}

/** `File` boyutu salt okunurdur; testte belirlemenin tek yolu budur. */
function file(name: string, size = 4096): File {
  const created = new File(['x'], name, { type: 'application/pdf' });
  Object.defineProperty(created, 'size', { value: size });
  return created;
}

function fileInput(): HTMLInputElement {
  const input = screen.getByLabelText('Yeni dosyayı seç');
  if (!(input instanceof HTMLInputElement)) {
    throw new TypeError('Dosya alanı bir input olmalı.');
  }
  return input;
}

async function renderDetail(initial: DocumentRow = row()) {
  getDocument.mockResolvedValue(initial);
  render(<DocumentDetailScreen documentId={ID} />);
  await screen.findByText('Belge bilgileri');
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DocumentDetailScreen — dosya değiştirme İKİ AŞAMALIDIR', () => {
  it('⚠️ "Dosyayı değiştir" TEK BAŞINA hiçbir şey göndermez', async () => {
    // Geri alınamaz bir işlem tek tıkla tetiklenemez: bu düğme yalnızca
    // dosya seçiciyi açar.
    await renderDetail();

    fireEvent.click(screen.getByRole('button', { name: 'Dosyayı değiştir' }));

    expect(replaceDocumentFile).not.toHaveBeenCalled();
    expect(screen.queryByText(/geri alınamaz/i)).not.toBeInTheDocument();
  });

  it('dosya seçilince GERİ ALINAMAZLIK uyarısı görünür', async () => {
    await renderDetail();

    fireEvent.change(fileInput(), { target: { files: [file('Yeni Sozlesme.pdf')] } });

    // Uyarı NE KAYBEDİLECEĞİNİ söyler — "emin misiniz" tek başına bilgi taşımaz.
    expect(await screen.findByText(/geri alınamaz/i)).toBeInTheDocument();
    expect(screen.getByText(/embedding/i)).toBeInTheDocument();
    // Ve NE KORUNACAĞINI da söyler.
    expect(screen.getByText(/Etiket ve bağlantılar/i)).toBeInTheDocument();
    // Seçilen dosyanın adı görünür: kullanıcı NEYİ neyle değiştirdiğini bilmeli.
    expect(screen.getByText(/Yeni Sozlesme\.pdf/)).toBeInTheDocument();

    // ⚠️ Hâlâ gönderilmedi.
    expect(replaceDocumentFile).not.toHaveBeenCalled();
  });

  it('⚠️ ONAYDAN SONRA uç çağrılır ve `chunkCount` EKRANDA TAZELENİR', async () => {
    await renderDetail(row({ chunkCount: 12 }));
    replaceDocumentFile.mockResolvedValue({
      document: {
        ...row(),
        originalFilename: 'Yeni Sozlesme.pdf',
        sizeBytes: 4096,
        updatedAt: '2026-08-19T10:00:00.000Z',
      },
      chunkCount: 3,
    });

    fireEvent.change(fileInput(), { target: { files: [file('Yeni Sozlesme.pdf')] } });
    fireEvent.click(await screen.findByRole('button', { name: 'Evet, dosyayı değiştir' }));

    await waitFor(() => {
      expect(replaceDocumentFile).toHaveBeenCalledTimes(1);
    });
    const call = replaceDocumentFile.mock.calls[0];
    expect(call?.[0]).toBe(ID);
    expect(call?.[1].name).toBe('Yeni Sozlesme.pdf');

    // ⚠️ ESKİ parça sayısı ekranda KALMAZ. Kalsaydı, yeni dosyanın metni
    // okunamadığında kullanıcı belgeyi aranabilir sanmaya devam ederdi (§6.3).
    expect(await screen.findByText('3 parça')).toBeInTheDocument();
    expect(screen.queryByText('12 parça')).not.toBeInTheDocument();
  });

  it('⚠️ ETİKET VE BAĞLANTILAR ekranda DEĞİŞMEZ — uç onlara dokunmaz', async () => {
    await renderDetail();
    replaceDocumentFile.mockResolvedValue({
      document: { ...row(), originalFilename: 'Yeni.pdf' },
      chunkCount: 5,
    });

    fireEvent.change(fileInput(), { target: { files: [file('Yeni.pdf')] } });
    fireEvent.click(await screen.findByRole('button', { name: 'Evet, dosyayı değiştir' }));

    await waitFor(() => {
      expect(replaceDocumentFile).toHaveBeenCalled();
    });

    // `Document.replaceFile` yalnızca dosya + boyut + tür + parçaları değiştirir.
    expect(screen.getByText('sözleşme')).toBeInTheDocument();
    expect(screen.getByText('Ahmet Yılmaz')).toBeInTheDocument();
    expect(screen.getByText('Ofis Taşıma')).toBeInTheDocument();
  });

  it('"Vazgeç" akışı iptal eder ve HİÇBİR ŞEY göndermez', async () => {
    await renderDetail();

    fireEvent.change(fileInput(), { target: { files: [file('Yeni.pdf')] } });
    fireEvent.click(await screen.findByRole('button', { name: 'Vazgeç' }));

    await waitFor(() => {
      expect(screen.queryByText(/geri alınamaz/i)).not.toBeInTheDocument();
    });
    expect(replaceDocumentFile).not.toHaveBeenCalled();
  });
});

describe('DocumentDetailScreen — istemci ön kontrolü', () => {
  it('⚠️ DESTEKLENMEYEN tür onay aşamasına HİÇ GELMEZ', async () => {
    // Aynı kural yükleme akışıyla ORTAK (`chrome.tsx › validateDocumentFile`).
    await renderDetail();

    fireEvent.change(fileInput(), { target: { files: [file('tablo.xlsx')] } });

    expect(await screen.findByText(/Yalnızca PDF ve Word/i)).toBeInTheDocument();
    expect(screen.queryByText(/geri alınamaz/i)).not.toBeInTheDocument();
    expect(replaceDocumentFile).not.toHaveBeenCalled();
  });

  it('⚠️ BOYUT sınırını aşan dosya onay aşamasına HİÇ GELMEZ', async () => {
    await renderDetail();

    fireEvent.change(fileInput(), {
      target: { files: [file('dev.pdf', 21 * 1024 * 1024)] },
    });

    expect(await screen.findByText(/Dosya çok büyük/i)).toBeInTheDocument();
    expect(replaceDocumentFile).not.toHaveBeenCalled();
  });
});
