# 0007 — AI: Saglayici-bagimsiz port/adapter

- **Durum:** Kabul edildi
- **Tarih:** 2026-07-20
- **Karar veren:** Product Owner
- **Faz:** 0 (uygulama Faz 6+)

## Baglam

Urun AI destekli is akislari sunacak. LLM pazari hizla degisiyor: saglayicilar,
fiyatlar ve yetenekler aylar icinde yer degistiriyor.

## Karar

Business logic yalnizca `LLMPort` arayuzunu bilir. OpenAI, Anthropic, Gemini, xAI,
Azure, OpenRouter, Ollama, LM Studio birer adapter'dir.

**Kabul testi:** Yeni saglayici eklemek yalnizca yeni adapter yazmayi gerektirmeli.
Business logic'te tek satir degismemeli.

## Gerekce

Bir LLM saglayicisina dogrudan bagimlilik, fiyat degisikligini veya servis kesintisini
urun krizine cevirir. Port/adapter, saglayiciyi bir yapilandirma detayina indirir.

Ayrica Enterprise musteriler kendi API anahtarlarini (BYOK) veya kendi barindirdiklari
modelleri talep edecek; bu ancak saglayici degistirilebilirse mumkun.

## Sonuclari

**Olumlu**

- Saglayici degisimi tek bir adapter yazmakla sinirli.
- Tenant bazli saglayici/model secimi ve fallback zinciri mumkun.
- Maliyet takibi ve kota tek bir noktada uygulanabiliyor.

**Olumsuz / bedeli**

- Port, saglayicilarin **ortak paydasini** temsil eder. Bir saglayicinin ozgun
  yetenegi (ozel tool-use bicimi, yapisal cikti garantisi) ya soyutlamanin disinda
  kalir ya da soyutlamayi kirletir. Bu gercek bir tasarim gerilimidir.
- Ek bir dolayli katman ve onun bakimi.

## Degerlendirilen alternatifler

| Alternatif                              | Neden secilmedi                             |
| --------------------------------------- | ------------------------------------------- |
| Tek saglayiciya dogrudan bagimlilik     | Fiyat/kesinti riski dogrudan urune yansir   |
| Hazir soyutlama katmani (LangChain vb.) | Kendi bagimlilik ve surum riskini getiriyor |

## Bu karar ne zaman yeniden gozden gecirilir?

Bir saglayicinin ozgun yetenegi urun icin vazgecilmez hale gelirse, o yetenek
port'a birinci sinif olarak eklenir — dogrudan bagimlilik yine kurulmaz.
