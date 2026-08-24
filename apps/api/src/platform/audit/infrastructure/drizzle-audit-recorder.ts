import { Inject, Injectable } from '@nestjs/common';

import { getPrincipal } from '../../../infrastructure/auth/auth-context';
import { auditLog } from '../../../infrastructure/database/schema';
import { requireTransaction } from '../../../infrastructure/database/transaction-context';
import { type AuditEntry, type AuditRecorder } from '../../../shared/audit.port';
import { CLOCK, type Clock } from '../../../shared/clock.port';
import { ID_GENERATOR, type IdGenerator } from '../../../shared/id-generator.port';
import { toAuditRows } from '../application/audit-rows';

/**
 * `AuditRecorder`in Drizzle implementasyonu (ADR-0043 §6.4).
 *
 * ============================================================================
 * ⚠️ CAGIRANIN TRANSACTION'INA YAZAR — KENDI TRANSACTION'INI ACMAZ
 * ============================================================================
 * `requireTransaction()` aktif transaction YOKSA HATA FIRLATIR (MT §11.4
 * kural 2/3). Bu, port sozlesmesinin en onemli garantisidir: denetim kaydi
 * degisiklikle AYNI COMMIT'tedir.
 *
 * Sonucu iki yonludur ve ikisi de kabul edildi:
 *   * Degisiklik geri alinirsa denetim kaydi da geri alinir — YETIM KAYIT YOK.
 *   * ⚠️ Denetim kaydi yazilamazsa DEGISIKLIK DE YAZILMAZ. Kuyruk/outbox
 *     ADR-0043 §6.8'de reddedildi: kaybolabilen bir denetim kaydi, HIC
 *     OLMAYANDAN KOTUDUR cunku YANLIS BIR GUVEN uretir.
 *
 * ============================================================================
 * ⚠️ TENANT VE AKTOR CAGIRANDAN GELMEZ
 * ============================================================================
 * Ikisi de port sozlesmesinde YOKTUR (`shared/audit.port.ts`) ve burada
 * DOGRULANMIS baglamdan okunur:
 *
 *   * `tenantId` -> AKTIF TRANSACTION'in kendisinden. Bu, `SET LOCAL
 *     app.current_tenant_id` ile BIREBIR ayni degerdir; yani denetim satiri
 *     tanimi geregi degisikligin yazildigi tenant'a aittir. RLS'in `WITH
 *     CHECK`i ayrica zorlar — yanlis tenant yazmak veritabaninda REDDEDILIR.
 *   * `actorUserId` -> auth middleware'inin dogruladigi token baglamindan
 *     (DEVELOPMENT_RULES 4.5). Cagirandan alinsaydi cagiran YANLIS BIR AKTOR
 *     yazabilirdi ve denetim kaydinin butun degeri bu tek noktaya baglidir.
 *
 * ⚠️ `CurrentUserProvider` KULLANILMIYOR, `getPrincipal()` kullaniliyor —
 * cunku o port kimliksiz istekte HATA FIRLATIR ve burada kimliksiz istek
 * MESRUDUR: bir arka plan isi (worker, ileride retention) veri degistirebilir
 * ve aktoru YOKTUR. O durumda `null` yazilir (§6.4), sahte bir kullanici
 * uydurulmaz.
 */
@Injectable()
export class DrizzleAuditRecorder implements AuditRecorder {
  constructor(
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ID_GENERATOR) private readonly idGenerator: IdGenerator,
  ) {}

  async record(entry: AuditEntry): Promise<void> {
    const { db, tenantId } = requireTransaction();

    if (tenantId === null) {
      // Tenant'siz akislar (provisioning oncesi, tenant cozumleme) denetim
      // kaydi uretemez: tablo tenant-scoped'tir ve `tenant_id` NOT NULL'dur.
      // Sessizce atlamak, kaydin tutuldugu izlenimini birakirdi.
      throw new Error(
        'Denetim kaydi tenant context olmadan yazilamaz ' +
          '(platform.audit_log tenant-scoped, MT §12.3).',
      );
    }

    const rows = toAuditRows({
      tenantId,
      actorUserId: getPrincipal()?.userId ?? null,
      // ⚠️ TEK cagri: ayni islemin butun satirlari BIREBIR ayni damgayi tasir
      // ve gruplama anahtari budur (ADR-0043 §6.4).
      occurredAt: this.clock.now(),
      entry,
      nextId: () => this.idGenerator.nextId(),
    });

    if (rows.length === 0) {
      // Hicbir alan degismedi -> kayit tutulmaz (ADR-0039'un fiziksel sayim
      // karariyla ayni sekil). Bos bir `INSERT ... VALUES` zaten hata verirdi.
      return;
    }

    await db.insert(auditLog).values(rows);
  }
}
