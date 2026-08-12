import { Injectable } from '@nestjs/common';

import {
  type ContextFragment,
  type ContributeInput,
  type RetrievalContributor,
} from '../../../platform/context/context.public';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { type AppointmentRepository } from '../application/appointment.repository.port';
import { APPOINTMENT_READ } from '../appointments.permissions';
import { withAppointmentHeader } from '../domain/appointment.entity';

/** Koken etiketi — kaynak atfi ve `degradedSources` bunu tasir. */
export const APPOINTMENT_NOTES_SOURCE = 'appointment-notes';

/**
 * Randevu'nun ANLAMSAL katkisi (ADR-0035 §6, §6.1).
 *
 * `CrmInteractionsContributor` · `ProjectNotesContributor` ·
 * `FinanceCommentariesContributor` ile SIMETRIKTIR: ayni port, ayni desen.
 * Bes modul birbirinin semasini GORMEZ; birlestirmeyi platform yapar.
 *
 * ============================================================================
 * ⚠️ KAYNAK TABLO YAPISAL KATKICIYLA AYNI — VE `source` ETIKETI AYRI
 * ============================================================================
 * `appointment-schedule` de `appointments.appointments`i okur. Bu, projede ILK
 * KEZ oluyor: onceki modullerde yapisal ve anlamsal katkici FARKLI tablolara
 * bakiyordu (`crm.opportunities` vs `crm.interaction_chunks`).
 *
 * Sorun DEGILDIR cunku ayrim tabloda degil SORUDADIR:
 *   `appointment-schedule` -> "takvim nasil gidiyor, yarin kim geliyor"
 *   `appointment-notes`    -> "sunu ne zaman konusmustuk"
 *
 * ⚠️ Etiketlerin AYRI olmasi zorunludur: `degradedSources` ve kaynak atfi bu
 * etikete dayanir. Ayni etiketi paylassalardi biri cokup digeri calistiginda
 * kullaniciya "randevu kaynagi bozuk" denir ve HANGISININ bozuldugu
 * bilinemezdi. Registry zaten ayni `source`un iki kez kaydini bir PROGRAMLAMA
 * HATASI sayar.
 *
 * ============================================================================
 * ⚠️ BASLIK OKUMA ANINDA YENIDEN KURULUR — chunk tablolarindan AYRILDIGI yer
 * ============================================================================
 * Dort onceki anlamsal katkici, gomulen metni (`content`, baslik DAHIL)
 * tablodan OLDUGU GIBI okur. Burada oyle degil: tabloda yalnizca ham
 * `service_note` var (ADR-0035 §3 — chunk tablosu yok, dolayisiyla baslikli
 * metnin saklanacagi bir kolon da yok).
 *
 * Bunun bir YAN FAYDASI var ve kaydedilmeye deger: gosterilen TARIH daima
 * TAZEDIR. Randevu ertelenirse (`scheduled_at` degisirse) vektor bayatlar ama
 * modele giden METIN yeni tarihi tasir. Chunk tablolarinda ikisi de bayatlardi.
 *
 * ⚠️ BEDELI: BASLIKTA KISI ADI YOKTUR — vektorde VAR, metinde YOK.
 * ============================================================================
 * Slice 3 gomulen metne kisi adini KOYUYOR (§6.1), dolayisiyla "Ahmet ile ne
 * konusmustuk" sorusu DOGRU SATIRI BULUR — eslesme vektor uzerinden calisir.
 * Ama donen fragment'in metni adi TASIMAZ.
 *
 * Sebep tek ve serttir: ad `crm.contacts`tadir. Okumanin TEK mesru yolu
 * `ContactDirectory`dir (Mutlak Kural 5 — cross-schema JOIN yasak) ve o dizin
 * IZIN KAPILIDIR, yani cagiranin ROLUNU ister. `ContributeInput` rol TASIMAZ
 * (`question`, `embedding`, `limit`).
 *
 * Rolu ortam baglamindan (`getTenantContext()`) okumak MUMKUN ama YASAK:
 * `crm.public.ts` bunu adiyla reddediyor — _"ACIKCA GECILIYOR, istek
 * baglamindan ORTULU okunmuyor"_. Adi kapisiz dondurmek ise `contact:read`
 * tasimayan bir kullaniciya CRM verisi sizdirirdi; bugun dort rol de o izni
 * tasidigi icin sizinti GERCEKLESMEZ ama kapi EKSIK olurdu — projenin "kapi
 * var, tetikci yok" diye kaydettigi durumun tam TERSI, ve tehlikelisi.
 *
 * ⚠️ TETIKLEYICI: `ContributeInput`a `role` eklenirse (PLATFORM karari, bes
 * modulu birden ilgilendirir) bu satir degisir ve baslik adi tasiyabilir.
 */
@Injectable()
export class AppointmentNotesContributor implements RetrievalContributor {
  readonly source = APPOINTMENT_NOTES_SOURCE;
  readonly permission = APPOINTMENT_READ;

  constructor(
    private readonly repository: AppointmentRepository,
    private readonly transactionManager: TransactionManager,
  ) {}

  /**
   * Kendi transaction'ini ACAR.
   *
   * Katkicilar PARALEL cagrilir; ortak bir transaction paylasmak onlari
   * birbirinin kilidine baglardi.
   */
  async contribute(input: ContributeInput): Promise<ContextFragment[]> {
    const notes = await this.transactionManager.runInCurrentTenantTransaction(() =>
      this.repository.findSimilarNotes({ embedding: input.embedding, limit: input.limit }),
    );

    return notes.map((note, index) => ({
      // Baslik `withAppointmentHeader` ile kurulur — Slice 3'te gomerken
      // kullanilan AYNI fonksiyon. Iki yerde ayri bicimlendirilseydi model
      // ayni kaydi iki farkli sekilde gorurdu.
      //
      // ⚠️ `contactName: null` GECILIYOR ve bu bir eksiklik DEGIL, yukarida
      // gerekcelendirilmis bir SINIRDIR.
      content: withAppointmentHeader({
        scheduledAt: note.scheduledAt,
        contactName: null,
        serviceNote: note.serviceNote,
      }),
      // Repository skor DONDURMEZ; kosinus mesafesine gore SIRALI bir liste
      // verir. Siralamayi korumak icin sentetik ve AZALAN bir skor uretilir —
      // dort onceki anlamsal katkiciyla AYNI formul.
      //
      // ⚠️ Skor kaynaklar ARASI karsilastirma icin anlamli DEGILDIR (ADR-0031'in
      // "skorlar kalibre degil" bilinen siniri). Artik BES anlamsal katkici yan
      // yana calisiyor — ADR-0034'un "anlamsal kaynak sayisi bese cikinca
      // rerank ertelenemez" tetikleyicisi TAM OLARAK BURADA cekiliyor
      // (ADR-0035 §6.3; kapanis denetiminde OLCULECEK).
      score: 1 - index / (notes.length + 1),
      source: APPOINTMENT_NOTES_SOURCE,
      reference: { kind: 'appointment', id: note.id },
    }));
  }
}
