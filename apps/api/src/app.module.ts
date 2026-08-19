import { Module, RequestMethod, type MiddlewareConsumer, type NestModule } from '@nestjs/common';

import { AppConfigModule } from './infrastructure/config/config.module';
import { DatabaseModule } from './infrastructure/database/database.module';
import { AppLoggerModule } from './infrastructure/logging/logger.module';
import { IdentityModule } from './modules/identity/identity.module';
import { AuthContextMiddleware } from './modules/identity/presentation/auth-context.middleware';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { CrmModule } from './modules/crm/crm.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { FinanceModule } from './modules/finance/finance.module';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { ProjectsModule } from './modules/projects/projects.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { AuthzModule } from './platform/authz/authz.module';
import { HealthModule } from './platform/health/health.module';
import { ContextModule } from './platform/context/context.module';
import { SessionModule } from './platform/session/session.module';
import { TenantContextMiddleware } from './platform/session/presentation/tenant-context.middleware';

/**
 * Uygulamanin kok modulu.
 *
 * ARCHITECTURE 6.2: platform modulleri (Tenant -> Identity -> Authorization -> Audit)
 * Faz 2'den itibaren buraya sirayla eklenir. Is modulleri Faz 5+.
 */
@Module({
  imports: [
    AppConfigModule,
    AppLoggerModule,
    DatabaseModule,
    // Global: merkezi policy engine + permission guard (ADR-0025). Is
    // modullerinden ONCE gelir ki kataloglarini kaydedebilsinler.
    AuthzModule,
    HealthModule,
    TenantModule,
    IdentityModule,
    // switch-tenant: Identity + Tenant orkestrasyonu (MT §7.4 asama 2).
    SessionModule,
    // Ilk IS modulu (ADR-0029/0030). Platform cekirdeginden SONRA gelir:
    // permission katalogunu AuthzModule'e kaydeder ve tenant context'e dayanir.
    KnowledgeModule,
    // Faz 5'in ilk is modulu (ADR-0031). Bu slice'ta AI YOK: sema + RLS + RBAC
    // zinciri once AI karmasikligi olmadan kanitlanir.
    CrmModule,
    // Faz 5'in IKINCI is modulu (ADR-0033). CRM ile ayni sira: bu slice'ta AI
    // YOK, once sema + RLS + RBAC zinciri kurulur.
    ProjectsModule,
    // Faz 5'in UCUNCU is modulu (ADR-0034). Ayni sira, dorduncu kez: bu
    // slice'ta AI YOK, once sema + RLS + RBAC zinciri kurulur.
    //
    // ⚠️ Permission katalogu projedeki ILK DAR katalogdur: `member` ve `viewer`
    // finansi HIC gormez (ADR-0034 §7). Slice 5'te bu, `POST /ask`in izin
    // filtresinin ILK GERCEK tetikcisi olacak.
    FinanceModule,
    // Faz 5'in DORDUNCU is modulu (ADR-0035). Ayni sira, besinci kez: bu
    // slice'ta AI YOK, once sema + RLS + RBAC zinciri kurulur.
    //
    // ⚠️ Permission katalogu Finans'in DAR katalogundan bilincli olarak
    // AYRISIR: dort rol de okur (ADR-0035 §9). Bir randevu takvimi PAYLASILAN
    // bir is gercegidir — yani `POST /ask` izin filtresinin tetikcisi HALA
    // yalnizca Finans'tir.
    AppointmentsModule,
    // Faz 5'in BESINCI is modulu (ADR-0037). Uc sey ILK KEZ oluyor:
    //
    //   1. ⚠️ Kalici durum VERITABANI DISINA cikiyor (Cloudflare R2 —
    //      ADR-0009'un acik biraktigi saglayici secimi kapandi). Nesne
    //      deposunda RLS YOKTUR; izolasyon anahtar duzenine dayanir.
    //   2. Chunk tablosu GERI DONUYOR — bir onceki modulun (Randevu) kararinin
    //      tam tersi. Ayni olcut (metnin ust sinirini KULLANICI mi VERI mi
    //      belirliyor) iki farkli cevap veriyor.
    //   3. Cross-modul referans HICBIR SEY YAPILMAYARAK dogrulaniyor: iki
    //      modulun verisine baglaniyor ama `crm.public.ts` ve
    //      `projects.public.ts` TEK SATIR degismedi.
    //
    // ⚠️ TEK katkici (yalnizca anlamsal) ve o, ALTINCI anlamsal kaynaktir —
    // ADR-0036'nin taban kisiti ilk gercek yukunu burada tasiyor.
    DocumentsModule,
    // Faz 5'in ALTINCI is modulu (ADR-0039). Uc sey kayda deger:
    //
    //   1. ⚠️ MODULUN MERKEZI SAYISI BIR KOLONDA DEGIL: miktar
    //      `inventory.movements`tan HER OKUMADA turetilir (§2). Projede
    //      dokuzuncu kez ayni karar — ama ilk kez GERCEK BIR BEDELLE, cunku
    //      turetme sinirsiz buyuyen bir defteri tarar.
    //   2. ⚠️ DEFTER DEGISTIRILEMEZ (§3.3) — ADR-0034'ten bilincli sapma.
    //      Finans islemi duzeltilebilir; envanter hareketi duzeltilemez, cunku
    //      gecmisi degistirmek BUGUNKU MIKTARI sessizce yeniden yazar.
    //   3. ⚠️ CRM'DEN BU YANA CIKAN KENARI OLMAYAN ILK IS MODULU (§9): hicbir
    //      baska is modulunu import etmiyor. Bagimlilik grafigi alti kenarda
    //      kaliyor ve Stok, CRM ile ayni katmanda bir kok dugum.
    //
    // ⚠️ Iki katkici YAPISAL kaynak sayisini 4'ten 5'e cikariyor ve ADR-0036'nin
    // yeniden gozden gecirme esigine (6) BIR ADIM kaliyor.
    InventoryModule,
    // AI Context Engine — POST /api/v1/ask (ADR-0031 §5). Is modullerinden
    // SONRA gelir: katkicilarini onlar kaydeder.
    ContextModule,
  ],
})
export class AppModule implements NestModule {
  /**
   * ============================================================================
   * CROSS-CUTTING MIDDLEWARE SIRASI KOMPOZISYON KOKUNDE KESINLESTIRILIR
   * ============================================================================
   * `TenantContextMiddleware`, `AuthContextMiddleware`'in istek baglamina
   * yazdigi principal'i OKUR — dolayisiyla auth ONCE calismak zorundadir.
   *
   * NestJS'te FARKLI modullerin middleware'leri arasindaki sira GUVENILIR
   * DEGILDIR (modul cozumleme sirasina baglidir, import sirasini takip etmez —
   * pratikte tenant-context auth'tan ONCE calisip principal'i goremedi). Ayni
   * `consumer.apply(A, B)` cagrisi icindeki sira ise KESINDIR.
   *
   * Bu yuzden ikisi de burada, tek cagriyla ve dogru sirayla uygulanir. Modul
   * dosyalari yalnizca middleware'leri EXPORT eder; sira karari koke aittir.
   * ============================================================================
   */
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(AuthContextMiddleware, TenantContextMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}
