import { Server } from 'node:http';

import { VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../../src/app.module';
import { ProblemDetailsFilter } from '../../src/infrastructure/http/problem-details.filter';
import { correlationIdMiddleware } from '../../src/infrastructure/logging/correlation-id.middleware';
import { setIdentityTestEnv } from './support/identity-env';
import { startTestDatabase, type TestDatabase } from './support/test-database';

/**
 * `POST /api/v1/tenants` ucundan uca.
 *
 * Uygulamanin TAMAMI ayaga kalkar: TenantModule app.module.ts'e bagli,
 * tum saglayicilar cozuluyor. Bu testin ilk degeri, wiring'in gercekten
 * calistigini kanitlamasidir — bir DI hatasi ancak uygulama acilirken ortaya
 * cikar ve birim testleri onu goremez.
 *
 * Ikinci degeri: bugun bu uc noktanin NE YAPTIGINI sabitlemesi. Her istek
 * 503 doner ve bu BILINCLIDIR (Identity modulu Faz 3). Biri "gecici olarak
 * acalim" derse bu testler kirmizi yanar.
 */
/**
 * `app.getHttpServer()` `any` doner; tip zorlamasi (`as`) bu projede yasak
 * (DEVELOPMENT_RULES 2.3). `instanceof` ile daraltmak hem tipi kazandirir hem
 * de beklenmeyen bir sunucu turunu SESSIZCE gecirmez.
 */
type NodeHttpServer = Server;

/** Tip yukleminin kendisi daraltmayi yapar; `as` gerekmez. */
function isHttpServer(value: unknown): value is NodeHttpServer {
  return value instanceof Server;
}

function httpServer(app: INestApplication): NodeHttpServer {
  const server: unknown = app.getHttpServer();

  if (!isHttpServer(server)) {
    throw new TypeError('Beklenen node:http Server ornegi alinamadi.');
  }

  return server;
}

describe('POST /api/v1/tenants (uctan uca)', () => {
  let database: TestDatabase;
  let app: INestApplication;

  beforeAll(async () => {
    // Uygulama gercek bir veritabani bekliyor; DatabaseModule acilista havuz
    // kurar. Container'in baglanti dizesi env uzerinden verilir.
    database = await startTestDatabase();
    process.env.DATABASE_URL = database.container.getConnectionUri();

    // Env semasi Identity sirlarini ZORUNLU kilar; eksikse uygulama hic acilmaz.
    await setIdentityTestEnv();

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication();

    // main.ts ile AYNI kurulum. Eksik birakilsaydi test, uretimde calisan
    // uygulamadan farkli bir uygulamayi dogrulardi — ornegin traceId'siz.
    app.use(correlationIdMiddleware);
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalFilters(new ProblemDetailsFilter());

    await app.init();
  }, 180_000);

  afterAll(async () => {
    await app.close();
    await database.stop();
  });

  it('uygulama TenantModule ile ayaga kalkar', () => {
    // DI grafigi cozuldu: repository'ler, transaction manager, outbox
    // publisher, gecici politika ve controller birbirine baglandi.
    expect(app).toBeDefined();
  });

  it('gecerli govdeye 503 doner — provisioning henuz devrede degil', async () => {
    const response = await request(httpServer(app))
      .post('/api/v1/tenants')
      .send({ name: 'Acme Ltd.', slug: 'acme' });

    expect(response.status).toBe(503);
  });

  it('503 yaniti RFC 7807 bicimindedir', async () => {
    const response = await request(httpServer(app))
      .post('/api/v1/tenants')
      .send({ name: 'Acme Ltd.', slug: 'acme' });

    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body).toMatchObject({
      status: 503,
      instance: '/api/v1/tenants',
    });
  });

  it('503 yaniti reddin GEREKCESINI tasir', async () => {
    // Global filtre normalde tum 5xx govdelerini maskeler. Bu yanit acikca
    // "disclosable" isaretlidir: istemci ozelligin kapali oldugunu ogrenmeli,
    // yoksa genel bir sunucu hatasi sanip tekrar dener.
    const response = await request(httpServer(app))
      .post('/api/v1/tenants')
      .send({ name: 'Acme Ltd.', slug: 'acme' });

    expect(response.body.detail).toMatch(/Identity/i);
    expect(response.body.detail).not.toBe('Beklenmeyen bir hata olustu.');
  });

  it('503 yaniti ic detay SIZDIRMAZ', async () => {
    const response = await request(httpServer(app))
      .post('/api/v1/tenants')
      .send({ name: 'Acme Ltd.', slug: 'acme' });

    const body = JSON.stringify(response.body);
    expect(body).not.toMatch(/postgres|password|select |insert |at Object|\.ts:/i);
  });

  it('hicbir tenant OLUSTURMAZ', async () => {
    await request(httpServer(app))
      .post('/api/v1/tenants')
      .send({ name: 'Acme Ltd.', slug: 'acme' });

    const tenants = await database.ownerPool.query('SELECT id FROM platform.tenants');
    const outbox = await database.ownerPool.query('SELECT id FROM platform.outbox');

    expect(tenants.rowCount).toBe(0);
    expect(outbox.rowCount).toBe(0);
  });

  // --- Dogrulama (kimlik kontrolunden ONCE calisir) -----------------------

  it('gecersiz govdeye 422 doner', async () => {
    const response = await request(httpServer(app))
      .post('/api/v1/tenants')
      .send({ name: '', slug: 'a' });

    expect(response.status).toBe(422);
    expect(response.body.errors).toBeDefined();
  });

  it('ownerUserId gonderilirse 422 doner', async () => {
    // Sahip govdeden ALINMAZ. Sema strict oldugu icin alan sessizce yok
    // sayilmaz — istemci gonderdiginin islenmedigini ogrenir.
    const response = await request(httpServer(app))
      .post('/api/v1/tenants')
      .send({
        name: 'Acme Ltd.',
        slug: 'acme',
        ownerUserId: '018f3a2b-7c4d-7e1f-8a2b-3c4d5e6f7a8b',
      });

    expect(response.status).toBe(422);
  });

  it('bos govdeye 422 doner', async () => {
    const response = await request(httpServer(app)).post('/api/v1/tenants').send({});

    expect(response.status).toBe(422);
  });

  it('yanitlar korelasyon kimligi tasir', async () => {
    const response = await request(httpServer(app))
      .post('/api/v1/tenants')
      .send({ name: '', slug: '' });

    expect(response.body.traceId).toBeDefined();
  });
});
