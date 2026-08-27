import { Inject, Module } from '@nestjs/common';

import { SystemClock } from '../../infrastructure/clock/system-clock.adapter';
import { DrizzleTransactionManager } from '../../infrastructure/database/drizzle-transaction-manager.adapter';
import { UuidV7IdGenerator } from '../../infrastructure/id/uuid-v7-id-generator.adapter';
import { PERMISSION_REGISTRY, type PermissionRegistry } from '../../platform/authz/authz.public';
import { CLOCK, type Clock } from '../../shared/clock.port';
import { ID_GENERATOR, type IdGenerator } from '../../shared/id-generator.port';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '../../shared/transaction-manager.port';
import { CrmModule } from '../crm/crm.module';
import { CRM_CONTACT_DIRECTORY, type ContactDirectory } from '../crm/crm.public';
import { LOYALTY_REPOSITORY, type LoyaltyRepository } from './application/loyalty.repository.port';
import { LoyaltyUseCases } from './application/loyalty.use-cases';
import { DrizzleLoyaltyRepository } from './infrastructure/drizzle-loyalty.repository';
import { LOYALTY_PERMISSIONS } from './loyalty.permissions';
import { LoyaltyController } from './presentation/loyalty.controller';

/**
 * Sadakat Programi — Faz 5'in ONIKINCI ve SON is modulu (ADR-0051).
 *
 * ============================================================================
 * ⚠️ `ContextModule` IMPORT EDILMIYOR — IK'DAN SONRA IKINCI KEZ
 * ============================================================================
 * On bir is modulunun onu `ContextModule`u import edip en az bir
 * `RetrievalContributor` kaydeder. Bu modul **SIFIR** kaydeder.
 *
 * ⚠️ AMA IK'NIN (ADR-0043) SIFIRINDAN FARKLI BIR SEYDIR ve karistirilmamalidir:
 *
 *   IK'da sifir      -> bir GUVENLIK OZELLIGI. Bir maas rakaminin modele
 *                       gitmesi icin once semanin, sonra API'nin, sonra iznin
 *                       degismesi gerekir.
 *   ⚠️ Burada sifir  -> bir SINIR. v1'de bu modulun kurumsal hafizaya
 *                       soyleyecek HICBIR SEYI YOKTUR.
 *
 * ⚠️ Uc aday dort testle elendi (ADR-0051 §3.3) ve T2 HICBIRININ REDDINDE
 * GEREKCE OLARAK KULLANILMADI (ADR-0050 §Karar 4: "her zaman atesleyen bir
 * tetikleyici artik tetikleyici degildir"):
 *
 *   `loyalty-expiry`  -> ⚠️ REDDEDILMEDI, TANIMLANAMADI: puan sona ermesi
 *                        kapsam disi, yani hesaplanacak GIRDI YOK.
 *   `loyalty-dormant` -> fiil DEGIL, fiilin YOKLUGU (ADR-0040'in reddettigi
 *                        sekil) ve ⚠️ SEYREK DEGIL — sadakat programinda
 *                        cogunluk zaten durgundur.
 *   `loyalty-balance` -> bir SAYIM ("12 aktif calisan" sinifi).
 *
 * ⚠️ EN DERIN BULGU (§3.4): bu projedeki her yapisal alarm ya KULLANICININ
 * BEYAN ETTIGI BIR ESIGE ya BIR TARIHE dayanir — ve Sadakat v1'de IKISI DE
 * YOKTUR. Eksik olan bir katkici degil, onun BESLEYECEGI GIRDIDIR.
 *
 * ⚠️ Somut sonucu: fan-out **18'de kalir** (10 anlamsal + 8 yapisal), yapisal
 * kaynak **8'de**, T2'nin durumu DEGISMEZ ve ADR-0050'nin butun aritmetigi
 * AYNEN GECERLIDIR.
 *
 * ============================================================================
 * ⚠️ ORAN SINIRI YOK, EMBEDDING YOK, `reindex` YOK
 * ============================================================================
 * `RATE_LIMIT_REPOSITORY` ve `EMBEDDING_PORT` saglanmiyor cunku bu modul
 * HICBIR AI cagrisi yapmaz — vektor tasimayan UCUNCU is modulu (Teklif/Fatura,
 * IK, Sadakat). ⚠️ Yine de exception filter uc AI hata tipini BASTAN tasir
 * (CLAUDE.md kalici standardi, ONUCUNCU kez).
 *
 * ============================================================================
 * ⚠️ `platform/audit` KULLANILMIYOR — VE GEREKCE YENI (ADR-0051 §2.4)
 * ============================================================================
 * `AuditModule` import EDILMEZ. ADR-0047 audit'i _"denetim izi, degistirilmesi
 * BIR BASKASINI ETKILEYEN alanlar icindir"_ diye elemisti; ⚠️ burada o olcut
 * YETMEZ (bir puan bakiyesi gercekten baskasini etkiler — musterinin hakkidir).
 *
 * Elemeyi yapan sey ADR-0041'in olcutudur: ⚠️ **DEGISTIRILEMEZLIK, DENETIM
 * IZINDEN UCUZDUR.** Bir denetim izi "kim degistirdi"ye cevap verir; burada
 * DEGISTIRME DIYE BIR ISLEM YOKTUR. Defter ekleme-yalnizdir, bakiye ondan
 * turetilir — yani her satirin `created_by_user_id` damgasi BAKIYENIN TAM
 * GECMISIDIR.
 *
 * ⚠️ Acikta kalan TEK durum kayitli: hesap silinirse defter de gider ve
 * "kim sildi" SORULAMAZ.
 *
 * ============================================================================
 * ⚠️ TEK KENAR: `Sadakat -> CRM` — grafik DOKUZDAN ONA cikar, hala DAG
 * ============================================================================
 * `CrmModule` import edilir ama YON TEK YONLUDUR: CRM, Sadakat'i BILMEZ.
 * ⚠️ `loyalty.public.ts` ACILMAZ (talip yokken dizin yazilmaz) — modul bir
 * YAPRAKTIR ve bu, DAG kanitini bir IDDIA degil MEKANIK bir olgu kilar.
 *
 * ⚠️ `crm.public.ts` TEK SATIR DEGISMEZ: `ContactDirectory`yi Randevu yazdi
 * (ADR-0035 §4), Geri Bildirim kullandi. ADR-0037 §4.1'in kurali
 * (_"yeni TALIP -> dosya degismez"_) BESINCI kez talip tarafindan
 * dogrulaniyor — ve bunun olculebilir sonucu, cross-modul icin AYRI BIR SLICE
 * GEREKMEMESIDIR.
 */
@Module({
  imports: [CrmModule],
  controllers: [LoyaltyController],
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: UuidV7IdGenerator },
    { provide: TRANSACTION_MANAGER, useClass: DrizzleTransactionManager },
    { provide: LOYALTY_REPOSITORY, useClass: DrizzleLoyaltyRepository },
    {
      provide: LoyaltyUseCases,
      inject: [LOYALTY_REPOSITORY, CRM_CONTACT_DIRECTORY, TRANSACTION_MANAGER, ID_GENERATOR, CLOCK],
      useFactory: (
        repository: LoyaltyRepository,
        contactDirectory: ContactDirectory,
        transactionManager: TransactionManager,
        idGenerator: IdGenerator,
        clock: Clock,
      ): LoyaltyUseCases =>
        new LoyaltyUseCases({
          repository,
          contactDirectory,
          transactionManager,
          idGenerator,
          clock,
        }),
    },
  ],
})
export class LoyaltyModule {
  constructor(@Inject(PERMISSION_REGISTRY) permissions: PermissionRegistry) {
    permissions.register(LOYALTY_PERMISSIONS);

    // ⚠️ BURADA BIR `contributors.register(...)` SATIRI YOKTUR ve olmayacaktir
    // (§3). Bir gun birisi "sadakat ozeti" katkicisi eklemek isterse, once
    // ADR-0051 §3.3'un dort testini ve §3.4'un "girdi yok" bulgusunu okumak
    // zorundadir.
  }
}
