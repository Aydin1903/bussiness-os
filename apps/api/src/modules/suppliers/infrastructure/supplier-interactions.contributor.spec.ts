import { describe, expect, it, vi } from 'vitest';

import { type TransactionManager } from '../../../shared/transaction-manager.port';
import {
  type SimilarInteraction,
  type SupplierRepository,
} from '../application/supplier.repository.port';
import { SUPPLIER_INTERACTION_READ } from '../suppliers.permissions';
import { SupplierInteractionsContributor } from './supplier-interactions.contributor';

const transactionManager = {
  runInCurrentTenantTransaction: <T>(work: () => Promise<T>): Promise<T> => work(),
} as unknown as TransactionManager;

function build(rows: SimilarInteraction[] = []) {
  const findSimilarInteractions = vi
    .fn<SupplierRepository['findSimilarInteractions']>()
    .mockResolvedValue(rows);
  const repository = { findSimilarInteractions } as unknown as SupplierRepository;

  return {
    contributor: new SupplierInteractionsContributor(repository, transactionManager),
    findSimilarInteractions,
  };
}

const input = { question: 'vidada zam var miydi', embedding: [0.1, 0.2], limit: 3 };

describe('SupplierInteractionsContributor (ADR-0040 §3)', () => {
  it('ADR-0036: kendini ANLAMSAL ilan eder ve kapisi `supplier_interaction:read`', () => {
    const { contributor } = build();

    expect(contributor.contributionKind).toBe('semantic');
    expect(contributor.source).toBe('supplier-interactions');
    expect(contributor.permission).toBe(SUPPLIER_INTERACTION_READ);
  });

  it('⚠️ `structural` DEGIL — ADR-0036 nin ESIGINE DOKUNMAMA KARARI', () => {
    // ADR-0039 §7.2 bu module acikca soru birakmisti: "7. modul bir YAPISAL
    // katkici eklerse esik (6) ASILIR ve ADR-0036 yeniden acilmak ZORUNDADIR."
    //
    // Uc aday degerlendirildi ve ucu de reddedildi (§3.2):
    //   - "tedarikci performansi" -> siparis/teslimat v1'de YOK, hesaplanacak
    //     hicbir sey olmazdi (bir SAYIM olurdu, hafiza degil),
    //   - "durgun tedarikci"      -> turetilebilir ama HABER DEGIL; yilda bir
    //     calisilan tedarikci 364 gun "durgun" gorunur ve bir TABAN YUVASI
    //     ISGAL EDERDI,
    //   - "odeme vadesi yaklasan" -> `payment_terms` SERBEST METIN, vade
    //     CIKARILAMAZ (regex bir sessiz hata makinesi olurdu).
    //
    // ⚠️ Bu satirin `'structural'` olmasi yapisal kaynak sayisini 5'ten 6'ya
    // cikarir ve ADR-0036'yi yeniden acilmak zorunda birakirdi. Bedeli bir
    // satir kod degil, BIR PLATFORM KARARIDIR.
    const { contributor } = build();

    expect(contributor.contributionKind).not.toBe('structural');
  });

  it('⚠️ BASLIKTA TEDARIKCI ADI VAR — Randevu daki sinir BURADA YOK', () => {
    // `AppointmentNotesContributor` basliga adi KOYAMIYORDU: ad `crm.contacts`
    // taydi (BASKA SEMA) ve okumanin tek mesru yolu IZIN KAPILI bir dizindi;
    // `ContributeInput` rol tasimaz.
    //
    // Burada ad `suppliers.suppliers`tadir — AYNI SEMADA, `JOIN` mesru.
    const { contributor } = build([
      {
        id: 'a',
        occurredOn: '2026-08-21',
        body: 'M8 vidada %6 zam',
        supplierName: 'Yildiz Civata',
      },
    ]);

    return contributor.contribute(input).then((fragments) => {
      expect(fragments[0]?.content).toBe(
        '[Tedarikci · 2026-08-21 · Yildiz Civata] M8 vidada %6 zam',
      );
    });
  });

  it('⚠️ AD OKUMA ANINDA COZULUR — vektor bayat olsa bile METIN TAZE', () => {
    // Repository `JOIN` ile GUNCEL adi doner. Vektor eski adla uretilmis
    // olabilir (§6 — bayatlama penceresi VAR) ama modele giden metin daima
    // bugunku adi tasir. Chunk tablolarinda ikisi de bayatlardi.
    const { contributor } = build([
      {
        id: 'a',
        occurredOn: '2026-08-21',
        body: 'zam',
        supplierName: 'Yildiz Baglanti Elemanlari A.S.',
      },
    ]);

    return contributor.contribute(input).then((fragments) => {
      expect(fragments[0]?.content).toContain('Yildiz Baglanti Elemanlari A.S.');
    });
  });

  it('ad `null` ise baslik ONSUZ kurulur — savunma katmani', () => {
    const { contributor } = build([
      { id: 'a', occurredOn: '2026-08-21', body: 'zam', supplierName: null },
    ]);

    return contributor.contribute(input).then((fragments) => {
      expect(fragments[0]?.content).toBe('[Tedarikci · 2026-08-21] zam');
    });
  });

  it('skor AZALAN — repository nin siralamasini korur', async () => {
    const { contributor } = build([
      { id: 'a', occurredOn: '2026-08-21', body: 'n1', supplierName: 'A' },
      { id: 'b', occurredOn: '2026-08-20', body: 'n2', supplierName: 'B' },
      { id: 'c', occurredOn: '2026-08-19', body: 'n3', supplierName: 'C' },
    ]);

    const fragments = await contributor.contribute(input);
    const scores = fragments.map((f) => f.score);

    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(new Set(scores).size).toBe(3);
  });

  it('atif `supplier-interaction` turunde ve kaynak id sini tasir', async () => {
    const { contributor } = build([
      { id: 'int-9', occurredOn: '2026-08-21', body: 'zam', supplierName: 'A' },
    ]);

    const fragments = await contributor.contribute(input);

    expect(fragments[0]?.reference).toEqual({ kind: 'supplier-interaction', id: 'int-9' });
  });

  it('embedding ve limit porta OLDUGU GIBI gecer', async () => {
    const { contributor, findSimilarInteractions } = build();

    await contributor.contribute(input);

    expect(findSimilarInteractions).toHaveBeenCalledWith({
      embedding: input.embedding,
      limit: 3,
    });
  });

  it('sonuc yoksa BOS dizi doner — bos yuva ayrilmaz', async () => {
    const { contributor } = build([]);

    expect(await contributor.contribute(input)).toEqual([]);
  });
});
