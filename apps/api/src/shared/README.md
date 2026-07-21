# shared/ — Kernel

Modüller arası paylaşılan, **framework'süz** sözleşmeler.

`CLAUDE.md`: burada `domain/`, `application/`, `infrastructure/` veya
`presentation/` adında **alt klasör açılmaz** — bu adlar modül katmanlarına
ayrılmıştır ve sınır kurallarını belirsizleştirir.

Buraya bir şey eklemenin tek gerekçesi vardır: **birden fazla modülün aynı
sözleşmeye ihtiyaç duyması.** Tek modülün kullandığı bir tip o modülde yaşar.

---

## Karar: Hata yönetimi — exception, `Result<T, E>` değil

**Durum:** Kabul edildi · **Tarih:** 2026-07-21 · **Karar veren:** Product Owner

Bu proje hataları **exception fırlatarak** bildirir. `Result<T, E>` /
`Either` tipi **kullanılmaz** ve kernel'e eklenmez.

**Sonuçları**

- Domain invariant ihlalleri `TenantDomainError` gibi domain hata sınıfları
  fırlatır.
- Repository port'ları "bulunamadı" durumunu `null` ile bildirir — bu bir hata
  değil, geçerli bir sonuçtur. Exception yalnızca *beklenmeyen* durumlar
  içindir.
- HTTP'ye çeviri tek noktada, global exception filter'da yapılır (RFC 7807).
- Hata sınıfları `code` alanı taşır; çeviri mesaj metnine değil koda bakar.

**Dürüst bedeli**

- Bir fonksiyonun hangi hataları fırlatabildiği **imzasında görünmez**.
  TypeScript'te `throws` tipi yoktur; bu bilgi yalnızca dokümantasyonda ve
  testlerde yaşar.
- Hata yolunu ele almayı unutmak derleyici tarafından yakalanmaz. `Result`
  bunu yakalardı.

Bu bedel bilinçli kabul edildi: `Result` her çağrı zincirinde açma/sarma
gürültüsü üretir ve NestJS'in exception filter'ı, Zod'un `throw` davranışı ve
Drizzle'ın hata modeli zaten exception tabanlıdır. İkisini karıştırmak, her
sınırda çeviri katmanı yazmak demektir.

> **Bu karar yeniden açılmaz.** Yeni bir modül yazarken "burada `Result`
> kullansak mı?" sorusu tekrar sorulmasın diye buraya yazıldı.
