# 0017 — Parola saklama: Argon2id parametreleri

- **Durum:** Kabul edildi
- **Tarih:** 2026-07-21
- **Karar veren:** Product Owner
- **Faz:** 3

## Baglam

ADR-0004 kimlik dogrulamayi kendi modulumuzde yazmaya karar verdi ve bedelini
acikca yazdi: "Guvenlik sorumlulugu tamamen bizde." Parola saklama, bu
sorumlulugun en agir parcasidir — veritabani sizarsa geri alinamaz.

CLAUDE.md ve ARCHITECTURE 10 algoritmayi zaten Argon2id olarak sabitlemisti.
Eksik olan PARAMETRELERDI: hangi bellek maliyeti, kac iterasyon, hangi
paralellik. Bu degerler yazilmadan "Argon2id kullaniyoruz" cumlesi bir guvence
vermez; yanlis parametrelerle Argon2id, dogru parametrelerle bcrypt'ten
zayiftir.

## Karar

```
type        = Argon2id
memoryCost  = 19456 KiB   (19 MiB)
timeCost    = 2
parallelism = 1
hashLength  = 32 byte
saltLength  = 16 byte     (rastgele, kullanici basina)
```

Hash, parametreleri kendi icinde tasiyan **PHC string** formatinda saklanir:
`$argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>`

**Kademeli yeniden hash'leme zorunludur:** kullanici basariyla giris yaptiginda,
hash'i eski parametrelerle uretilmisse — o an elimizde duz parola varken —
yenisiyle sessizce guncellenir.

**Bu degerler bir TABANDIR, hedef degil.** Uretim donaniminda olculmeli ve tek
hash ~100-250 ms surecek sekilde `memoryCost` yukari cekilmelidir.

## Gerekce

**Neden Argon2id (Argon2i veya Argon2d degil).** Argon2d GPU'ya direnclidir ama
yan kanal saldirilarina acik; Argon2i tersi. Argon2id ikisini birlestirir ve
RFC 9106 ile OWASP'in onerdigi varyanttir.

**Neden bellek agirlikli.** Bellek maliyeti, GPU/ASIC ile paralel kirma
denemelerini pahali kilan ASIL parametredir. Bir saldirgan binlerce cekirdegi
paralel calistirabilir ama her birine 19 MiB veremez. Iterasyon sayisini
artirmak ayni korumayi vermez.

**Neden PHC formati.** Parametreler hash'in yaninda saklanmazsa, parametreler
ileride yukseltildiginde eski hash'ler DOGRULANAMAZ hale gelir ve tum
kullanicilar disarida kalir.

**Neden kademeli yeniden hash'leme.** Parametre yukseltmesinin tek pratik
yoludur. Aksi halde 2026'da uretilmis zayif hash'ler 2030'da hala zayif kalir;
kullaniciyi parola degistirmeye zorlamak ise hem etkisiz hem NIST'in
onermedigi bir uygulamadir.

## Sonuclari

**Olumlu**

- Veritabani sizsa bile parolalar pratik olarak kirilamaz.
- Parametreler zamanla yukseltilebilir ve eski hash'ler kirilmaz.
- Yukseltme kullaniciyi hicbir sekilde rahatsiz etmez.

**Olumsuz / bedeli**

- **Hash maliyeti kendi sunucumuza karsi bir DoS vektorudur.** Giris uc noktasi
  tanimi geregi kimliksizdir; her istek bize 19 MiB bellek ve olculebilir CPU
  harcatir. 500 ms'lik bir hash, saniyede 20 sahte istekle bir cekirdegi
  doldurur.
- Bu yuzden parametre secimi ADR-0022'deki oran sinirlamasiyla **birlikte**
  kararlastirilir; ikisi ayri ayri optimize EDILEMEZ.
- Bellek maliyeti, cok sayida es zamanli giris olan anlarda (sabah mesai
  baslangici) kapasite planlamasini etkiler.
- Uretim donaniminda olcum yapilmadan bu degerler "yeterli" sayilamaz; olcum
  bir kerelik degil, donanim degistikce tekrarlanmalidir.

## Degerlendirilen alternatifler

| Alternatif                        | Neden secilmedi                                                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| bcrypt                            | 72 bayt girdi siniri (uzun parola cumleleri sessizce kirpilir); bellek maliyeti ayarlanamaz, GPU'ya Argon2 kadar direncli degil |
| scrypt                            | Argon2'den once iyi bir secimdi; Argon2 sifre yarismasini kazandi ve daha iyi analiz edildi                                     |
| PBKDF2                            | Yalnizca uyumluluk gerektiginde. Bellek zorlugu yok — GPU ile cok daha ucuz kirilir                                             |
| Daha yuksek `p` (paralellik)      | Sunucu tarafinda ek karmasiklik; tek istek icin cok cekirdek kullanmak, es zamanli istekler altinda avantaj saglamaz            |
| Cok daha yuksek `m` (orn. 64 MiB) | Guvenlik acisindan iyi ama DoS yuzeyini buyutur; olcum yapilmadan secilmemeli                                                   |

## Bu karar ne zaman yeniden gozden gecirilir?

- Uretim donaniminda yapilan ilk olcumden sonra (`memoryCost` netlesecek).
- Donanim yenilendiginde veya trafik profili degistiginde.
- OWASP/RFC onerileri guncellendiginde.
- Argon2'de pratik bir zayiflik yayinlandiginda — bu durumda algoritma degisir,
  PHC formati sayesinde kademeli gecis mumkun olur.
