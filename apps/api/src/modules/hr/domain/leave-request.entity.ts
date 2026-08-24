import { assertHrCalendarDay } from './compensation-money';
import { InvalidLeaveDatesError, LeaveAlreadyDecidedError } from './hr.error';

/**
 * ⚠️ IZIN TURLERI — `sick` / `raporlu` YOKTUR VE EKLENMEYECEKTIR.
 *
 * ============================================================================
 * BU LISTE, ADR-0043 §3'UN SAGLIK VERISI SINIRININ TASIYICISIDIR
 * ============================================================================
 * Bir izin turu olarak "hastalik" secmek, o satiri SERBEST METIN OLMASA BILE
 * KVKK m.6 kapsaminda bir SAGLIK VERISI yapardi. Liste bilincli olarak saglik
 * IMA ETMEYEN kalemlerden olusur.
 *
 * ⚠️ DURUST BEDEL: bir isletme raporlu gunleri bu modulde TAKIP EDEMEZ. Dogru
 * cevap "mazeret" diye yazmak DEGILDIR — o da veriyi orada tutar. Dogru cevap,
 * ADR-0043 §3.4'un uc onkosulu saglandiginda AYRI bir ADR'dir.
 */
export type LeaveType = 'annual' | 'unpaid' | 'excuse' | 'administrative';

export type LeaveStatus = 'pending' | 'approved' | 'rejected';

export interface LeaveRequestFields {
  readonly type: LeaveType;
  readonly startsOn: string;
  readonly endsOn: string;
}

export interface LeaveRequestState extends LeaveRequestFields {
  readonly id: string;
  readonly tenantId: string;
  readonly employeeId: string;
  readonly status: LeaveStatus;
  readonly requestedByUserId: string;
  readonly requestedAt: Date;
  /** ⚠️ SATIR ICI AKTOR DAMGASI — bir denetim izi DEGILDIR (ADR-0044 §2.4). */
  readonly decidedByUserId: string | null;
  readonly decidedAt: Date | null;
}

/**
 * Izin talebi (ADR-0044 §2).
 *
 * ============================================================================
 * ⚠️ BU SINIFTA "SEBEP" ALANI YOKTUR
 * ============================================================================
 * Bir izin kaydinin en dogal alani "sebep"tir ve oraya ILK YAZILACAK SEY
 * "RAPORLU"DUR — yani ADR-0043 §3'un disarida tuttugu SAGLIK VERISI. Sinir
 * konup yanina bos bir metin kutusu birakmak, siniri KULLANICIYA IHLAL
 * ETTIRMEKTIR ve hata SESSIZDIR.
 *
 * ============================================================================
 * ⚠️ GUN SAYISI KOLON DEGIL, TURETILIR — VE IS GUNU HESABI YOKTUR (§2.5)
 * ============================================================================
 * Resmi tatiller ULKEYE OZEL MEVZUATTIR (ADR-0041'in e-fatura ve ADR-0043'un
 * bordro gerekcesiyle ayni) ve hafta sonu tanimi bile evrensel degildir.
 * Sistem TAKVIM GUNU sayar; isletme "5 gun izin" derken ne kastettigini kendi
 * bilir.
 */
export class LeaveRequest {
  private constructor(private readonly state: LeaveRequestState) {}

  static create(input: {
    id: string;
    tenantId: string;
    employeeId: string;
    requestedByUserId: string;
    fields: LeaveRequestFields;
    now: Date;
  }): LeaveRequest {
    const startsOn = assertHrCalendarDay(input.fields.startsOn);
    const endsOn = assertHrCalendarDay(input.fields.endsOn);

    if (endsOn < startsOn) {
      throw new InvalidLeaveDatesError();
    }

    return new LeaveRequest({
      id: input.id,
      tenantId: input.tenantId,
      employeeId: input.employeeId,
      type: input.fields.type,
      startsOn,
      endsOn,
      status: 'pending',
      requestedByUserId: input.requestedByUserId,
      requestedAt: input.now,
      decidedByUserId: null,
      decidedAt: null,
    });
  }

  static fromPersistence(state: LeaveRequestState): LeaveRequest {
    return new LeaveRequest(state);
  }

  /**
   * Onaylar ya da reddeder.
   *
   * ⚠️ KARARA BAGLANMIS BIR IZIN YENIDEN KARARA BAGLANAMAZ. Aksi halde bir
   * onay sessizce geri alinabilirdi ve "kim onayladi" sorusunun cevabi
   * DEGISIRDI — satir ici damganin tek isi o soruyu cevaplamak.
   *
   * ⚠️ Fikir degisirse dogru yol YENI BIR TALEPTIR (ADR-0043 §1.4'un "ayrilan
   * calisan silinmez, isaretlenir" karariyla ayni disiplin).
   */
  decide(input: { status: 'approved' | 'rejected'; userId: string; now: Date }): LeaveRequest {
    if (this.state.status !== 'pending') {
      throw new LeaveAlreadyDecidedError();
    }

    return new LeaveRequest({
      ...this.state,
      status: input.status,
      decidedByUserId: input.userId,
      decidedAt: input.now,
    });
  }

  /**
   * TAKVIM GUNU sayisi (bas ve son dahil).
   *
   * ⚠️ IS GUNU DEGIL (yukaridaki gerekce). `Date.UTC` kullanilir: yerel saat
   * kullanilsaydi sonuc calistirilan makinenin dilimine gore DEGISIRDI.
   */
  get days(): number {
    const start = Date.parse(`${this.state.startsOn}T00:00:00.000Z`);
    const end = Date.parse(`${this.state.endsOn}T00:00:00.000Z`);
    return Math.round((end - start) / 86_400_000) + 1;
  }

  /** ⚠️ Yalnizca ONAYLANMIS `annual` izin hak edisten duser (§2.3). */
  get consumesEntitlement(): boolean {
    return this.state.status === 'approved' && this.state.type === 'annual';
  }

  toState(): LeaveRequestState {
    return this.state;
  }
}
