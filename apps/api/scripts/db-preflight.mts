import { lookup } from 'node:dns/promises';
import { existsSync } from 'node:fs';

import { Client } from 'pg';

/**
 * Migration'lardan ONCE veritabanina ulasilabildigini dogrular.
 *
 * ============================================================================
 * NEDEN VAR — "Exit status 1" hicbir sey soylemiyor
 * ============================================================================
 * Ilk Railway deploy'unda pre-deploy adimi soyle coktu:
 *
 *   [⊞] applying migrations...
 *   [ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL] ... db:migrate: `drizzle-kit migrate`
 *   Exit status 1
 *
 * `drizzle-kit` altta yatan `pg` hatasini spinner'in arkasinda yutuyor, pnpm de
 * ustune yalnizca cikis kodunu koyuyor. Ortada teshis edilecek bir sey KALMIYOR:
 * baglanti mi kurulamadi, parola mi yanlis, yoksa bir migration SQL'i mi
 * patladi — ayirt edilemiyor.
 *
 * Bu betik o ayrimi yapar ve migration'dan ONCE calisir. Gecici bir teshis
 * araci DEGILDIR: ortam degistikce (yeni bolge, yeni veritabani, ag ayari)
 * ayni belirsizlik geri gelir.
 * ============================================================================
 *
 * ============================================================================
 * PAROLA ASLA YAZDIRILMAZ
 * ============================================================================
 * Ciktinin tamami deploy loglarina gider ve o loglar paylasilir. Baglanti
 * dizesi bu yuzden hicbir kosulda oldugu gibi basilmaz; yalnizca host, port,
 * veritabani ve kullanici adi gosterilir.
 * ============================================================================
 *
 * Calistirma: pnpm --filter @business-os/api run db:preflight
 */

/** Cozulmemis Railway degisken referansi (`${{Postgres.PGHOST}}` gibi). */
const UNRESOLVED_REFERENCE = /\$\{\{.+?\}\}/;

async function main(): Promise<void> {
  loadEnv();

  const url = migrationUrl();
  const target = describeTarget(url);

  console.log(
    `[preflight] hedef: ${target.user}@${target.host}:${target.port}/${target.database}` +
      ` (ssl: ${target.ssl})`,
  );

  await assertReachable(url, target);

  console.log('[preflight] baglanti KURULDU — migration adimina geciliyor.');
}

/**
 * Baglantiyi dener ve basarisizsa hatayi TEHSIS EDILEBILIR hale getirir.
 *
 * `pg` hatalari iki farkli dunyadan gelir ve karistirilmalari teshisi
 * saptirir:
 *   * Isletim sistemi kodlari (`ENOTFOUND`, `ECONNREFUSED`, `ETIMEDOUT`) —
 *     sunucuya ULASILAMADI. Sorun ag/DNS tarafinda.
 *   * PostgreSQL SQLSTATE'leri (`28P01`, `3D000`, `28000`) — sunucuya ULASILDI,
 *     reddedildi. Sorun kimlik/yetki tarafinda.
 * Ilk grupta ayrica bir DNS cozumlemesi denenir; "ad cozulmuyor" ile "ad
 * cozuluyor ama port kapali" tamamen farkli iki duzeltme gerektirir.
 */
async function assertReachable(url: string, target: Target): Promise<void> {
  const client = new Client({ connectionString: url, connectionTimeoutMillis: 10_000 });

  try {
    await client.connect();
    await client.query('SELECT 1');
    await client.end();
    return;
  } catch (error) {
    await client.end().catch(() => undefined);

    console.error('[preflight] BAGLANTI KURULAMADI');
    console.error(
      `[preflight] hedef : ${target.user}@${target.host}:${target.port}/${target.database}`,
    );
    console.error(`[preflight] kod   : ${errorCode(error)}`);
    console.error(`[preflight] mesaj : ${errorMessage(error)}`);
    console.error(`[preflight] dns   : ${await describeDns(target.host)}`);
    console.error(`[preflight] yorum : ${interpret(errorCode(error))}`);

    process.exit(1);
  }
}

/**
 * Adres cozumlemesini AYRI raporlar.
 *
 * Railway'in ic agi (`*.railway.internal`) IPv6 tabanlidir ve cozulememesi
 * bilinen bir sorundur. `ENOTFOUND` gorup "veritabani kapali" diye dusunmek,
 * yanlis yerde saatler harcatir.
 */
async function describeDns(host: string): Promise<string> {
  try {
    const results = await lookup(host, { all: true });
    return results.map((entry) => `${entry.address} (IPv${String(entry.family)})`).join(', ');
  } catch (error) {
    return `COZULEMEDI — ${errorCode(error)}`;
  }
}

/** Hata kodunu okunabilir bir sonraki adima cevirir. */
function interpret(code: string): string {
  const guide: Record<string, string> = {
    ENOTFOUND:
      'Sunucu adi cozulemedi. Railway ic agi kullaniliyorsa servis adini ve ' +
      'ayni ortamda olduklarini dogrula; cozulmuyorsa public host + ?sslmode=require dene.',
    EAI_AGAIN: 'Gecici DNS hatasi. Ic ag henuz hazir olmayabilir; yeniden deneyin.',
    ECONNREFUSED:
      'Ad cozuldu ama port kapali. Port numarasini ve servisin ayakta oldugunu kontrol et.',
    ETIMEDOUT: 'Ad cozuldu ama yanit yok. Ag yolu engelli olabilir (public host gerekebilir).',
    '28P01': 'Sunucuya ULASILDI, parola reddedildi. Rol parolasi yanlis.',
    '28000': 'Sunucuya ULASILDI, kimlik dogrulama kurali reddetti (pg_hba / SSL zorunlulugu).',
    '3D000': 'Sunucuya ULASILDI ama veritabani adi yok. URL sonundaki veritabani adini kontrol et.',
  };

  return guide[code] ?? 'Bilinmeyen hata — yukaridaki kod ve mesaj ile arama yapin.';
}

interface Target {
  readonly host: string;
  readonly port: string;
  readonly database: string;
  readonly user: string;
  readonly ssl: string;
}

/**
 * Baglanti dizesini PAROLASIZ parcalarina ayirir.
 *
 * Ayristirilamiyorsa surec burada durur: bozuk bir URL ile devam etmek,
 * `drizzle-kit`'in ayni hatayi anlasilmaz bicimde tekrar vermesi demektir.
 */
function describeTarget(url: string): Target {
  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    fail(
      'DATABASE_MIGRATION_URL gecerli bir URL degil. ' +
        'Railway degisken referansi kullaniyorsan (`${{Servis.PGHOST}}`) cozulup cozulmedigini kontrol et.',
    );
  }

  return {
    host: parsed.hostname,
    port: parsed.port === '' ? '5432' : parsed.port,
    database: parsed.pathname.replace(/^\//, '') || '(bos)',
    user: parsed.username || '(bos)',
    ssl: parsed.searchParams.get('sslmode') ?? 'belirtilmemis',
  };
}

function migrationUrl(): string {
  const url = process.env.DATABASE_MIGRATION_URL;

  if (url === undefined || url.trim() === '') {
    fail(
      'DATABASE_MIGRATION_URL tanimli degil. businessos_owner rolunun baglanti dizesi gereklidir.',
    );
  }

  // Cozulmemis referans, "tanimli ama anlamsiz" bir degerdir ve `new URL()`
  // testini gecebilir. Ayri bir mesajla yakalanir cunku duzeltmesi tamamen
  // farklidir: parola degil, DEGISKEN ADI yanlistir.
  if (UNRESOLVED_REFERENCE.test(url)) {
    fail(
      'DATABASE_MIGRATION_URL cozulmemis bir degisken referansi iceriyor ' +
        '(`${{...}}`). Referans verilen servisin ADI ve ayni ortamda oldugu kontrol edilmeli.',
    );
  }

  return url;
}

function errorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return String(error.code);
  }
  return '(kod yok)';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function fail(message: string): never {
  console.error(`[preflight] ${message}`);
  process.exit(1);
}

/** `drizzle.config.ts` ile ayni davranis: .env varsa yuklenir, ortami EZMEZ. */
function loadEnv(): void {
  if (existsSync('.env')) {
    process.loadEnvFile('.env');
  }
}

main().catch((error: unknown) => {
  console.error(`[preflight] beklenmeyen hata: ${errorMessage(error)}`);
  process.exitCode = 1;
});
