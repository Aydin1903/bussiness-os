# DEVELOPMENT_RULES.md

Business OS — Geliştirme Kuralları

> Bu kurallar **bağlayıcıdır**. İhlal eden kod merge edilmez.
> "Şimdilik böyle kalsın, sonra düzeltiriz" bu projede geçerli bir gerekçe değildir.

---

## 1. Çalışma Akışı

### 1.1 Prompt disiplini

| Kural | Anlamı |
|---|---|
| Tek prompt = tek modül | Başka modüle dokunulmaz |
| İstenmedikçe refactor yok | Yolda görülen kötü kod **rapor edilir**, düzeltilmez |
| İstenmedikçe mevcut kod değişmez | Kapsam dışı dosya açılmaz |
| Önce plan, sonra kod | Onay alınmadan yazılmaz |
| Bitince rapor | Değişiklik raporu zorunlu |

**Neden bu kadar katı:** Kapsam kayması (scope creep) code review'i imkânsızlaştırır, sorunun kaynağını gizler ve tek bir hatanın etkisini tüm sisteme yayar.

### 1.2 Kapsam dışı sorun görülürse

Düzeltme. **Raporla.** Örnek:

> ⚠️ Kapsam dışı: `identity/token.service.ts:42` içinde refresh token rotation eksik.
> Bu prompt'un kapsamında olmadığı için dokunmadım. Ayrı görev olarak ele alınmalı.

### 1.3 Değişiklik raporu formatı

```markdown
## Değişiklik Raporu — <Modül Adı>

### Ne yapıldı
- ...

### Oluşturulan dosyalar
- `path/to/file.ts` — sorumluluk

### Değiştirilen dosyalar
- `path/to/file.ts` — ne, neden

### Mimari kararlar
- Karar ve gerekçesi

### Testler
- Ne test edildi, ne test edilmedi

### Bilinen eksikler / teknik borç
- ...

### Kapsam dışı tespitler
- ...

### Sıradaki adım önerisi
- ...
```

---

## 2. Kod Standartları

### 2.1 İsimlendirme

| Öğe | Kural | Örnek |
|---|---|---|
| Dosya | kebab-case | `create-invoice.use-case.ts` |
| Class / Interface | PascalCase | `InvoiceRepository` |
| Değişken / fonksiyon | camelCase | `issueInvoice` |
| Sabit | UPPER_SNAKE | `MAX_RETRY_COUNT` |
| DB tablo / kolon | snake_case | `invoice_lines`, `tenant_id` |
| Domain event | PascalCase, **geçmiş zaman** | `InvoiceIssued` |
| Boolean | `is` / `has` / `can` öneki | `isActive`, `canApprove` |

Interface'lerde `I` öneki **kullanılmaz**. `IUserRepository` değil, `UserRepository`.

### 2.2 Dosya son ekleri

```
*.entity.ts  *.value-object.ts  *.event.ts       → domain
*.use-case.ts  *.port.ts  *.dto.ts              → application
*.repository.ts  *.adapter.ts  *.schema.ts      → infrastructure
*.controller.ts                                  → presentation
*.spec.ts  *.e2e-spec.ts                        → test
```

### 2.3 TypeScript

**Yasak:**
- `any` — gerekiyorsa `unknown` + daraltma
- `as` ile tip zorlama — doğrulama yerine kullanılamaz
- `@ts-ignore` — `@ts-expect-error` + gerekçe yorumu kullanılır
- Non-null assertion `!` — açık kontrol yazılır
- Barrel `index.ts` re-export zincirleri — döngüsel bağımlılık üretir

**Zorunlu:**
- `strict: true` (+ `noUncheckedIndexedAccess`)
- Public API'lerde açık dönüş tipi
- Dış veri **her zaman** Zod ile doğrulanır

### 2.4 Primitive obsession yasağı

```typescript
// ❌ Yanlış — iki string yer değiştirse compiler susar
function transfer(from: string, to: string, amount: number): void

// ✅ Doğru — yanlış kullanım derlenmez
function transfer(from: AccountId, to: AccountId, amount: Money): void
```

Kimlikler, para, e-posta, tarih aralığı → **her zaman** value object.

### 2.5 Fonksiyon ve dosya sınırları

| Ölçüt | Sınır |
|---|---|
| Fonksiyon uzunluğu | ~30 satır |
| Fonksiyon parametresi | 3 — fazlası obje |
| Dosya uzunluğu | ~300 satır |
| İç içe blok | 3 seviye — fazlası early return |
| Cyclomatic complexity | 10 |

Sınırlar mutlak değil, **kokudur**. Aşılıyorsa dosya muhtemelen birden fazla iş yapıyordur.

### 2.6 Yorumlar

Kod **ne** yaptığını anlatır, yorum **neden** yaptığını.

```typescript
// ❌ tenant id'yi set et
// ✅ SET LOCAL kullanılıyor: transaction bitince otomatik temizlenir,
//    böylece pool'a dönen bağlantıda tenant id kalmaz (sızıntı önlemi).
```

Kapatılmış kod repo'da bırakılmaz. Git zaten hatırlıyor.

---

## 3. Mimari Kurallar

### 3.1 Bağımlılık yönü

```
presentation → application → domain
infrastructure → application (port'u implemente eder)
```

**Asla:** `domain → infrastructure` · `domain → framework` · modüller arası internal import

### 3.2 Domain katmanı — mutlak yasaklar

- Framework import'u yok (NestJS, Drizzle, Express dahil)
- I/O yok (DB, HTTP, dosya, log)
- `Date.now()` / `Math.random()` doğrudan çağrılmaz → port ile enjekte edilir (test edilebilirlik)
- Geçersiz nesne yaratılamaz — invariant constructor/factory'de korunur

### 3.3 Modül sınırları

```typescript
// ❌ Yasak
import { InvoiceEntity } from '../../billing/domain/invoice.entity';

// ✅ Public interface
import { BillingPublicApi } from '@modules/billing/billing.public';

// ✅ Domain event
@OnEvent('billing.invoice.issued')
```

Cross-schema foreign key **yasaktır**. Referans id ile tutulur; tutarlılık event ile sağlanır.

### 3.4 Bağımlılık ekleme

Yeni npm paketi eklemek **onay gerektirir**. Öneri şunu içerir: neden gerekli, bakım durumu, bundle etkisi, alternatifler, kendimiz yazsak maliyeti.

---

## 4. Multi-Tenancy Kuralları

Bu bölüm pazarlığa kapalıdır.

1. Tenant verisi tutan her tabloda `tenant_id` kolonu bulunur.
2. Her tabloda RLS `ENABLE` **ve** `FORCE` edilir.
3. Tenant context `SET LOCAL` ile, transaction içinde set edilir. `SET` (LOCAL'sız) yasaktır.
4. Tenant scope'suz sorgu yazılamaz. İstisna gerekiyorsa açıkça `@CrossTenant()` ile işaretlenir, gerekçe yorumu yazılır ve ayrıca review edilir.
5. `tenant_id` **asla** istemciden gelen değerden alınmaz. Tek kaynak: doğrulanmış JWT claim'i.
6. Her tenant-scoped tablo için çapraz erişim testi yazılır — A, B'nin verisini okuyamaz **ve** yazamaz.

**5. maddenin sebebi:** İstemciden gelen `X-Tenant-Id`'ye güvenmek, tek satırlık bir değişiklikle tüm veritabanını açar. Bu, multi-tenant SaaS'ta en sık görülen kritik açıktır.

---

## 5. Test Kuralları

### 5.1 Test piramidi

```
      /\      E2E — kritik kullanıcı akışları
     /──\     Integration — repository, RLS, modül sınırı
    /────\    Unit — domain logic, use case
```

### 5.2 Kapsam beklentisi

| Katman | Beklenti |
|---|---|
| Domain | ~%90 — burada hata en pahalıya patlar |
| Application (use case) | ~%80 |
| Infrastructure | Kritik yollar |
| **Tenant izolasyonu** | **%100 — istisnasız** |

Kapsam yüzdesi hedef değil, göstergedir. Anlamsız test yazarak yüzde şişirmek yasaktır.

### 5.3 Kurallar

- Domain testleri **mock'suz** yazılır. Mock gerekiyorsa domain kirlenmiştir.
- Integration testleri **gerçek PostgreSQL**'e karşı çalışır (Testcontainers). Mock DB, RLS'i test etmez — ki test etmek istediğimiz tam olarak odur.
- Test isimleri davranışı anlatır: `tenant B'nin faturasını okumayı reddeder`
- Her bug fix, önce **başarısız olan** bir test ile başlar.

### 5.4 Doğrulama — çıkış kodu, çıktı değil

Tek komut: **`pnpm verify`** (format · lint · typecheck · build · unit test).
Kök `package.json`'da **tek yerde** tanımlıdır ve CI aynısını çalıştırır.
Entegrasyon testleri Docker gerektirdiği için ayrıdır: `pnpm test:integration`.

Bir komutun başarılı olup olmadığına **çıkış koduna bakılarak** karar verilir.
Çıktısını `grep`'leyerek "hata var mı" aramak yasaktır — bu, doğrulamayı sessizce
yanlış yeşile çevirir. İki gerçek vaka:

| Ne yapıldı | Neden yanlış yeşil verdi |
|---|---|
| `pnpm typecheck \| grep "error TS"` | ANSI renk kodları `error` ile `TS2345` arasına girer; desen **hiçbir zaman** eşleşmez. Dört gerçek tip hatası iki slice boyunca görülmedi |
| "`build` geçtiyse tipler tamam" | `tsconfig.build.json` **test dosyalarını kapsamaz**; `build` yeşilken `typecheck` kırmızıydı |

Sonuç yalnızca `pnpm verify`'ın çıkış koduyla raporlanır. Çıktıyı filtrelemek
okumak için serbesttir; **karar vermek için değil**.

---

## 6. Database Kuralları

| Kural | Detay |
|---|---|
| Migration | Elle yazılır, review edilir, geri alınabilir olur |
| Otomatik sync | Her ortamda **yasak** |
| Primary key | UUID v7 (zaman-sıralı, index dostu) |
| Zaman | `timestamptz` — `timestamp` yasak |
| Para | `numeric` — `float` **kesinlikle** yasak |
| Silme | Soft delete (`deleted_at`) varsayılan |
| Zorunlu kolonlar | `id`, `tenant_id`, `created_at`, `updated_at` |
| Index | Her foreign key ve her sorgulanan kolon indexlenir |
| N+1 | Yasak — açık join veya dataloader |

**Neden `float` yasak:** İkili kayan nokta ondalık parayı temsil edemez. `0.1 + 0.2 !== 0.3`. Finansal veride bu, müşteri kaybettiren bir hatadır.

---

## 7. API Kuralları

### 7.1 Standartlar

- Versiyon URI'da: `/api/v1/...`
- Kaynak isimleri **çoğul**: `/api/v1/invoices`
- Fiil yok: `/api/v1/invoices/{id}/issue` ✅ · `/api/v1/issueInvoice` ❌
- Liste endpoint'leri **her zaman** sayfalanır — sınırsız liste yasak
- HTTP metodları anlamına uygun; `GET` asla yan etki üretmez

### 7.2 Hata formatı — RFC 7807

```json
{
  "type": "https://api.businessos.com/errors/validation-failed",
  "title": "Validation failed",
  "status": 422,
  "detail": "Invoice must contain at least one line item.",
  "instance": "/api/v1/invoices",
  "traceId": "01J8X..."
}
```

Hata mesajları **asla** iç detay sızdırmaz: stack trace yok, SQL yok, dosya yolu yok.

### 7.3 Breaking change

Breaking change **onay gerektirir**. Yeni versiyon açılır, eskisi deprecation süresi boyunca yaşar.

---

## 8. Güvenlik Kuralları

- Secret asla repo'da — `.env` gitignore'da, `.env.example` commit'lenir
- Şifre: Argon2id
- Her dış girdi sınırda doğrulanır
- SQL her zaman parametreli — string birleştirme **yasak**
- Log'lara PII, token, şifre, prompt içeriği yazılmaz (maskelenir)
- Yetki kontrolü merkezi policy engine'de — controller'da dağınık `if` yasak
- Varsayılan **deny**. Erişim açıkça verilir.
- Bağımlılıklar CI'da taranır

---

## 9. Git Kuralları

### 9.1 Branch

```
main               korumalı, her zaman deploy edilebilir
develop            entegrasyon
feature/<modül>-<kısa-açıklama>
fix/<kısa-açıklama>
```

`main`'e doğrudan push **yasak**.

### 9.2 Commit — Conventional Commits

```
feat(identity): add refresh token rotation
fix(tenant): prevent cross-tenant read in invoice repository
docs(architecture): record ADR-0003 drizzle decision
test(billing): add tenant isolation integration test
```

Tipler: `feat` `fix` `refactor` `test` `docs` `chore` `perf` `build` `ci`

Kurallar: atomik commit · commit'ler yeşil bırakır · scope = modül adı · mesaj **neden**'i anlatır

### 9.3 Pull Request

Merge için: CI yeşil · en az 1 onay · testler mevcut · dokümantasyon güncel · kapsam tek konu

**PR checklist:**
- [ ] Tek modül kapsamı korundu
- [ ] Domain katmanı framework'süz
- [ ] Modüller arası internal import yok
- [ ] Tenant izolasyon testi eklendi
- [ ] Migration geri alınabilir
- [ ] Secret/PII sızıntısı yok
- [ ] Değişiklik raporu yazıldı

---

## 10. Definition of Done

Bir iş şu maddelerin **tamamı** sağlandığında biter:

- [ ] Kod yazıldı ve mimari kurallara uyuyor
- [ ] Unit + integration testleri yazıldı, geçiyor
- [ ] Tenant izolasyon testi yazıldı (uygulanabilirse)
- [ ] Lint ve type-check temiz
- [ ] Migration yazıldı ve geri alınabilir
- [ ] API dokümantasyonu güncel
- [ ] Mimari karar alındıysa ADR yazıldı
- [ ] Değişiklik raporu üretildi
- [ ] Kapsam dışına çıkılmadı

---

## 11. Bu Kurallar Çakışırsa

Öncelik sırası:

```
1. Güvenlik / tenant izolasyonu
2. Doğruluk
3. Bakılabilirlik
4. Performans
5. Geliştirme hızı
```

Bir kural işi imkânsız kılıyorsa: kuralı sessizce esnetme. **Sor.** Kural yanlışsa kural değişir — kod değil.
