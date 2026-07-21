import { Inject, Injectable, Logger } from '@nestjs/common';
import type { DependencyHealth, HealthResponse, HealthStatus } from '@business-os/contracts';
import type { Pool } from 'pg';

import { APP_CONFIG, type AppConfig } from '../../infrastructure/config/app.config';
import { DATABASE_POOL } from '../../infrastructure/database/drizzle.client';

/**
 * Uygulamanin ve dis bagimliliklarinin durumunu raporlar.
 *
 * Health endpoint'i bir gozlemlenebilirlik araci degil, bir ORKESTRASYON
 * sozlesmesidir: load balancer ve container scheduler bu cevaba gore trafik
 * yonlendirir. Bu yuzden hizli, yan etkisiz ve tenant'tan bagimsizdir.
 */
@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);
  private readonly startedAt = Date.now();

  public constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(DATABASE_POOL) private readonly pool: Pool,
  ) {}

  public async check(): Promise<HealthResponse> {
    const database = await this.checkDatabase();
    const redis = this.checkRedis();

    return {
      status: this.resolveOverallStatus(database, redis),
      service: 'business-os-api',
      version: this.config.version,
      environment: this.config.env,
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      timestamp: new Date().toISOString(),
      dependencies: { database, redis },
    };
  }

  /**
   * Veritabanina en ucuz anlamli sorguyu atar.
   *
   * Amac semayi dogrulamak degil, havuzdan baglanti alinabildigini kanitlamaktir;
   * agir bir kontrol, saglik yoklamasinin kendisini ariza sebebine cevirir.
   */
  private async checkDatabase(): Promise<DependencyHealth> {
    const startedAt = performance.now();

    try {
      await this.pool.query('SELECT 1');
      return {
        status: 'ok',
        latencyMs: Math.round(performance.now() - startedAt),
      };
    } catch (error: unknown) {
      // Detay log'a gider, cevaba GITMEZ: health endpoint'i kimlik dogrulamasizdir
      // ve hata metni baglanti dizesi/host adi sizdirabilir (DEVELOPMENT_RULES 7.2).
      this.logger.error({ err: error }, 'Veritabani saglik kontrolu basarisiz');

      return {
        status: 'down',
        latencyMs: Math.round(performance.now() - startedAt),
        message: 'Veritabanina baglanilamadi',
      };
    }
  }

  /**
   * Redis Faz 1'de bilincli olarak KULLANILMIYOR.
   * Container ayakta ve ortam degiskeni tanimli, ancak uygulama ona baglanmiyor;
   * cache saglayici karari ARCHITECTURE 2'ye gore Faz 3'te verilecek.
   */
  private checkRedis(): DependencyHealth {
    return {
      status: 'not_configured',
      message: 'Cache katmani Faz 3 kararina birakildi',
    };
  }

  /**
   * Veritabani kritik bagimliliktir: erisilemezse servis `down` sayilir ve
   * orchestrator trafigi keser. `not_configured` bir ariza degildir; kurulmamis
   * bir bagimlilik ile cokmus bir bagimliligi ayirmak, yanlis alarmi onler.
   */
  private resolveOverallStatus(database: DependencyHealth, redis: DependencyHealth): HealthStatus {
    if (database.status === 'down') {
      return 'down';
    }
    if (redis.status === 'down') {
      return 'degraded';
    }
    return 'ok';
  }
}
