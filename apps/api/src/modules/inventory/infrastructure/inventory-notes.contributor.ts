import { Injectable } from '@nestjs/common';

import {
  type ContextFragment,
  type ContributeInput,
  type RetrievalContributor,
} from '../../../platform/context/context.public';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { type InventoryRepository } from '../application/inventory.repository.port';
import { withStockItemHeader } from '../domain/stock-item.entity';
import { STOCK_ITEM_READ } from '../inventory.permissions';

/** Koken etiketi — kaynak atfi ve `degradedSources` bunu tasir. */
export const INVENTORY_NOTES_SOURCE = 'inventory-notes';

/**
 * Stok'un ANLAMSAL katkisi (ADR-0039 §5, §6.2).
 *
 * `CrmInteractionsContributor` · `ProjectNotesContributor` ·
 * `FinanceCommentariesContributor` · `AppointmentNotesContributor` ·
 * `DocumentsContributor` ile SIMETRIKTIR: ayni port, ayni desen. Alti modul
 * birbirinin semasini GORMEZ; birlestirmeyi platform yapar.
 *
 * ============================================================================
 * ⚠️ YEDINCI ANLAMSAL KAYNAK — ve havuz artik GERCEKTEN kalabalik
 * ============================================================================
 * ADR-0036'nin taban kisiti yapisal kaynaklara `ceil(8/3) = 3` yuva GARANTI
 * eder; geriye BES SERBEST YUVA kalir ve onlar icin artik YEDI anlamsal kaynak
 * yarisiyor.
 *
 * ⚠️ Bir anlamsal kaynagin SIFIR almasi ADR-0036'nin YAZILI BEKLENTISIDIR, bir
 * kusuru degil: _"Anlamsal kaynaklar arasinda taban YOKTUR ... aralarindaki
 * eleme LIYAKATTIR."_ Bu modulden sonra bu, IKI kaynak icin gecerli olabilir.
 *
 * ============================================================================
 * ⚠️ BASLIK OKUMA ANINDA YENIDEN KURULUR — ve burada BAYATLAMA YOK
 * ============================================================================
 * `AppointmentNotesContributor` ile ayni mekanik (chunk tablosu olmadigi icin
 * baslikli metin saklanmaz, `withStockItemHeader` ile yeniden kurulur) ama
 * ONEMLI BIR FARKLA:
 *
 * Randevu'da baslik CRM kisisinin adini TASIYAMIYORDU — ad baska bir semadaydi
 * ve okumak izin kapili bir dizin cagrisi (yani cagiranin ROLU) isterdi;
 * `ContributeInput` rol tasimaz. Burada boyle bir sorun YOK: ad ve SKU AYNI
 * SATIRIN kolonlaridir.
 *
 * Sonucu iki yonlu:
 *   1. Donen fragment TAM kimligi tasir (ad + SKU + not) — model "hangi kalem"
 *      sorusunu metinden cevaplayabilir.
 *   2. Vektor de tam kimligi tasir ve BAYATLAMAZ: yeniden adlandirma zaten
 *      kalemin `PATCH`idir ve embedding AYNI ISLEMDE yeniden uretilir
 *      (ADR-0039 §6.2).
 *
 * Yani bu, projede baslik denormalizasyonunun BEDELSIZ oldugu ILK yerdir.
 *
 * ============================================================================
 * ⚠️ MIKTAR BURAYA GIRMEZ
 * ============================================================================
 * Fragment yalnizca kalemin KIMLIGINI ve NOTUNU tasir; "kac tane var" bilgisi
 * `inventory-stock`un isidir. Iki gerekce:
 *
 *   1. Miktar bir TOPLAMDIR (§2) ve bu katkici anlamsal aramadan doner —
 *      her isabet icin ayrica bir toplama sorgusu, arama basina N sorgu demekti.
 *   2. Ikisi FARKLI SORULARA cevap verir: "bu partiyi kimden almistik" ile
 *      "neyimiz bitiyor". Ayni fragment'e koymak, her anlamsal isabete her
 *      soruda stok sayisi tasirdi.
 */
@Injectable()
export class InventoryNotesContributor implements RetrievalContributor {
  readonly source = INVENTORY_NOTES_SOURCE;
  /** ADR-0036: vektor benzerligiyle bulunan ANLATISAL icerik. */
  readonly contributionKind = 'semantic' as const;
  readonly permission = STOCK_ITEM_READ;

  constructor(
    private readonly repository: InventoryRepository,
    private readonly transactionManager: TransactionManager,
  ) {}

  /**
   * Kendi transaction'ini ACAR.
   *
   * Katkicilar PARALEL cagrilir; ortak bir transaction paylasmak onlari
   * birbirinin kilidine baglardi — ve bu modulde gercek bir satir kilidi VAR
   * (§3.2), yani bagimlilik teorik degil olurdu.
   */
  async contribute(input: ContributeInput): Promise<ContextFragment[]> {
    const notes = await this.transactionManager.runInCurrentTenantTransaction(() =>
      this.repository.findSimilarNotes({ embedding: input.embedding, limit: input.limit }),
    );

    return notes.map((note, index) => ({
      // Baslik `withStockItemHeader` ile kurulur — gomerken kullanilan AYNI
      // fonksiyon. Iki yerde ayri bicimlendirilseydi model ayni kaydi iki farkli
      // sekilde gorurdu.
      content: withStockItemHeader({ name: note.name, sku: note.sku, note: note.note }),
      // Repository skor DONDURMEZ; kosinus mesafesine gore SIRALI bir liste
      // verir. Siralamayi korumak icin sentetik ve AZALAN bir skor uretilir —
      // bes onceki anlamsal katkiciyla AYNI formul.
      //
      // ⚠️ Skor kaynaklar ARASI karsilastirma icin anlamli DEGILDIR (ADR-0031'in
      // "skorlar kalibre degil" bilinen siniri; ADR-0036 onu duzeltmedi,
      // yalnizca en gorunur sonucunu telafi etti).
      score: 1 - index / (notes.length + 1),
      source: INVENTORY_NOTES_SOURCE,
      reference: { kind: 'stock-item', id: note.id },
    }));
  }
}
