# 0004 — Authentication: Kendi modulumuz

- **Durum:** Kabul edildi
- **Tarih:** 2026-07-20
- **Karar veren:** Product Owner
- **Faz:** 0

## Baglam

Kimlik dogrulama, tenant modeliyle ic ice gecmis durumda: her token bir tenant
claim'i tasiyor ve bu claim sistemdeki tek yetki kaynagi (ARCHITECTURE 3.2).

## Karar

Kimlik dogrulama kendi Identity modulumuzde yazilir. JWT access token + refresh
token rotation kullanilir. Parolalar Argon2id ile saklanir.

## Gerekce

Tenant modeli urune ozgudur; hazir bir saglayicinin tenant kavramina uydurulmasi,
saglayicinin modeline uymak zorunda kalmak demektir. Ayrica kimlik verisi bu
urunun en hassas varligidir ve ucuncu tarafa devredilmesi stratejik bir bagimlilik
yaratir.

## Sonuclari

**Olumlu**

- Tenant/rol modeliyle tam entegrasyon, sifir vendor lock-in.
- Token yasam dongusu ve oturum politikasi uzerinde tam kontrol.
- Enterprise taleplerine (BYOK, ozel oturum politikalari) uyum kolay.

**Olumsuz / bedeli**

- **Guvenlik sorumlulugu tamamen bizde.** Token rotation, brute-force korumasi,
  parola sifirlama akisi, oturum iptali — hepsi dogru yazilmak zorunda.
- SSO/SAML/OIDC gibi kurumsal entegrasyonlar sonradan elle eklenecek; hazir
  saglayicida bunlar kutudan cikardi.
- Ilk gelistirme suresi hazir cozume gore belirgin olarak daha uzun.

## Degerlendirilen alternatifler

| Alternatif           | Neden secilmedi                                                  |
| -------------------- | ---------------------------------------------------------------- |
| Auth0 / Clerk        | Vendor lock-in, tenant modeline uyum zorlugu, maliyet olcegi     |
| Keycloak (self-host) | Ayri bir sistemin isletme yuku; tenant modeliyle uyum yine sorun |
| Supabase Auth        | Veritabani secimini de dayatiyor                                 |

## Bu karar ne zaman yeniden gozden gecirilir?

Kurumsal SSO talebi yogunlasirsa, kimlik saglayici **adapter** olarak eklenebilir —
kendi modulumuz yerini korur, federasyon bir port arkasina alinir.
