import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import type { Pool } from 'pg';

import { APP_CONFIG, type AppConfig } from '../config/app.config';
import { DATABASE, DATABASE_POOL, createDrizzle, createPool } from './drizzle.client';

/**
 * Veritabani erisimini saglar.
 *
 * @Global secildi: veritabani istemcisi her modulun ihtiyac duydugu bir altyapi
 * kaynagidir ve her yerde ayrica import edilmesi gurultuden baska bir sey uretmez.
 * Bu istisna bilinclidir; is modulleri global YAPILMAZ (ARCHITECTURE 6.1).
 *
 * Not: Faz 2'de tenant baglanti cozumu (TenantConnectionResolver, ARCHITECTURE 3.1)
 * bu modulun uzerine eklenir; shared/dedicated ayrimi burada soyutlanacaktir.
 */
@Global()
@Module({
  providers: [
    {
      provide: DATABASE_POOL,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): Pool => createPool(config),
    },
    {
      provide: DATABASE,
      inject: [DATABASE_POOL],
      useFactory: (pool: Pool) => createDrizzle(pool),
    },
  ],
  exports: [DATABASE, DATABASE_POOL],
})
export class DatabaseModule implements OnApplicationShutdown {
  public constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  /**
   * Havuzu kapatir. Bu olmadan SIGTERM sonrasi surec, acik baglantilar yuzunden
   * sonlanmaz ve orchestrator container'i zorla oldurur — devam eden istekler kaybolur.
   */
  public async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
