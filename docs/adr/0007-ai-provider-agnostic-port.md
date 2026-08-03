# 0007 — AI: Saglayici-bagimsiz port/adapter

- **Durum:** Kabul edildi
- **Tarih:** 2026-07-20
- **Karar veren:** Product Owner
- **Faz:** 0 (uygulama **Faz 4** — 2026-08-02'de `ROADMAP.md` v1.0 ile hizalandi; onceki deger "Faz 6+" idi)

## Baglam

Urun AI destekli is akislari sunacak. LLM pazari hizla degisiyor: saglayicilar,
fiyatlar ve yetenekler aylar icinde yer degistiriyor.

## Karar

Business logic yalnizca `LLMPort` arayuzunu bilir. OpenAI, Anthropic, Gemini, xAI,
Azure, OpenRouter, Ollama, LM Studio, **DeepSeek** birer adapter'dir.

> **DeepSeek eklendi — Product Owner karari, 2026-08-02, maliyet-performans
> gerekcesiyle.** Ayrinti: asagidaki "Not — saglayici listesine DeepSeek
> eklendi" bolumu.

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

## Not — uygulama fazi degisikligi (2026-08-02)

Bu ADR yazildiginda uygulama "Faz 6+" olarak isaretlenmisti. `ROADMAP.md` v1.0
onu **Faz 4**'e cekti: AI Context Engine, ilk is modulunun (Knowledge/Inbox)
UZERINE SONRADAN eklenen bir ozellik degil, o modulle BIRLIKTE tasarlanan mimari
bir temeldir. Context Engine'i ikinci veya ucuncu modulde eklemeye kalkmak, ilk
modulu "AI'a baglam uretmeyen" bir modul olarak tasarlamak ve sonradan geriye
donuk yeniden yazmak demektir.

**KARARIN KENDISI DEGISMEDI** — yalnizca ne zaman uygulanacagi degisti. `LLMPort`
soyutlamasi, kabul testi ve gerekce aynen gecerlidir. Faz'in one alinmasi bu
ADR'yi daha da baglayici kilar: saglayici secimi artik yakin bir karardir ve
business logic'in ona bagimli olmamasi bugun teorik degil pratik bir kisittir.

## Not — saglayici listesine DeepSeek eklendi (2026-08-02)

**Product Owner karari, 2026-08-02, maliyet-performans gerekcesiyle.**

Bu not bir SUREC DUZELTMESIDIR. DeepSeek, ADR-0029 (Faz 4: Knowledge Modulu +
AI Context Engine) yazilirken `DeepSeekLlmAdapter` adiyla ortaya cikti — ama o
tarihte bu ADR'nin ve `CLAUDE.md`'nin saglayici listelerinde YOKTU. Yani somut
bir tasarim dokumaninda, onaylanmis listede bulunmayan bir saglayici adi
geciyordu.

CLAUDE.md "AI mimarisi"ni danisilmasi zorunlu konular arasinda sayar; bir
saglayicinin secilmesi ADR'e yazilmadan once tasarim metnine girmemelidir.
Liste bu notla resmi kayda gecirildi ve `CLAUDE.md` §AI Katmani ile
senkronlandi.

**KARARIN KENDISI DEGISMEDI.** DeepSeek de digerleri gibi bir ADAPTER'dir;
port/adapter disiplini, kabul testi ve gerekce aynen gecerlidir. Bir saglayicinin
listeye girmesi ona ayricalik vermez — business logic hicbirini bilmez.

> **`LLMPort` tek arayuz degil artik.** ADR-0029, port yuzeyini ikiye boldu:
> `EmbeddingPort` (`embed`) ve `LLMPort` (`complete`). Yukaridaki "yalnizca
> `LLMPort` arayuzunu bilir" ifadesi bu yuzden LAFZEN degil ILKESEL okunmalidir:
> business logic saglayici SDK'sini degil, PORT'lari bilir. Bolunmenin gerekcesi
> ADR-0029'dadir.
