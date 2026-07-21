import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';

import { APP_CONFIG, createAppConfig } from './app.config';

/**
 * Yapilandirmayi tum uygulamaya saglar.
 *
 * @Global secildi: config catrasiz bir cross-cutting concern'dur ve her modulde
 * ayrica import edilmesi gurultuden baska bir sey uretmez. Bu istisna bilinclidir;
 * is modulleri global YAPILMAZ (ARCHITECTURE 6.1).
 */
@Global()
@Module({
  imports: [
    // Yalnizca .env dosyasini process.env'e yukler. Dogrulamayi biz yapariz.
    NestConfigModule.forRoot({
      envFilePath: ['.env.local', '.env'],
      // Production'da yapilandirma dosyadan degil, ortamdan/secret manager'dan gelir.
      ignoreEnvFile: process.env.NODE_ENV === 'production',
      cache: true,
    }),
  ],
  providers: [
    {
      provide: APP_CONFIG,
      useFactory: () => createAppConfig(process.env),
    },
  ],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}
