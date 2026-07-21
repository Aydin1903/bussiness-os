import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export const SWAGGER_PATH = 'api/docs';
export const SWAGGER_JSON_PATH = 'api/docs/json';

/**
 * OpenAPI dokumantasyonunu yayinlar.
 *
 * Production'da varsayilan olarak KAPALIDIR (SWAGGER_ENABLED): API yuzeyini
 * kimlik dogrulamasiz ifsa etmek gereksiz bir kesif yuzeyidir.
 *
 * Not: sozlesmeler Zod ile tanimlaniyor (packages/contracts), @nestjs/swagger ise
 * decorator okur. Faz 1'de endpoint govdesi almadigi icin bu fark sorun uretmiyor.
 * Zod semalarindan OpenAPI uretimi Faz 2'de karara baglanacak — ek bir bagimlilik
 * gerektirdigi icin Product Owner onayina sunulacaktir.
 */
export function setupSwagger(app: INestApplication, version: string): void {
  const document = new DocumentBuilder()
    .setTitle('Business OS API')
    .setDescription('AI destekli, cok kiracili SaaS Business Operating System')
    .setVersion(version)
    .build();

  SwaggerModule.setup(SWAGGER_PATH, app, SwaggerModule.createDocument(app, document), {
    jsonDocumentUrl: SWAGGER_JSON_PATH,
    swaggerOptions: { persistAuthorization: true },
  });
}
