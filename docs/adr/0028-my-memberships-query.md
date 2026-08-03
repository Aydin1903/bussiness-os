# 0028 — "Hangi tenant'lara uyeyim": SECURITY DEFINER + dar BYPASSRLS rolu

- **Durum:** Kabul edildi
- **Tarih:** 2026-07-28
- **Karar veren:** Product Owner
- **Faz:** 3

## Baglam

ADR-0020'nin iki asamali token modelinde kullanici giristen sonra bir tenant
SECMELIDIR: kimlik token'i yalnizca "uyelik listesi ve tenant secimi" yapabilir.
Ama o listeyi — "hangi tenant'lara uyeyim" — donduren bir uc nokta hic yazilmamisti
(`tenant.public.ts` bunu bilincle ertelemisti). Frontend tenant-secim ekrani (F2.2)
bu yuzden BLOKLUYDU.

Sorun teknik: `platform.memberships` **FORCE ROW LEVEL SECURITY** tasir (MT §12.2).
Bir kullanicinin TUM tenant'lardaki uyeliklerini okumak, tenant context'i OLMADAN
(secim henuz yapilmadi) tum tenant'lari gezmeyi gerektirir — ki RLS bunu engeller.
`resolve_tenant` (ADR-0015) benzeri bir SECURITY DEFINER fonksiyonu ilk akla gelen
cozumdu; ama o yalnizca `tenants` FORCE OLMADIGI icin calisir. `memberships` FORCE
oldugundan, tablo sahibi (`businessos_owner`) bile politikaya takilir — ve
`businessos_owner` bilincle `NOBYPASSRLS`'tir (01-roles.sql, ARCHITECTURE 3.3).

## Karar

### 1. `GET /api/v1/me/memberships` (platform/session)

Kimlik token'i ile cagrilir; `userId` dogrulanmis token'dan gelir (govde/query
KABUL ETMEZ) — kullanici yalnizca KENDI uyeliklerini gorur. Sayfalidir
(DEVELOPMENT_RULES 7.1). switch-tenant gibi `platform/session`'da yasar ve Tenant'i
YALNIZCA public port'undan (`USER_MEMBERSHIPS_QUERY`) tuketir.

### 2. Yalnizca SWITCHABLE tenant'lar

Liste **aktif uyelik + aktif tenant** ile sinirlidir. `provisioning`/`suspended`/
`archived` tenant ve `invited`/`suspended`/`revoked` uyelik ELENIR. Boylece
listedeki her tenant, switch-tenant'in gercekten erisim verecegi bir tenant'tir.

### 3. Kontrollu RLS asimi: `platform.list_user_memberships`

`SECURITY DEFINER`, `STABLE`, `search_path` sabit bir fonksiyon; yalnizca verilen
`p_user_id`'nin switchable uyeliklerini doner. Okuma bu fonksiyonda TOPLANIR.

### 4. Dar rol: `businessos_rls_reader`

Fonksiyonun sahibi, TEK amaci bu olan dar bir roldur:

| Ozellik     | Deger                                                                                        |
| ----------- | -------------------------------------------------------------------------------------------- |
| `LOGIN`     | **NOLOGIN** — dogrudan baglanamaz; yalnizca fonksiyon icinde "canlanir"                      |
| `BYPASSRLS` | **VAR** — tek yetenegi; FORCE-RLS memberships'i asmak icin                                   |
| SELECT      | **YALNIZCA** `platform.memberships` ve `platform.tenants`                                    |
| Sahiplik    | **YALNIZCA** `list_user_memberships` fonksiyonu                                              |
| Diger       | INSERT/UPDATE/DELETE **yok**, baska tabloya erisim **yok**, baska fonksiyona EXECUTE **yok** |

`CREATE ON SCHEMA` yalnizca migration icinde sahiplik atamak icin GECICI verilir
ve hemen `REVOKE` edilir — standing bir sema-yazma yetkisi kalmaz.

Rol `01-roles.sql`'de (superuser; `businessos_owner` NOCREATEROLE) olusturulur.
`businessos_owner`, sahipligi atayabilmek icin bu rolun uyesidir. Migration 0008
role bagli adimlari `IF EXISTS` ile sarar (0000/0001 konvansiyonu): rol yoksa
(rol-bagimsiz `database.integration` testi) fonksiyon migration'i calistirana ait
olur.

## Gerekce

**Neden ayri, dar bir rol (businessos_owner'a BYPASSRLS vermek yerine).** Migration'lari
calistiran rol BYPASSRLS olsaydi, TUM DDL akisi RLS'i sessizce bypass ederdi ve
"uygulama tablo sahibi degildir" izolasyon garantisi (ARCHITECTURE 3.3, MT §12.6
madde 5) asindirdi. Asim, tek bir fonksiyon imzasinda ve NOLOGIN, salt-okuma,
iki-tablo-scope'lu tek bir rolde TOPLANIR — resolve_tenant felsefesinin memberships
FORCE'una uyarlanmis hali.

**Neden SELECT yalnizca memberships + tenants.** SECURITY DEFINER fonksiyonu
sahibinin (bu rolun) yetkileriyle calisir; iki tabloyu okumasi icin bu iki SELECT
ZORUNLUDUR. Constraint 1'in ("baska hicbir GRANT") gerekli netlestirilmesi budur:
minimum set = iki tablo SELECT + sema USAGE. Baska hicbir sey yok.

**Neden userId token'dan.** Fonksiyon `WHERE m.user_id = p_user_id` ile daralir;
`p_user_id` istemciden alinsaydi bir kullanici baskasinin uyeliklerini
listeleyebilirdi. Controller onu YALNIZCA dogrulanmis principal'dan verir.

**Neden yalnizca switchable.** Liste tenant SECIMI icindir; secilemeyecek
(provisioning/suspended) bir tenant'i gostermek yaniltir. Filtre, switch-tenant'in
erisim kriteriyle (MT §7.4) birebir tutarlidir.

## Sonuclari

**Olumlu**

- F2.2 tenant-secim akisi acilir; cok-tenant kullanici desteklenir.
- RLS asimi tek, denetlenebilir bir yuzeyde toplanir; kapsami test edilebilir.
- Dar rolun sinirlari (baska hicbir seye erisemez) bir entegrasyon testiyle
  (Constraint 2) KANITLANIR — kopyanin/sapmanin kirmizi yanacagi bir cit.

**Olumsuz / bedeli**

- Sistemde ikinci bir BYPASSRLS yuzeyi (ilki: tenants'in FORCE olmamasi). Her
  BYPASSRLS bir izolasyon deligidir; bu yuzden dar tutuldu ve kayda gecti.
- Rol, bootstrap katmaninda (01-roles.sql + prod provisioning) olusturulmalidir;
  migration tek basina yeterli degil (businessos_owner NOCREATEROLE).
- Uyelik verisi cross-tenant okundugu icin, uyelik degisiklikleri aninda yansir —
  ama bu bir sorgudur, bir cache degil; bayat veri riski yok.

## Degerlendirilen alternatifler

| Alternatif                                                                  | Neden secilmedi                                                                                                                                                         |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app.current_user_id` GUC + memberships'e kullanici-scope'lu RLS politikasi | Mevcut `tenant_isolation`'in "unset'te hata ver" davranisiyla cakisir (sentinel gerekir); izolasyon modelinin yuzeyini genisletir. Transaction manager + policy degisir |
| `memberships`'ten FORCE'u kaldirmak (tenants gibi)                          | Test edilen bir izolasyon invariantini (MT §12.6 madde 5) zayiflatir; "tek istisna tenants" ilkesini bozar                                                              |
| `businessos_owner`'a BYPASSRLS vermek                                       | Tum DDL/migration akisi RLS'i bypass eder; asim tek fonksiyonda toplanmaz                                                                                               |
| Event-driven read-model (user_tenants projeksiyonu)                         | Cok daha buyuk insaat (projeksiyon tablosu + handler'lar + backfill); V1 icin gereksiz karmasiklik (ADR-0013)                                                           |

## Bu karar ne zaman yeniden gozden gecirilir?

- Es zamanli cok-tenant oturum (ADR-0020 N7) gelirse: liste + secim akisi degisir.
- Uyelik verisi baska cross-tenant okumalar gerektirirse: `list_user_memberships`
  genisletilmek yerine, genel bir "kullanici-scope'lu okuma" deseni (GUC + policy)
  yeniden degerlendirilebilir.
- `memberships` olcek sorunu uretirse: fonksiyona ek filtre/indeks eklenir.
