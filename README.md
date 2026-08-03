# Business OS

Cok kiracili (multi-tenant) SaaS **Business Operating System**.

> **Business OS, icinde AI olan bir yazilim degildir.** Sirketler icin bir **AI
> isletim sistemidir**: her modulun var olus sebebi, akilli ajanlara baglam ve
> hafiza saglamaktir.

Moduller urunun kendisi degil, AI'in hafizasidir — CRM musteri hafizasi,
Finance finansal hafiza, HR organizasyon hafizasi, Knowledge Base kurumsal
hafizadir. AI sonradan eklenen bir ozellik degil, platformun merkezidir;
moduller onun etrafinda ve ona hizmet etmek icin vardir.

Pratik farki soyle dusunun: bir CEO "son 6 ayimizi analiz et" dediginde sistem
bunu bir sohbet sorusu olarak degil, CRM + Finans + Projeler + yazismalar
uzerinden gercek bir analiz ve gerekcelendirilmis bir karar onerisi olarak
yanitlar. Hedef bir chatbot degil, bir **dijital yonetici asistanidir**.

Urun AI merkezlidir ama **hicbir LLM saglayicisina bagimli degildir**: erisim
daima `LLMPort` arkasindadir (ADR-0007, ARCHITECTURE 8).

> **Durum:** Faz 1 (altyapi), Faz 2 (multi-tenancy cekirdegi) tamamlandi;
> **Faz 3 (kimlik dogrulama + yetkilendirme) uctan uca calisiyor.**
>
> Kayit -> e-posta dogrulama (6 haneli kod, Resend ile teslim) -> giris ->
> tenant secme (switch-tenant) -> tenant-scoped erisim -> RBAC zinciri kapali
> ve test edilmis durumda. Refresh token rotation, yeniden kullanim tespiti ve
> sunucu tarafi cikis da devrede.
>
> `POST /api/v1/tenants` artik **calisir**: kimliksiz istege `401`, e-postasi
> dogrulanmamis kullaniciya `403`, dogrulanmis kullaniciya `202` (provisioning
> baslar) doner. Faz 2'deki "her istege 503" gecici kapilari Identity ile
> **gercek implementasyonlariyla degistirildi**.
>
> Is modulleri (CRM, Finance, HR...) ve AI katmani Faz 5+.

Yonetisim dokumanlari baglayicidir:
[CLAUDE.md](./CLAUDE.md) · [ARCHITECTURE.md](./ARCHITECTURE.md) · [DEVELOPMENT_RULES.md](./DEVELOPMENT_RULES.md)

---

## Gereksinimler

| Arac           | Surum           |
| -------------- | --------------- |
| Node.js        | 24.x            |
| pnpm           | 10+             |
| Docker Desktop | calisir durumda |

## Kurulum

```bash
pnpm install

cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

pnpm docker:up      # PostgreSQL + Redis
pnpm db:migrate     # migration'lari uygula
pnpm dev            # api :3001 · web :3000
```

Dogrulama:

```bash
curl http://localhost:3001/api/v1/health
```

## Komutlar

| Komut                   | Aciklama                                           |
| ----------------------- | -------------------------------------------------- |
| `pnpm dev`              | Tum uygulamalari gelistirme modunda baslatir       |
| `pnpm build`            | Tum paketleri derler                               |
| `pnpm lint`             | ESLint — mimari kurallar dahil                     |
| `pnpm typecheck`        | TypeScript tip kontrolu                            |
| `pnpm test`             | Birim testleri (Docker gerektirmez)                |
| `pnpm test:integration` | Entegrasyon testleri (Testcontainers, Docker sart) |
| `pnpm format`           | Prettier ile bicimlendirir                         |
| `pnpm db:generate`      | Drizzle migration taslagi uretir                   |
| `pnpm db:migrate`       | Migration'lari uygular                             |
| `pnpm db:rollback`      | Son migration'i geri alir (tek adim)               |
| `pnpm docker:up/down`   | Altyapi container'lari                             |

## Uc noktalar

| Yol                                     | Aciklama                                                                   |
| --------------------------------------- | -------------------------------------------------------------------------- |
| `GET /api/v1/health`                    | Saglik durumu (200 / 503)                                                  |
| **Kimlik**                              |                                                                            |
| `POST /api/v1/auth/register`            | Yeni kullanici kaydeder (202). Yanit hesap varligindan bagimsizdir (P2)    |
| `POST /api/v1/auth/verify-email`        | 6 haneli kodla e-postayi dogrular (200 / 400)                              |
| `POST /api/v1/auth/resend-verification` | Dogrulama kodunu yeniden gonderir (202; hesap sinirlari sessiz)            |
| `POST /api/v1/auth/login`               | Giris — kimlik token'i + refresh token doner (tenant claim'i YOK)          |
| `POST /api/v1/auth/refresh`             | Refresh token rotation; yeniden kullanim tum aileyi iptal eder             |
| `POST /api/v1/auth/logout`              | Sunulan token'in ailesini iptal eder (daima 204)                           |
| `POST /api/v1/auth/logout-all`          | Kullanicinin tum oturumlarini sonlandirir (204 / 401)                      |
| **Tenant**                              |                                                                            |
| `POST /api/v1/auth/switch-tenant`       | Tenant secer, tenant-scoped access token uretir (200 / 403)                |
| `POST /api/v1/tenants`                  | Yeni tenant acar. Kimliksiz `401`, e-posta dogrulanmamis `403`, aksi `202` |
| `GET /api/v1/memberships`               | Tenant uye listesi — **RBAC**: `member:read` (owner/admin), aksi `403`     |
| **Dokumantasyon**                       |                                                                            |
| `/api/docs` · `/api/docs/json`          | Swagger UI · OpenAPI spec                                                  |

## Yapi

```
apps/
  api/      NestJS — modular monolith
  web/      Next.js App Router
packages/
  contracts/  API sozlesmeleri (Zod) — api ile web arasindaki tek tip kaynagi
  config/     paylasilan tsconfig / eslint / prettier
  ui/         paylasilan React bilesenleri (Faz 2+)
docker/     PostgreSQL init script'leri
docs/adr/   Architecture Decision Records
```

## Veritabani rolleri

Uc rol vardir ve bu ayrim **pazarlik konusu degildir** (ARCHITECTURE 3.3):

| Rol                | Yetki                            | Kullanim                    |
| ------------------ | -------------------------------- | --------------------------- |
| `postgres`         | superuser                        | yalnizca container kurulumu |
| `businessos_owner` | DDL, NOBYPASSRLS                 | yalnizca migration          |
| `businessos_app`   | yalnizca DML, tablo sahibi degil | uygulama runtime            |

Uygulama tablo sahibi rolu ile baglanirsa, `FORCE ROW LEVEL SECURITY` edilmis
tablolarda bile politikalar bypass edilir ve RLS'in tamami sessizce devre disi kalir.

## Migration konvansiyonu

DEVELOPMENT_RULES §6: her migration **geri alinabilir** olmalidir. drizzle-kit
geri alma desteklemedigi icin konvansiyon sudur — her ileri migration'in yaninda
ayni adi tasiyan bir geri alma dosyasi bulunur:

```
drizzle/
├── 0000_init.sql          ileri  — pnpm db:migrate
└── 0000_init.down.sql     geri   — pnpm db:rollback
```

- `pnpm db:rollback` **tek adim** geri alir; down SQL ile migration kaydinin
  silinmesi ayni transaction icindedir, yarim kalmis durum olusamaz.
- Down dosyasi eksikse rollback **calismaz** ve hata verir.
- Schema silme islemlerinde `RESTRICT` kullanilir, `CASCADE` degil: icinde tablo
  kalmissa komut hata verir. Geri alma asla sessizce veri silmez.
- Production'da `--yes` bayragi zorunludur.

## Mimari kurallarin dogrulanmasi

Katman ve modul sinirlari ESLint tarafindan zorlanir. Kurallarin gercekten
calistigini gormek icin gecici bir ihlal dosyasi olusturup lint calistirin:

```bash
# domain katmaninda framework import'u
mkdir -p apps/api/src/platform/health/domain
echo "import { Injectable } from '@nestjs/common'; export const x = Injectable;" \
  > apps/api/src/platform/health/domain/probe.ts

pnpm --filter @business-os/api lint   # KIRMIZI vermeli

rm -rf apps/api/src/platform/health/domain
```

Zorlanan kurallar: domain katmani framework/altyapi import edemez · application
katmani infrastructure/presentation import edemez · `process.env` yalnizca
`infrastructure/config` altinda okunur · moduller arasi internal import yasak.
