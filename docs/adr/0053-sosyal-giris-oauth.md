# 0053 — Sosyal giris (OAuth): Google · Microsoft · LinkedIn · Facebook

- **Durum:** ✅ **KABUL EDILDI** (2026-09-01) — ⚠️ **onay kalemlerinin TAMAMI onaylandi:**
  A · **B (B1–B5)** · C · D · E · F
- **Tarih:** 2026-09-01
- **Karar veren:** Product Owner
- **Faz:** 8 (ROADMAP §6 — _"bagimsiz kalem, herhangi bir noktada one alinabilir"_)

> ### Onay kaydi
>
> ⚠️ **B tek bir kalem olarak onaylanmadi.** Onaya sunulurken bes ayri karara
> ayrildi (B1 tablo + kolon bazli GRANT · B2 port · B3 `TokenSigner`
> genislemesi · B4 **iki** cerez · B5 sifir yeni izin) ve besi de ayri ayri
> onaylandi. ⚠️ Bu ayrim, ADR'nin ilk yaziminda tabloda **tekil** gorunen iki
> seyi duzeltti: `TokenSigner` genislemesi B'nin en agir parcasidir ve
> **cerez BIR DEGIL IKIDIR** (§4.2, §4.3) — ikisi de asagida duzeltilmis
> haliyle yazilidir.

> ### ⚠️ ONCE SONUC: BU ADR'NIN AGIRLIK MERKEZI BIR DUGME DEGIL, BIR ESITLIK KARARIDIR
>
> Sorunun tamami tek cumlede toplanir: **"ayni e-posta" ne zaman "ayni insan"
> demektir?** Cevabimiz: ⚠️ **hicbir zaman kendi basina.** Kimligin capasi
> e-posta DEGIL, saglayicinin degismez `sub` degeridir; e-posta yalnizca
> **bir kez**, baglama aninda ve **bir HUKUM** altinda kullanilir (§1, §6).
>
> ⚠️ Bunun gerekcesi teorik degil: **nOAuth** (2023) tam olarak "e-postayi
> kimlik anahtari saymak" anti-desenini istismar eder ve **Microsoft Entra**
> uzerinden calisir — saldirgan kendi tenant'ini acar, `mail` alanini kurbanin
> adresine ayarlar ve "Microsoft ile giris"e basar. Secenek (a) — duz e-posta
> eslesmesi — bu acigin **tanimidir**.

---

## Baglam

### Ne var

Faz 3 kimlik dogrulamayi uctan uca kapatti ve prod'da calisiyor: kayit →
6 haneli kod ile dogrulama → giris → tenant acma. Argon2id
([ADR-0017](0017-password-hashing-argon2id.md)), iki asamali EdDSA token
([ADR-0020](0020-jwt-structure-and-signing.md)), refresh rotation
([ADR-0021](0021-refresh-token-rotation.md)), katmanli kilit
([ADR-0022](0022-brute-force-protection.md)), parola sifirlama
([ADR-0024](0024-password-reset.md)). Tek dogruluk kaynagi
[`AUTH_ARCHITECTURE.md`](../architecture/AUTH_ARCHITECTURE.md).

Web prod'da canli: **app.kobiwise.com** (Vercel) + **api.kobiwise.com**
(Railway). Giris/kayit ekranlarinin tasarimi
[ADR-0052](0052-giris-kayit-tasarimi.md) ile kapandi.

### Ne yok

**OAuth'un hicbir parcasi yok.** Ne saglayici kaydi, ne callback ucu, ne
`Credential` tarafinda federe bir yol. ADR-0052 §6.1 dugmelerin yerini,
sirasini ve bicimini tanimladi ama **render edilmemesine** karar verdi —
gerekcesi Faz 2'nin `503` kaydiydi: _"bir ozelligin 'kapali oldugunu
soylemesi' sessizce yanlis calismasindan iyidir."_

⚠️ **Bu ADR o karari degistirir** (§11): kosul karsilandiginda dugmeler
gorunur.

### Neden simdi

Prod'da **sifir kullanici** var ve Faz 9'un landing page'i sirada. ⚠️ Sosyal
girisi **ilk gercek kullanicidan ONCE** eklemenin bir daha tekrarlanmayacak bir
avantaji vardir: **birlestirilecek hicbir hesap yoktur.** §1'in karari bugun
yazilirsa geriye donuk bir goc **hic yasanmaz**; alti ay sonra yazilirsa bir
goc plani gerektirir.

### Product Owner'in verdigi yon

1. **Dort saglayici:** Google · Microsoft · LinkedIn · Facebook.
2. ⚠️ **Apple v1 DISINDA** — Developer Program kaydi tamamlanmadi. Backend
   genisletilebilir birakilir (§15). ADR-0052 §6.2'nin siralamasi
   (Google · Microsoft · Apple) bu yuzden **degisir**.
3. Dugmeler **kucuk, yuvarlak, yalnizca ikon, tek sirada** (TradingView
   referansi) — tam genislikte yazili dugmeler DEGIL.
4. Google'a ozel: tarayicida oturum aciksa **ad/e-posta/avatar ile
   kisisellestirilmis** kutu, digerlerinin **ustunde ayri bir satir**.
5. Her saglayicinin **guncel marka kilavuzu arastirilacak**; izin vermeyen
   not dusulecek, en yakin uyumlu hal uygulanacak (§9).

---

## Karar

**Sekiz karar, tek cumleyle:**

1. **Hesap birlestirme: secenek (c) — ama ucuncu bir dal ile.** Saglayicinin
   e-postasi **DOGRULANMIS** ise mevcut hesaba baglanir; **DOGRULANMAMIS** ise
   **reddedilmez**, kendi 6 haneli kodumuzla dogrulatilir ve ancak ondan sonra
   baglanir (§1).
2. **Kimligin capasi `provider` + `sub`**, e-posta DEGIL. Yeni tablo
   `platform.federated_identities` (§2, migration `0040`).
3. **`OAuthProviderPort`** — `EmbeddingPort`/`LLMPort`/`StoragePort`/`PdfPort`
   ile ayni desen; is mantigi **hicbir kimlik saglayicisini bilmez** (§3).
4. **Callback bir GIRISTIR**: refresh cookie'sini yazar ve web'e yonlendirir;
   ⚠️ **hicbir token URL'e yazilmaz** (§5).
5. **`emailVerified` bir CLAIM DEGIL, adapter'in verdigi bir HUKUMDUR** —
   saglayici bazli kural tablosu §6'da.
6. **Yeni izin YOK.** Uclar ya kimlik oncesidir ya `/me/` altindadir (§8).
7. **Gorsel:** tek sirada yuvarlak ikon; ⚠️ **Microsoft ve LinkedIn'in
   kilavuzlari buna izin vermiyor** ve bu **yazili bir sapmadir** (§9).
8. **Dugmeler yalnizca `login` ve `register` ekranlarinda** (§11).

---

## 1. ⚠️ HESAP BIRLESTIRME — bu ADR'nin en agir karari

### 1.1 Soru

Ayni e-posta adresiyle biri hem parolayla hem bir OAuth saglayicisiyla giris
yapmaya calisirsa ne olur?

### 1.2 Uc secenek, uc bedel

| Secenek                                          | Ne yapar             | Bedeli                                                                                               |
| ------------------------------------------------ | -------------------- | ---------------------------------------------------------------------------------------------------- |
| **(a)** E-posta eslesirse **otomatik birlestir** | En akici deneyim     | ⚠️ **HESAP ELE GECIRME.** Asagida.                                                                   |
| **(b)** **Asla** birlestirme — ayri hesap        | En basit, en guvenli | ⚠️ Bu urunde **veri kaybi gibi gorunur.** Asagida.                                                   |
| **(c)** **Dogrulanmissa** birlestir              | Guvenli ve akici     | "Dogrulanmis" tanimini **biz** vermek zorundayiz; saglayicinin sozune guvenmek (a)'ya geri dusmektir |

#### ⚠️ (a) neden bir aciktir — bu bir varsayim degil, ADI OLAN bir zafiyet

**nOAuth** (Omer Cohen / Descope, 20 Haziran 2023). Saldiri sirasi:

1. Saldirgan **kendi** Microsoft Entra tenant'ini acar (ucretsiz, dakikalar).
2. O tenant'ta bir kullanici olusturur ve `mail` alanina **kurbanin adresini**
   yazar. ⚠️ Entra bu alanin sahipligini **dogrulamaz**.
3. Bizim "Microsoft ile giris"imize basar. ID token `email = kurban@sirket.com`
   tasir.
4. E-postayi kimlik anahtari sayan uygulama, saldirgani kurbanin hesabina
   sokar. **Tam hesap devri.**

⚠️ Microsoft duzeltmeyi **iki yeni claim ile** yapti — `xms_edov`
(_Email Domain Owner Verified_) ve `RemoveUnverifiedEmailClaim` — ve Haziran
2023'ten **once** kaydedilmis uygulamalarda dogrulanmamis `email` claim'i
**varsayilan olarak yayinlanmaya devam eder**. Yani bu, kapanmis bir tarih
degil, **bugun de yapilandirma gerektiren** bir kosuldur (§6).

⚠️ **Ve bu saldirinin bizde etkisi "bir hesap" degildir:** kurban hesabina
giren saldirgan `POST /auth/switch-tenant` ile tenant'a gecer ve on iki modulun
tamami — CRM, Finans, **IK maaslari** dahil — onun elindedir. Bedel
**bir sirketin butun hafizasidir**.

#### ⚠️ (b) neden bu URUNDE ozellikle kotudur

(b) genelde _"kullaniciyi sasirtir"_ diye elenir. Burada bedel cok daha agirdir
ve sebep [ADR-0016](0016-tenant-provisioning.md) +
[ADR-0028](0028-my-memberships-query.md)'in yonlendirme kuralidir:

> Parolayla kaydolup tenant acmis bir kullanici, ertesi gun Google ile girer.
> (b) altinda bu **yeni bir `User`**tir → `GET /me/memberships` **0** doner →
> [FRONTEND §3.1](../architecture/FRONTEND_ARCHITECTURE.md) geregi
> **`/create-tenant`**e gider.

⚠️ Kullanicinin gordugu sey _"iki hesabim var"_ degil, ⚠️ **"sirketim yok
olmus"**tur. Ve muhtemel refleksi en kotu sonucu uretir: **ikinci bir tenant
acar.** O andan itibaren sirketin hafizasi **iki tenant'a bolunmustur** ve
`POST /ask` ikisini birden goremez — RLS tam olarak bunu engeller.
CLAUDE.md'nin kurucu kisiti (_"moduller urun degildir, hafizadir"_) bolunmus
bir hafizada anlamini yitirir.

⚠️ Ve **geri donusu yoktur**: iki tenant'i birlestiren bir arac yok, yazilmasi
da kolay degil (her modulun kendi semasi, RLS, cross-schema FK yasagi).

### 1.3 ⚠️ KARAR: (c) — ve reddetmek yerine UCUNCU BIR DAL

Secenek (c) dogru siniftadir ama PO'nun yazdigi haliyle ("dogrulanmamissa
**reddet**") eksiktir: reddetmek, dogrulanmamis e-posta uretmesi **beklenen**
saglayicilar icin (§6) dugmeyi kullanicilarin cogu icin bir **cikmaz sokaga**
cevirir.

⚠️ Ve reddin **acik bir mesajla** yapilmasi P2'yi (_"yanitlar hesabin varligini
sizdirmaz"_) **dogrudan ihlal ederdi**: claim'i saldirgan yazdigi icin,
_"bu e-posta zaten kayitli"_ cevabi ona bir **hesap sayim (enumeration)
oracle'i** verirdi. Yani (c)'nin reddi ya sizdirir ya sessizdir; ikisi de
kotudur.

**Karar — tek kural, uc dal:**

> Saglayicidan gelen kimlik `(provider, sub)` ile aranir.
>
> | Dal    | Kosul                                                     | Ne olur                                                                                                            |
> | ------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
> | **D1** | `(provider, sub)` **zaten bagli**                         | Giris yapilir. ⚠️ **E-postaya HIC BAKILMAZ** — degismis olsa bile.                                                 |
> | **D2** | Bagli degil **ve** adapter hukmu `emailVerified = true`   | E-posta ile eslesen `User` varsa **BAGLANIR**; yoksa **yeni `User` acilir** (`active`, `emailVerified = true`).    |
> | **D3** | Bagli degil **ve** hukum `false` **veya e-posta hic yok** | ⚠️ **BIZIM 6 haneli kodumuz** o adrese gonderilir; kod dogrulanana kadar **hicbir baglama ve hicbir giris olmaz**. |

⚠️ **D3 neden bir gevsetme DEGIL, bir GUCLENDIRMEDIR** — ve bu, ADR'nin en
onemli tek cumlesidir:

> **Bu sistemin guvenlik tavani zaten "gelen kutusuna sahip olmak = hesaba
> sahip olmak"tir.** [ADR-0024](0024-password-reset.md) parola sifirlamayi tam
> olarak buna dayandirir. D3, ucuncu bir tarafin **dogrulanmamis iddiasini**
> alip onu **bizim birinci elden dogrulamamiza** cevirir — yani zayif bir
> kaniti mevcut tavanin **tam olarak seviyesine** cikarir, ustune degil.

⚠️ **D3 sizdirmaz:** hesap var da olsa yok da olsa kullanicinin gordugu ekran
ve metin **birebir aynidir** (_"Bu adrese bir kod gonderildi"_). Baglama mi
yoksa yeni hesap acma mi oldugu **kod dogrulandiktan SONRA, sunucuda**
belirlenir. P2 korunur.

⚠️ **D3'te saldirgan kaybeder:** nOAuth senaryosunda kod **kurbanin** gelen
kutusuna gider; saldirgan onu goremez.

⚠️ **D1'in "e-postaya hic bakilmaz" kurali kritiktir.** Bir kullanici Google
hesabinin adresini degistirirse baglanti **ayakta kalir**; ve saldirgan kendi
`sub`'ini kurbanin `sub`'i yapamaz. Baglanti **bir kez** kurulur; e-posta
ondan sonra **bir daha asla** kimlik anahtari olmaz.

### 1.4 Mevcut `email_verified` alaniyla etkilesim

`platform.users.email_verified` ile `status` arasindaki tutarlilik invariant'i
**hem entity'de hem veritabani CHECK'inde** yazilidir (`0003_identity_tables`):

```
pending          -> email_verified = false
active | locked  -> email_verified = true
deactivated      -> ikisi de gecerli
```

⚠️ **Bu invariant'a DOKUNULMAZ — ve dokunmaya gerek yoktur.** Uc dal mevcut
durum makinesine **oldugu gibi** oturur:

| Dal    | `User` uzerindeki etki                                                                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **D1** | Yok. Kullanici zaten `active`.                                                                                                                                            |
| **D2** | Mevcut kullaniciya baglanirken **hicbir sey degismez** (zaten `active`). Yeni kullanicida `register()` → `verifyEmail()` **ayni transaction'da**, cunku hukum karsilandi. |
| **D3** | Yeni kullanici `pending` + `emailVerified = false` acilir; kod dogrulaninca **var olan `VerifyEmailUseCase` yolu** onu `active` yapar.                                    |

⚠️ **Yeni bir `User` durumu, yeni bir nullable alan ve `Credential` uzerinde
tek satir degisiklik YOKTUR.** Bu bir tesaduf degil:
[AUTH §5.3](../architecture/AUTH_ARCHITECTURE.md) `Credential`i `User`dan tam
olarak bunun icin ayirmisti — _"SSO eklendiginde parolasi OLMAYAN kullanicilar
olacaktir; `User`da nullable bir `password_hash`, 'parola yok mu, yoksa
silinmis mi?' belirsizligi uretir."_ Bu ADR o ongorunun **tahsilatidir**:
federe kullanici, `platform.credentials`ta **satiri olmayan** bir `User`tir —
`password_hash`i `NULL` olan biri degil.

### 1.5 ⚠️ Ters yon: federe kullanici PAROLAYLA girmeye calisirsa

**Bugunku kod bunu ZATEN dogru yapiyor** ve degistirilmesi gerekmiyor:
`LoginUseCase#authenticate`, `credential === null` durumunda **SAHTE hash'i
dogrular** ve genel `InvalidCredentialsError` firlatir (AUTH §9.1). Yani cevap
_"bu hesabin parolasi yok"_ demez ve **zamanlamayla da** ele vermez.
`ResetPasswordUseCase` ve `ChangePasswordUseCase` de ayni sekilde
`credential === null`'da sessizce `null` / `invalid` doner.

⚠️ Bu, ADR'nin en sevindirici bulgusudur: **federe durum, OAuth yazilmadan uc
faz once, hesap-sayim karsiti tasarim sayesinde dogru ele alinmisti.**

⚠️ **Ama dogru olan GUVENLIKTIR, DENEYIM DEGIL** — federe kullanici bugun iki
ekranda **sessiz bir cikmaza** girer. Cozumu §7'dedir; ADR-0052 §6.3'un 3.
kisiti orada kapanir.

---

## 2. Veri modeli — `platform.federated_identities` (migration `0040`)

```sql
CREATE TABLE platform.federated_identities (
  id               uuid        PRIMARY KEY,
  user_id          uuid        NOT NULL REFERENCES platform.users (id) ON DELETE CASCADE,
  provider         text        NOT NULL,
  provider_subject text        NOT NULL,
  email_at_link    text,
  linked_at        timestamptz NOT NULL,
  last_login_at    timestamptz,

  CONSTRAINT federated_identities_provider_check
    CHECK (provider IN ('google', 'microsoft', 'linkedin', 'facebook'))
);

CREATE UNIQUE INDEX federated_identities_provider_subject_key
  ON platform.federated_identities (provider, provider_subject);

CREATE UNIQUE INDEX federated_identities_user_provider_key
  ON platform.federated_identities (user_id, provider);
```

### 2.1 Her satirin bir karari var

| Kalem                            | Karar ve gerekce                                                                                                                                                                                                                                                                |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `provider_subject`               | ⚠️ **Kimligin TEK capasi.** E-posta degil. §1'in yapisal karsiligi.                                                                                                                                                                                                             |
| `email_at_link`                  | ⚠️ **Yalnizca teshis.** Nullable. **Hicbir sorguda JOIN/WHERE anahtari DEGILDIR** ve olmamalidir — bir gun olursa §1'in tamami sessizce cozulur. Adi bilerek `email` degil `email_at_link`: **o anin fotografidir**, bugunku gercek degil.                                      |
| `UNIQUE (provider, subject)`     | Bir saglayici hesabi **en fazla bir** `User`a baglanir. Olmasaydi iki kullanici ayni Google hesabini paylasabilirdi.                                                                                                                                                            |
| `UNIQUE (user_id, provider)`     | Bir kullanicinin **saglayici basina en fazla bir** hesabi olur. Iki Google hesabi arayuzde _"hangisi bu"_ belirsizligi uretirdi ve karsiliginda hicbir sey kazandirmazdi.                                                                                                       |
| `ON DELETE CASCADE`              | `credentials` ile **ayni** davranis: kullanici silinirse kimlik bilgisi de gider.                                                                                                                                                                                               |
| `provider` **CHECK**, enum degil | ADR-0034'un `direction` deseni. Yeni saglayici tek satirlik bir `ALTER`dir; PostgreSQL enum'lari degistirmek daha pahalidir.                                                                                                                                                    |
| **`RLS YOK`**                    | ⚠️ Bilincli — tum Identity tablolariyla ayni gerekce (MT §12.4.3): **kimlik tenant'larin USTUNDE yasar** ve OAuth callback'i tenant context'i **kurulmadan once** calisir. Tenant'i olmayan bir tabloya tenant RLS'i koymak, olmayan bir kapsami **var gibi gostermek** olurdu. |

### 2.2 ⚠️ GRANT bir KOPYA DEGIL, BIR KARARDIR — ve burada bir TUZAK var

[ADR-0043 Slice 1b](0043-ik-personel-modulu.md)'nin bulgusu bu tabloda
**dogrudan tetiklenir**: `0000_init`in
`ALTER DEFAULT PRIVILEGES ... IN SCHEMA platform GRANT SELECT, INSERT, UPDATE,
DELETE` satiri **her yeni platform tablosuna sessizce uygulanir**. Yani
`federated_identities` hicbir sey yazilmasa da `businessos_app`e **tam UPDATE**
verir.

⚠️ **Bu kabul edilemez:** `provider_subject` uzerinde `UPDATE` yetkisi, bir SQL
enjeksiyonu ya da hatali bir repository metodu icin **dogrudan hesap devri
primitifidir** — saldirgan kendi satirinin `user_id`sini kurbanin id'siyle
degistirir.

**Karar — acik `REVOKE` + kolon bazli `GRANT`:**

```sql
REVOKE UPDATE ON platform.federated_identities FROM businessos_app;
GRANT  UPDATE (last_login_at) ON platform.federated_identities TO businessos_app;
```

⚠️ Bu tam olarak ADR-0043 Slice 1c'nin `suppliers.interactions` deseni:
**tek mesru mutasyon turetilmis/isletimsel bir alandir**, kimlik kolonlari
disaridadir. Ve bir entegrasyon testi `can_update` matrisini kilitler —
bir denetim, tekrarlanabilir degilse yalnizca o gunun fotografidir.

### 2.3 ⚠️ Denetim izi nereye yazilir — `platform.audit_log`a DEGIL

Baglama ve baglanti kaldirma **guvenlik acisindan anlamli olaylardir** ve
kaydedilmelidir. ⚠️ Ama `platform.audit_log`a **yazilamazlar**:
o tablonun `tenant_id` kolonu **`NOT NULL`**tur ve `platform.tenants`a FK
tasir (`0032`). Kimlik olaylari **tenant'siz**dir.

**Karar:** iki yeni domain event — `FederatedIdentityLinked` ·
`FederatedIdentityUnlinked` — mevcut **`platform.identity_outbox`**a yazilir,
Faz 3'un tum kimlik olaylariyla ayni sekilde `tenantId = null` tasiyarak.
⚠️ Yeni bir mekanizma **kurulmaz**; var olani kullanmak, "denetim izi" adi
altinda ikinci bir olay altyapisi acmaktan iyidir.

⚠️ **Giris olayi icin YENI EVENT ACILMAZ:** OAuth ile giris de
**`UserLoggedIn`** yayinlar. Oturum semantigi birebir aynidir (token ailesi,
refresh, rotation) ve ayri bir `UserLoggedInViaProvider` **her tuketiciyi
catallardi**. Hangi saglayiciyla girildigi
`federated_identities.last_login_at` uzerinden okunur.

---

## 3. `OAuthProviderPort` — saglayici bagimsizligi

CLAUDE.md'nin 7. Mutlak Kurali _"is mantigi hicbir LLM saglayicisina bagimli
olamaz"_ der. ⚠️ **Ayni kural burada kimlik saglayicilari icin gecerlidir** ve
gerekcesi daha da guclu: bir LLM saglayicisi degistiginde cevap kalitesi
degisir, bir kimlik saglayicisi degistiginde **kim oldugunuz** degisir.

### 3.1 Yerlesim

| Ne                                               | Nerede                              |
| ------------------------------------------------ | ----------------------------------- |
| `OAuthProviderPort` + `OAuthIdentity`            | **`shared/oauth-provider.port.ts`** |
| `GoogleOAuthAdapter`, `MicrosoftOAuthAdapter`, … | `infrastructure/oauth/`             |
| `OAuthProviderRegistry`                          | `infrastructure/oauth/`             |
| `LinkOrCreateFederatedUserUseCase` vb.           | `modules/identity/application/`     |

⚠️ **`shared/` secimi `StoragePort`un yazili gerekcesiyle aynidir:** yerlesim
_tuketici sayisiyla degil, portun NE OLDUGU ile_ belirlenir — saglayicisi
degistirilebilir bir **dis yetenek** `shared/` + `infrastructure/` ikilisine
aittir. `EmailPort` de tek tuketicilidir (Identity) ve `shared/`dedir.

### 3.2 Sozlesme

```ts
export const OAUTH_PROVIDER_REGISTRY = Symbol('OAUTH_PROVIDER_REGISTRY');

export type OAuthProviderKey = 'google' | 'microsoft' | 'linkedin' | 'facebook';

/** Saglayiciya gonderilecek yetkilendirme istegi (PKCE dahil). */
export interface OAuthAuthorization {
  readonly authorizationUrl: string;
  /** PKCE S256 dogrulayicisi — cagiran onu state cookie'sinde tasir. */
  readonly codeVerifier: string;
}

/**
 * Saglayicidan donen kimlik.
 *
 * ⚠️ `emailVerified` BIR CLAIM DEGIL, ADAPTER'IN VERDIGI BIR HUKUMDUR.
 * Her adapter kendi saglayicisinin kanitini kendi kuralina gore degerlendirir
 * (§6) ve is mantigi o kurallari HIC BILMEZ.
 */
export interface OAuthIdentity {
  readonly provider: OAuthProviderKey;
  /** Saglayicinin degismez `sub` degeri — kimligin TEK capasi (§1, §2). */
  readonly subject: string;
  readonly email: string | null;
  readonly emailVerified: boolean;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
}

export interface OAuthProviderPort {
  readonly key: OAuthProviderKey;

  buildAuthorization(input: {
    readonly state: string;
    readonly nonce: string;
    readonly redirectUri: string;
  }): OAuthAuthorization;

  /**
   * Kodu kimlige cevirir: token exchange + ID token imza/`nonce`/`aud`/`iss`
   * dogrulamasi + gerekiyorsa userinfo cagrisi.
   *
   * Basarisizlikta `OAuthProviderFailedError` firlatir — `null` DONMEZ:
   * bu "bulunamadi" degil, **saglayici tarafinda bir arizadir** ve 502 ile
   * bildirilir (§12).
   */
  exchange(input: {
    readonly code: string;
    readonly codeVerifier: string;
    readonly nonce: string;
    readonly redirectUri: string;
  }): Promise<OAuthIdentity>;
}

export interface OAuthProviderRegistry {
  /** Yapilandirilmamis saglayici icin `null` — bkz. §3.3. */
  find(key: string): OAuthProviderPort | null;
  /** Arayuzun hangi dugmeleri cizecegini belirler (§9.4). */
  configuredKeys(): readonly OAuthProviderKey[];
}
```

### 3.3 ⚠️ Yapilandirilmamis saglayici = OLMAYAN saglayici

Bir saglayicinin `CLIENT_ID`/`CLIENT_SECRET`i yoksa **registry'de yoktur**;
ucu **404** doner ve arayuz dugmesini **hic cizmez**.

⚠️ Bu, ADR-0052 §6.3'un 2. kisitina verilen dogrudan cevaptir: _"uc saglayici
ayni anda hazir olmayabilir; tasarim ikisi acik biri kapaliyken de ayakta
durmalidir."_ Dugme sayisi **1–4 arasinda herhangi bir sey** olabilir ve
duzen bunu kaldirir. **Apple bes numarali anahtar olarak, tek adapter + tek
CHECK satiri ile girer** (§15) — bu, soyutlamanin **sinavidir**.

### 3.4 ⚠️ Saglayici token'lari SAKLANMAZ

Access/refresh token'lari saglayicidan alinir, **islem icinde** kimlik icin
kullanilir ve **atilir**. Ne veritabaninda ne log'da ne cookie'de dururlar.

- **Kazanc:** calinacak bir saglayici token'i **yoktur**; `offline_access` /
  `refresh_token` scope'lari **hic istenmez**.
- ⚠️ **Bedel acikca yazilir:** kullanici adina saglayici API'lerine (takvim,
  kisiler, LinkedIn profili) **hicbir zaman** cagri yapamayiz. Bunu isteyen
  bir ozellik cikarsa **ayri bir ADR** gerekir — token saklamak, bu ADR'nin
  tehdit modelini bastan yazar.

---

## 4. Akis

### 4.1 Uc uc, iki yon

| Uc                                      | Metot    | Ne yapar                                           |
| --------------------------------------- | -------- | -------------------------------------------------- |
| `/api/v1/auth/oauth/:provider/start`    | `GET`    | State cookie'sini yazar, saglayiciya **302**       |
| `/api/v1/auth/oauth/:provider/callback` | `GET`    | Kodu degistirir, D1/D2/D3'u uygular, web'e **302** |
| `/api/v1/auth/oauth/verify-email`       | `POST`   | ⚠️ Yalnizca **D3**'un ikinci adimi                 |
| `/api/v1/me/identities`                 | `GET`    | Bagli saglayicilar + parola var mi (§7)            |
| `/api/v1/me/identities/:provider`       | `DELETE` | Baglantiyi kaldirir (§4.4)                         |

⚠️ Ilk uc uc **`/auth` onekinin altindadir ve bu zorunludur**: refresh
cookie'sinin `Path`i `/api/v1/auth`tir (`refresh-cookie.ts`). Baska bir onek
secilseydi callback cookie'yi **yazamazdi** ve hata **sessiz** olurdu —
kullanici giris yapmis gorunur, ilk yenilemede duserdi.

⚠️ Son iki uc `/me/` altindadir, `/auth/` altinda **degil** — parola
degistirmenin (`POST /api/v1/me/change-password`) kendi yol notuyla ayni
gerekce: `auth` oneki **kimliksiz** akislara aittir; bunlar kimligi kanitlanmis
kullanicinin **kendi kaynagi** uzerindeki islemlerdir.

### 4.2 State cookie — ⚠️ `SameSite=Lax`, `Strict` DEGIL

`start` ucu 10 dakika omurlu, **imzali** bir `HttpOnly` cookie yazar:
`state` (CSRF) · `nonce` (ID token replay) · `code_verifier` (PKCE S256) ·
`next` (site-ici hedef).

> ⚠️ **`SameSite=Strict` BURADA KULLANILAMAZ ve bu, gozden kacmasi en kolay
> ayrintidir.** Callback, saglayicidan gelen bir **ust seviye cross-site
> navigasyondur**; `Strict` cookie boyle bir istekte **hic gonderilmez** ve
> akis **her seferinde** kirilir. `Lax`, ust seviye `GET` navigasyonlarinda
> cookie'yi gonderir — tam olarak ihtiyacimiz olan sey.
>
> ⚠️ Bu, refresh cookie'sinin `Strict`iyle **bilincli bir ayrimdir** ve
> yazilmadigi takdirde biri "tutarlilik" adina onu da `Strict` yapar; sonuc
> **%100 kirilan** ama lokal testte gorunmeyebilen bir akistir.

Ek onlemler: `Path=/api/v1/auth/oauth` (yuzey daraltma) · `Secure` (uretimde) ·
imza **mevcut EdDSA anahtariyla** (`TokenSigner`) atilir.

⚠️ **`TokenSigner` genisliyor ve bedeli yazilir:** guvenlik acisindan kritik
bir port'a ucuncu bir token turu ekleniyor. Alternatif — ayri bir imzalayici —
**ikinci bir anahtar yasam dongusu** demekti (rotasyon, dagitim, sizma yuzeyi).
Tek anahtar + ayri `typ` claim'i + ayri dogrulama metodu secildi;
⚠️ bir birim testi, state token'inin **kimlik/erisim token'i olarak kabul
edilmedigini** kilitler.

⚠️ **Tablo yerine cookie secildi:** state icin bir tablo, temizlik isi, RLS
sorusu ve migration getirirdi. Cookie kendiliginden oluir.

### 4.3 Callback

1. `state` cookie'si okunur ve imzasi/omru dogrulanir → yoksa **302 → web,
   `?error=state`**.
2. Sorgu `state` ile cookie `state` karsilastirilir (CSRF).
3. `registry.find(provider)` → yoksa **404**.
4. `exchange()` → `OAuthIdentity`. ⚠️ Adapter ID token'in **imzasini,
   `iss`/`aud`/`exp` ve `nonce`**'unu dogrular; dogrulamayan bir adapter
   PKCE'yi anlamsiz kilar.
5. **D1 / D2 / D3** (§1.3) — hepsi **tek transaction**.
6. D1/D2: `TokenFamily` + `RefreshToken` acilir (giris yolunun **aynisi**),
   refresh cookie yazilir, `UserLoggedIn` yayinlanir → **302 → `app`**.
7. D3: kod uretilir ve gonderilir, **kisa omurlu imzali bir "bekleyen baglama"
   cookie'si** yazilir (`provider` + `subject` + `email`, 15 dk) →
   **302 → `/oauth/verify?…`**.

⚠️ **D3'un bekleyen baglamasi neden TABLOYA yazilmaz:** yazilsaydi, dogrulama
tamamlanmadan `UNIQUE (provider, provider_subject)` uzerinde bir **yer isgali**
olusurdu ve temizlenmemis satirlar birikirdi. Imzali cookie kendiliginden
oluir ve **sunucuda hicbir iz birakmaz**.

### 4.4 Baglanti kaldirma — ⚠️ SON YONTEM KALDIRILAMAZ

`DELETE /me/identities/:provider`, kullanicinin **geriye en az bir giris
yontemi** kalacaksa calisir (parola bir yontem sayilir). Aksi halde **409** ve
acik bir mesaj: _"Bu, hesabinizdaki tek giris yontemi."_

⚠️ Burada P2 **gecerli degildir** ve bu bilinclidir: kullanici kendi hesabinda,
kimligi kanitlanmis haldedir — kendi giris yontemlerini bilmesi bir sizinti
degil, bir **haktir**.

⚠️ Kaldirma **oturumlari dusurmez**. Parola degistirme dusuruyordu
(ADR-0023) cunku orada **sirrin kendisi** degisir; burada yalnizca bir giris
kapisi kapanir ve acik oturumlar o kapidan gelmemis olabilir.

---

## 5. ⚠️ IKI ALT DOMAIN VE TOKEN TASIMA — en kritik seam

**Problem:** callback `api.kobiwise.com`a duser, kullanici
`app.kobiwise.com`a donmelidir. Ama kimlik token'i bugun **yanit govdesinde**
tasinir (ADR-0026: memory'de saklanir) ve **bir yonlendirmenin govdesi yoktur.**

**Reddedilen:** token'i yonlendirme URL'inin **fragment'ine** (`#token=…`)
koymak. ⚠️ Yaygin ama yanlis: deger tarayici gecmisine, olasi `Referer`
basliklarina ve eklenti/uzanti erisimine girer — ADR-0026'nin _"token DOM'a ve
disk'e degmez"_ ilkesinin tam tersi.

**Karar:**

> ⚠️ **Callback bir GIRISTIR.** Tam olarak `POST /auth/login` gibi **refresh
> cookie'sini yazar** ve `https://app.kobiwise.com/oauth/complete?status=ok`a
> yonlendirir. Web tarafi acildiginda **`POST /auth/refresh`** cagirir ve
> kimlik token'ini **govdeden** alir. ⚠️ **Hicbir sir hicbir URL'e yazilmaz.**

⚠️ **Bu yol PROD'DA ZATEN KANITLANDI.** CLAUDE.md'nin
_"SameSite=Strict alt domainler arasinda davranissal olarak kanitlandi"_
bolumu, gercek bir tarayicida `app.kobiwise.com` → `api.kobiwise.com`
`POST /auth/refresh` isteginin **200** dondugunu ve **cerezin gonderildigini**
gosteriyor. Yani bu ADR yeni bir mekanizma **icat etmiyor**, calistigi olculmus
bir yolu kullaniyor.

⚠️ **Ve iki alt domain kararinin ikinci kez odullendigi yer burasidir:**
`*.vercel.app` ↔ `*.up.railway.app` ayriminda kalinsaydi, bu tasarim
**kurulamazdi** — geriye yalnizca fragment'e token yazmak kalirdi.

⚠️ **`status` disinda hicbir sey tasinmaz:** basarisizlikta
`?error=<kod>` doner ve kod **kaba tanelidir** (`state`, `provider`,
`cancelled`, `email_required`) — saglayicinin ham hatasi kullaniciya
tasinmaz.

---

## 6. ⚠️ `emailVerified` — saglayici bazli HUKUM tablosu

| Saglayici     | Elimizdeki kanit                                                       | ⚠️ Adapter hukmu (`emailVerified`)                                       | Gerekce                                                                                                                                                        |
| ------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Google**    | ID token'da `email_verified: boolean`                                  | Claim'in **kendisi**                                                     | Google adresi kendi verir (Gmail) ya da alan adi Workspace'te dogrulanmistir. Sektorde en guvenilir claim.                                                     |
| **Microsoft** | `email` (⚠️ **dogrulanmamis**) + istege bagli `xms_edov: boolean`      | ⚠️ **Yalnizca `xms_edov === true` ise `true`.** Claim yoksa **`false`.** | **nOAuth.** `email` claim'ini saldirgan kendi tenant'inda yazar. `xms_edov` Microsoft'un bu is icin ekledigi claim'dir ve **app registration'da acilmalidir**. |
| **LinkedIn**  | `email_verified: boolean` — ⚠️ **istege bagli alan, gelmeyebilir**     | Claim `true` ise `true`; **yoksa `false`**                               | LinkedIn dokumantasyonu acikca _"`email` ve `email_verified` istege baglidir ve tum yanitlarda bulunmayabilir"_ der. Yoklugu **onay degildir**.                |
| **Facebook**  | ⚠️ **Hicbir claim yok.** Meta yalnizca "gecerli" bir adres varsa doner | ⚠️ **`false`** (PO onayina sunuluyor — **Kalem C**)                      | Asagida.                                                                                                                                                       |

### 6.1 ⚠️ Facebook neden `false` — ve bunun bedeli

Meta'nin `email_verified` diye bir alani **yoktur**. Yaygin savunma
_"donduyse dogrulanmistir"_ seklindedir ve Meta'nin dokumante ettigi
davranisiyla uyumludur.

⚠️ Ama bu bir **iddiadir, bir kanit degil**: baskasinin sistemine dair bizim
yaptigimiz bir **cikarimdir** ve o sistem davranisini degistirdiginde hata
**sessiz olur** — hicbir test kirmizi yanmaz, yalnizca bir hesap yanlis
kisiye baglanir.

**Karar (oneri):** Facebook `false` sayilir ve **D3'e** duser.
⚠️ **Bedeli durusttur ve kucuktur:** Facebook ile ilk kez giren kullanici
**bir kez** 6 haneli bir kod girer. Ondan sonraki her giris D1'dir — kod
bir daha **hic** sorulmaz.

⚠️ Karsi gorus de yazilir: bu, Facebook'u dort dugmenin **en yavasi** yapar ve
PO onu bilerek sectiyse bedeli bilmelidir. Bu yuzden **Kalem C** olarak onaya
sunuluyor; tek satirlik bir degisiklikle `true`ya cevrilebilir.

### 6.2 ⚠️ Yapilandirma bir KOD kadar baglayicidir

Microsoft'un `xms_edov` claim'i **app registration'da acilmadikca gelmez** ve
gelmediginde hukum `false` olur — yani her Microsoft kullanicisi D3'e duser.
⚠️ Bu **sessiz bir bozulma degildir** (akis calisir, yalnizca bir adim uzar),
ama fark edilmezse _"Microsoft neden hep kod soruyor"_ diye yanlis yerde
aranir.

**Karar:** kurulum adimlari ADR'nin ekinde degil,
**`AUTH_ARCHITECTURE.md`'de kalici bir bolum** olarak yazilir; ⚠️ ve bir
entegrasyon testi, `xms_edov` **tasimayan** bir Microsoft yanitinin
`emailVerified === false` urettigini kilitler — yani kural, yapilandirma
bozulsa bile **guvenli tarafta** kalir.

---

## 7. Federe kullanicinin parola ekranlari — ADR-0052 §6.3/3 kapaniyor

| Ekran                 | Bugun ne oluyor                               | Karar                                                                               |
| --------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------- |
| `login` (parolayla)   | Genel **401**, sizdirmiyor                    | ✅ **Degismez** (§1.5)                                                              |
| `forgot-password`     | Sabit mesaj doner, sonra kod **hic calismaz** | ⚠️ **Mesaj degismez** (P2 mutlaktir) — ama **E-POSTANIN ICERIGI degisir** (asagida) |
| `/me/change-password` | `invalid` doner, sebep soylenmez              | ⚠️ **Ekran artik biliyor**: `GET /me/identities` (asagida)                          |

### 7.1 ⚠️ Cozum sizmayan yerdedir: GELEN KUTUSU

`forgot-password`in **HTTP yaniti** degistirilemez — kimliksiz bir cagirana
_"bu hesabin parolasi yok"_ demek P2'nin tam ihlalidir.

⚠️ **Ama e-postanin kendisi yalnizca adresin sahibine gider** — kodun kendisi
gibi. Karar: `credential === null` olan bir kullanici icin **kod yerine bir
aciklama** gonderilir:

> _"Bu hesaba Google ile giris yapiliyor. Parola sifirlama gecerli degil;
> giris ekranindan Google dugmesini kullanin."_

⚠️ Bu bir sizinti **degildir** ve ayrimi yapan sey kanaldir: HTTP yaniti
**herkese** doner, e-posta **yalnizca gelen kutusunun sahibine**. Ayni ayrim
6 haneli kodun kendisi icin de gecerlidir.

### 7.2 `GET /api/v1/me/identities`

```jsonc
{
  "hasPassword": false,
  "identities": [{ "provider": "google", "linkedAt": "2026-09-01T…", "lastLoginAt": "…" }],
}
```

⚠️ **E-posta DONMEZ** — `email_at_link` bir teshis kolonudur ve API yuzeyine
cikarsa er ya da gec bir yerde kimlik anahtari gibi kullanilir (§2.1).

Bu uc iki yeri birden besler: `/me/change-password` ekrani (`hasPassword:
false` ise form yerine bir aciklama) ve **"Bagli hesaplar"** yonetim yuzeyi.

### 7.3 ⚠️ v1'de PAROLA EKLEME YOK

Federe bir kullanicinin hesabina **parola eklemesi** v1 kapsaminda **degildir**.

- `reset-password`i genisletmek **yanlis** olurdu: o uc, var olan bir
  `Credential` uzerinde tanimlidir; yaratmasini saglamak anlamini ve kaba
  kuvvet muhasebesini (ADR-0022 defteri) degistirir.
- Dogru sekli ayri bir uctur (`POST /me/password`, kimlik korumali) ve **ayri
  bir istir** (Mutlak Kural 1).

⚠️ **Bedel acikca yazilir:** yalnizca Google ile kaydolan bir kullanici, Google
hesabini kaybederse bizde de erisimini kaybeder. Bugunku telafi: **ikinci bir
saglayici baglamak**. Bu, arayuzde soylenir.

---

## 8. Yetkilendirme — ⚠️ YENI IZIN YOK

| Uc                               | Koruma                                                               |
| -------------------------------- | -------------------------------------------------------------------- |
| `/auth/oauth/:provider/start`    | **Yok** — kimlik oncesi, `POST /auth/login` gibi                     |
| `/auth/oauth/:provider/callback` | **Yok** — koruma `state` + PKCE + `nonce`tir                         |
| `/auth/oauth/verify-email`       | **Yok** — koruma imzali bekleyen-baglama cookie'si + 6 haneli koddur |
| `/me/identities` (GET/DELETE)    | **Kimlik korumali** (auth middleware), RBAC **degil**                |

⚠️ **`ADR-0025`in kataloguna tek satir eklenmez** ve gerekce ADR-0025'in kendi
modelidir: izinler `resource:action` biciminde ve **tenant kapsaminda**
tanimlidir. Bu uclar cagiranin **global kimligi** uzerinde islem yapar —
tenant'i yoktur, dolayisiyla kapsami da yoktur. Bir `identity:read` izni
uydurmak, `platform`in RLS'siz tablolarina tenant kapsami koymakla ayni
sinifta bir hata olurdu: **olmayan bir kapsami var gibi gostermek.**

Bu, `POST /api/v1/me/change-password`in halihazirda izledigi desendir.

---

## 9. ⚠️ FRONTEND — marka kilavuzu uyumu ve YAZILI SAPMA

### 9.1 Arastirmanin sonucu: PO'nun istedigi bicim DORT SAGLAYICIDA DA MUMKUN DEGIL

| Saglayici     | Kucuk · yuvarlak · **yalnizca ikon** dugmeye izin veriyor mu? | Kilavuzun soyledigi                                                                                                                                                                                                                                                                                              |
| ------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Google**    | ✅ **EVET**                                                   | Resmi varlik paketinde **"icon mode"** vardir ve **dairesel** bicim, light/dark/neutral temalarla birlikte yayinlanir. Tek kosul: `G` **cerceve icinde** olmali ve yeniden renklendirilmemeli.                                                                                                                   |
| **Facebook**  | ✅ **EVET (bicim olarak)**                                    | ⚠️ Logonun **kendisi zaten dairesel bir rozettir**; "eksiksiz ve degistirilmemis" kullanilmasi sarttir (⚠️ **ciplak `f` YASAK**). Min. **16 px**, clearspace = genislik/4.                                                                                                                                       |
| **Microsoft** | ❌ **HAYIR**                                                  | ⚠️ _"Microsoft logosu ile **'Sign in with Microsoft' terimlerinin BIRLIKTELIGI**"_ sart kosuluyor; yer yoksa **"Sign in"**e kisaltilabilir. Yayinlanan varliklarin **hepsi dikdortgen**, ikon-modu varlik **yok**.                                                                                               |
| **LinkedIn**  | ⚠️ **PRATIKTE HAYIR**                                         | `[in]` logosu giris islevi icin kullanilabilir; ⚠️ ama _"gorsel varliklar (dugme, rozet, ikon) **yalnizca LinkedIn'in sagladigi gibi** kullanilir; ortaklar bunlari degistiremez veya **kendi gorsellerini uretemez**"_ ve resmi giris varliklari **dikdortgendir**. Logonun **rengi ve BICIMI degistirilemez**. |

### 9.2 ⚠️ KARAR: tek sira yuvarlak ikon — Microsoft ve LinkedIn icin YAZILI SAPMA

Dort dugme de **ayni boyutta, ayni yuvarlaklikta, tek sirada** cizilir.
⚠️ Google ve Facebook **tam uyumludur**; Microsoft ve LinkedIn **degildir** ve
bu, bir gozden kacirma degil **bilincli ve kaydedilmis bir sapmadir**.

**Neden karisik bir duzen secilmedi** — degerlendirilen ve reddedilen iki
alternatif:

| Alternatif                                                             | Neden reddedildi                                                                                                                                                  |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google + Facebook yuvarlak; Microsoft + LinkedIn tam genislikte yazili | ⚠️ Iki gorsel dil **ayni bolgede** yan yana gelir; sonuc iki saf secenekten de **kotudur** ve ADR-0038'in "iki ayri izgara" dersi bunu bir kez odetmisti.         |
| Dordu de tam genislikte yazili dugme                                   | Tam uyumlu, ama ⚠️ **PO'nun acik gorsel yonunu iptal eder** ve ADR-0052 §6.2'nin _"ekranin ilk gorunen seyi baska sirketlerin logosu olmasin"_ kaygisini buyutur. |

**Sapmayi kucultmek icin dort somut onlem — ve hicbiri "gorunuyor gibi yapmak" degil:**

1. ⚠️ **Erisilebilir ad tam ifadeyi tasir:** `aria-label="Microsoft ile giris
yap"` / `title` ayni metni verir. Terimler **erisilebilirlik agacinda ve
   ipucunda vardir**; gorsel olarak yoktur. ⚠️ **Bu bir hafifletmedir, uyum
   DEGILDIR** ve oyle yazilir.
2. **Fiili ust baslik verir:** sirali dugmelerin ustunde
   _"veya sununla devam et"_ ayraci durur — Microsoft'un istedigi **eylem
   ifadesi** ekranda, dugmenin **hemen ustundedir**.
3. **Logolar degistirilmez:** yeniden renklendirme yok, 3B/golge/kontur yok,
   ciplak `f` yok, `[in]` bicimi/rengi sabit; her ikon icin clearspace
   kilavuzun istedigi kadar.
4. ⚠️ **Geri donus yolu ONCEDEN kararlastirilir:** Microsoft veya LinkedIn
   itiraz eder ya da ortak incelemesi talep ederse, ⚠️ **satirin TAMAMI**
   resmi dikdortgen varliklara gecer — tek bir dugme sirdan **cikarilmaz**
   (yukarida reddedilen karisik duzen tam olarak o olurdu).

⚠️ **Bu bir hukuki gorus degildir.** TradingView gibi buyuk urunlerin ayni
deseni (LinkedIn ve Facebook dahil) kullanmasi bir **tolere edilme kanitidir,
bir IZIN kaniti degil.** Kalem D bu yuzden onaya sunuluyor.

### 9.3 Yer, sira, bicim

| Karar     | Deger                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------ |
| **Yer**   | E-posta formunun **ALTINDA**, _"veya sununla devam et"_ ayraciyla (ADR-0052 §6.2 **degismiyor**) |
| **Sira**  | ⚠️ **Google · Microsoft · LinkedIn · Facebook** — Apple cikti, LinkedIn ve Facebook eklendi      |
| **Boyut** | 40 px dokunma hedefi; ⚠️ mobilde **44 px** (FRONTEND'in dokunma hedefi kurali)                   |
| **Tema**  | Acik/koyu temada her saglayicinin **kendi** resmi varyanti; ⚠️ ODA token'lariyla boyanmaz        |

⚠️ **Siranin gerekcesi degisti:** ADR-0052 Apple'i ucuncu siraya **esik**
yuzunden koymustu. Bugunku sira **yaygin kullanim** sirasidir: Google (en
yaygin), Microsoft (Microsoft 365 kullanan KOBI sayisi yuksek), LinkedIn
(is baglami — ve bu **bir B2B urunudur**), Facebook (en genis kitle, en dusuk
is bagi).

### 9.4 ⚠️ Dugmeler SUNUCUNUN soyledigi kadar cizilir

Arayuz dugmeleri **sabit kodlamaz**: `registry.configuredKeys()` degerini
donen bir uctan okur. ⚠️ Aksi halde yapilandirilmamis bir saglayicinin
dugmesi ekranda durur ve tiklaninca **404** verir — ADR-0052 §6.1'in
reddettigi seyin ta kendisi (_"tiklandiginda hicbir sey yapmayan dugme"_).

### 9.5 ⚠️ Bu bolum ADR-0038'in DIL SINIRINA girmez

ADR-0052 §7 iki tasarim dili arasindaki siniri kurar ve testle kilitler. Sosyal
dugmeler **ucuncu bir dil degildir**: ODA token'lari **kullanmazlar** ve
`auth-surface.css`in Mars token'larini da kullanmazlar — her biri **kendi
markasinin** varligidir. ⚠️ Bu, siniri delmek degil, sinirin **disinda** bir
bolgedir ve ADR-0052'nin _"tasarim sistemimize uydurulmaz"_ cumlesi bunu zaten
soyluyordu.

---

## 10. ⚠️ Google kisisellestirilmis dugme — ve olculmus bir KISIT

PO'nun istedigi: tarayicida Google oturumu aciksa **ad/e-posta/avatar** ile
_"X olarak devam et"_ kutusu, digerlerinin **ustunde ayri bir satir**.

### 10.1 ⚠️ KISIT: kisisellestirilmis dugme YUVARLAK IKON OLAMAZ

Google Identity Services'in yazili kurali: kisisellestirilmis dugme
**gorunmez** eger `type = icon` ise, `size` `medium`/`small` ise ya da
**genislik 200 px'in altindaysa**.

⚠️ Yani _"kucuk yuvarlak ikon"_ ile _"kisisellestirilmis kutu"_ **ayni dugme
olamaz** — ve PO'nun istedigi duzen (ustte ayri bir satir, altta ikon sirasi)
bu kisitin **tek uyumlu cozumudur**. Talep ile kural **cakismiyor, ortusuyor**.

### 10.2 ⚠️ Google IKI KEZ gorunur — ve bu bilincli

Kisisellestirilmis kutu gorundugunde Google **sirada da kalir**.

Alternatif — kutu gorununce Google'i siradan cikarmak — reddedildi, iki
gerekceyle:

1. ⚠️ **Duzenimiz kontrol etmedigimiz bir betige bagimli olamaz.** GIS betigi
   gec yuklenir, engellenir veya hic yuklenmez; sira uzunlugunun ona bagli
   olmasi, **sayfanin ziplamasi** ya da hic cizilmemesi demektir.
2. Iki kontrol **ayni soruyu sormuyor**: ustteki _"bu hesapla"_, alttaki
   _"bir Google hesabiyla"_ (kullanicinin ikinci bir hesabi olabilir). Google'in
   kendi dokumantasyonu da kisisellestirilmis dugmenin hesabi **otomatik
   secmedigini** soyluyor.

### 10.3 ⚠️ FedCM acilir — aksi halde ozellik SESSIZCE hic gorunmez

Kisisellestirilmis dugme ucuncu taraf cerezleri engellendiginde **FedCM
surumu acik degilse cizilmez**. Ucuncu taraf cerezleri kaybolmakta oldugu icin,
FedCM'siz bir kurulum **calisiyor gorunur ama ozellik hicbir zaman ortaya
cikmaz** — bu projenin surekli isaretledigi **sessiz bozulma** sinifi.

**Karar:** FedCM **acik** kurulur.

### 10.4 ⚠️ Betik ENGELLENDIGINDE ekran EKSIKSIZ calisir

`accounts.google.com/gsi/client` reklam engelleyiciler tarafindan rutin olarak
engellenir. Karar: kisisellestirilmis kutu **ilerlemeli bir zenginlestirmedir**
— betik basarili olursa **mount edilir**, olmazsa **hic mount edilmez**.

⚠️ **Yer AYRILMAZ, iskelet cizilmez.** Bu, ADR-0043'un ucret bolumu icin
kurdugu ayni disiplindir: _"gorunmuyor" degil, "hic yok"_ — bileşen kosullu
**MOUNT** edilir, icinde bir "gizle" dali yoktur.

### 10.5 ⚠️ Bedeli: giris ekranina UCUNCU TARAF BETIGI giriyor

Bu, ADR'nin en rahatsiz edici tavizidir ve gizlenmiyor: **guvenin kuruldugu
ekrana** kontrol etmedigimiz bir betik ekleniyor.

- **Alternatifi yok:** kullanicinin Google oturumunu **yalnizca Google
  bilebilir**; kendi kutumuzu cizmek mumkun degil.
- **Sinirlanmasi:** CSP'de yalnizca `https://accounts.google.com` icin
  `script-src` acilir; betik **yalnizca `login` ve `register`** rotalarinda
  yuklenir — ⚠️ `/app` altinda **hic** yuklenmez.
- ⚠️ **Kalem E** olarak onaya sunuluyor: ozellik **istege baglidir** ve
  vazgecilirse geri kalan her sey aynen calisir.

---

## 11. ⚠️ HANGI EKRANLARDA GORUNUR — ADR-0052 §6.1 DEGISIYOR

ADR-0052 §6.1 dugmelerin **render edilmemesine** karar vermisti ve kosulu
yazmisti: _"Faz 8'in backend'i gelene kadar."_ **Bu ADR o backend'dir.**

| Ekran                                | Sosyal dugme | Gerekce                                                                                              |
| ------------------------------------ | :----------: | ---------------------------------------------------------------------------------------------------- |
| `login`                              | ✅ **EVET**  | Birincil giris kapisi                                                                                |
| `register`                           | ✅ **EVET**  | ⚠️ **Ayni uc**, farkli metin — akis "bagla ya da ac"tir; ayri bir "kayit" ucu **yoktur**             |
| `verify-email`                       |   ❌ Hayir   | Kullanici zaten bir yontem secti; ikinci bir cikis **kafa karistirir**                               |
| `forgot-password` · `reset-password` |   ❌ Hayir   | ⚠️ Bunlar **parola akisinin onarim ekranlaridir**; federe kullanici buraya **hic gelmemelidir** (§7) |
| `create-tenant` · `select-tenant`    |   ❌ Hayir   | ⚠️ Kullanici **zaten kimlik dogrulamis**tir; bir "giris yap" dugmesi burada **anlamsizdir**          |
| `/app/*`                             |   ❌ Hayir   | Baglanti **ekleme** ayri bir yuzeydir: ⚠️ "Bagli hesaplar", `/app/change-password`in yanina (§7.2)   |

⚠️ **PO'nun sorusuna dogrudan cevap:** yalnizca **ikisi** — `login` ve
`register`. Diger bes auth ekraninda **gorunmez**, ve `create-tenant` ozellikle
sayilmistir cunku split-screen iskeleti onu login'in **devami gibi**
gosterir; oysa kullanici o noktada **iceridedir**.

⚠️ **Yer ayrilmasi konusu kapaniyor:** ADR-0052 _"yer de AYRILMAZ; dugmeler
geldigi gun form asagi kayar, bu bir kerelik ve kabul edilebilir"_ demisti.
**O gun bu istir** ve kayma iki ekranda yasanir.

---

## 12. Hata tipleri ve `DisclosableProblem`

CLAUDE.md'nin kalici kurali **AI hata tipleri** icindir
(`EmbeddingFailedError` · `RateLimitExceededError` · `CompletionFailedError`)
ve kapsami _"her modul er ya da gec AI'a dokunur"_ gerekcesine dayanir.

⚠️ **Identity bu kapsama girmez ve bu ADR onu genisletmez:** modulun AI yuzeyi
**yoktur**, `IdentityDomainExceptionFilter`in `@Catch` listesinde bu tipler
**bugun de yoktur** ve eklenmeleri **yaniltici** olurdu — okuyan biri Identity'nin
bir AI yuzeyi oldugunu sanardi. Bu, ayni kuralin `StorageFailedError` icin
yazdigi **alan bazli** ayrimdir.

⚠️ **Ama kuralin SEKLI aynen uygulanir**, cunku asimetrik bedel aynidir:

| Yeni hata                    |  Durum  | `DisclosableProblem`                                                                         |
| ---------------------------- | :-----: | -------------------------------------------------------------------------------------------- |
| `OAuthProviderFailedError`   | **502** | ✅ **EVET** — kullanici _"tekrar deneyin"_ ile _"beklenmeyen hata"_ arasindaki farki gormeli |
| `OAuthStateInvalidError`     | **400** | ❌ Hayir — 4xx zaten maskelenmez                                                             |
| `OAuthProviderNotConfigured` | **404** | ❌ Hayir                                                                                     |
| `LastSignInMethodError`      | **409** | ❌ Hayir (§4.4)                                                                              |

⚠️ Ve `ProblemDetailsFilter`in genel maskesi **acilmaz**: eslenmemis bir domain
kodunun 500'u **maskeli kalir** ve bir test bunu kilitler.

---

## 13. ⚠️ ADR-0036 esik kontrolu — **bakildi, uygulanmiyor**

CLAUDE.md'nin surec kurali her yeni ADR'de bu maddeyi **atlanmaz** kilar.

| Soru                                                   | Cevap                                                                         |
| ------------------------------------------------------ | ----------------------------------------------------------------------------- |
| 1. Yapisal bir `RetrievalContributor` ekliyor mu?      | ⚠️ **HAYIR** — hicbir katkici eklemiyor (anlamsal da yok)                     |
| 2. Satir donduren yapisal kaynak sayisi kaca cikiyor?  | **8** — **degismiyor**                                                        |
| 3. ADR-0042 §3'un **T2** esigini (bugun 6) geciyor mu? | Durum **degismiyor**; T2 zaten asilmis ve ADR-0050 ile **olculup birakilmis** |
| 4. Platform karari gerekiyor mu?                       | **Hayir**                                                                     |

⚠️ **Ve gerekce bir "unutma" degil bir SINIRDIR:** bu bir is modulu degildir.
Kimlik verisi (kimin hangi saglayiciyla girdigi) **kurumsal hafizaya ait
degildir** ve `POST /ask` havuzuna girmesi bir **sizinti** olurdu —
IK'nin maas izolasyonuyla ayni sinifta. Fan-out **18'de kalir**.

---

## 14. ⚠️ Yeni migration kontrol listesi — dordu de yapilacak

CLAUDE.md'nin dort adimli listesi bu iste **tamamen** uygulanir:

1. `drizzle/0040_federated_identities.sql` **ve** `.down.sql`.
2. ⚠️ `drizzle/meta/_journal.json`a giris (`idx: 40`, `when` artan,
   `tag` birebir). Atlanirsa `db:migrate` **"basarili" der ve hicbir sey
   uygulamaz**.
3. ⚠️ `database.integration.spec`in **geri alma listesine** eklenir.
4. ⚠️ **Yeni sema ACILMIYOR** (`platform` mevcut) — ama §2.2'nin `REVOKE` +
   kolon bazli `GRANT`i **tam olarak bu adimin ruhudur**: verilen yetki, **tam
   olarak yazilan yetkidir** ve varsayilan ayricaliklar burada **yanlis tarafa
   calisiyor**.

**Kanit adimi:** tablonun **varligini** ve yetki matrisini iddia eden bir
entegrasyon testi (`federated-identities.integration.spec`) — sayi saymak
yetmez.

---

## 15. Apple ve genisletilebilirlik — ⚠️ soyutlamanin SINAVI

Apple v1 disindadir (Developer Program kaydi tamamlanmadi). **Test sudur:**
Apple eklendiginde degismesi gereken sey **yalnizca**:

1. `infrastructure/oauth/apple-oauth.adapter.ts` (**yeni dosya**),
2. `OAuthProviderKey` birligine `'apple'`,
3. `federated_identities_provider_check` CHECK'ine tek deger (`ALTER`),
4. yapilandirma degiskenleri.

⚠️ **`LinkOrCreateFederatedUserUseCase`de tek satir degismemelidir.** Bu, ADR-0007'nin
_"yeni saglayici eklemek yalnizca yeni bir adapter yazmayi gerektirmeli"_
testinin kimlik tarafindaki karsiligidir.

⚠️ **Apple'in KENDINE OZGU sorunu yine de bekliyor** (ADR-0052 §6.3/1):
_"Hide My Email"_ `…@privaterelay.appleid.com` uretir ve kullanici Apple
tarafindaki iliskiyi iptal ederse **adres oluir**. ⚠️ Bu ADR'nin tasarimi o
sorunu **kucultur ama cozmez**: kimlik capasi `sub` oldugu icin **giris calismaya
devam eder** — bozulan yalnizca `EmailPort`un o adrese ulasmasidir. Yani Apple
geldiginde cozulmesi gereken sey "giris" degil **"iletisim adresi"**dir; bu
ayrim Apple'in ADR'sine devrediliyor.

---

## Sonuclari

**Olumlu**

- ⚠️ **nOAuth sinifi saldiri yapisal olarak imkansiz**: kimlik anahtari `sub`,
  e-posta yalnizca bir kez ve hukum altinda.
- ⚠️ **"Sirketim yok olmus" senaryosu ve bolunmus tenant riski ortadan kalkti.**
- ⚠️ **Sifir yeni izin, sifir yeni `User` durumu, `Credential`da sifir
  degisiklik** — AUTH §5.3'un uc faz once verdigi karar tahsil edildi.
- **Yeni saglayici = yeni adapter** (ADR-0007 testinin kimlik karsiligi).
- ⚠️ **Hicbir sir URL'e yazilmaz** — cozum, prod'da olculmus cerez yolunu
  kullanir.
- Saglayici token'lari **saklanmaz**: calinacak bir sey yok.
- ADR-0052'nin uc acik kisitindan **ikisi kapaniyor** (§7, §11).

**Olumsuz / bedeli**

- ⚠️ **Facebook ve `xms_edov`siz Microsoft kullanicilari ILK GIRISTE bir kod
  girer.** Bir kez; sonrasinda hic. Ama en yavas yol budur.
- ⚠️ **Giris ekranina ucuncu taraf betigi giriyor** (Google GIS) — CSP ile
  daraltiliyor ama **kaldirilmiyor**.
- ⚠️ **Microsoft ve LinkedIn'in gorsel kilavuzlarindan SAPILIYOR.** Yazili,
  hafifletilmis, geri donus yolu belirlenmis — ama sapma **sapmadir**.
- ⚠️ **`TokenSigner` genisliyor**: guvenlik kritik bir port'a ucuncu token turu.
- ⚠️ **Federe kullanici v1'de parola EKLEYEMEZ**; Google hesabini kaybederse
  telafisi ikinci bir saglayici baglamaktir.
- ⚠️ **Iki ekranda duzen kayar** (form asagi iner) — ADR-0052'nin ongordugu ve
  kabul ettigi bir kerelik degisiklik.
- ⚠️ **Yeni bir dis bagimlilik sinifi**: dort saglayicinin **kesinti suresi**
  artik bizim giris yolumuzun bir parcasi. Parola yolu her zaman **yedektir**
  ve bu yuzden **kaldirilmamalidir**.

## Degerlendirilen alternatifler

| Alternatif                                                  | Neden secilmedi                                                                                                                              |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **(a) E-posta eslesirse otomatik birlestir**                | ⚠️ **nOAuth.** Microsoft `email` claim'ini saldirgan kendi tenant'inda yazar; bedel bir hesap degil **bir sirketin tum hafizasidir** (§1.2). |
| **(b) Asla birlestirme**                                    | ⚠️ Kullanici "sirketim yok olmus" sanip **ikinci tenant** acar; hafiza **bolunur** ve geri donusu **yoktur** (§1.2).                         |
| **(c) saf hali — dogrulanmamissa REDDET**                   | Ya P2'yi ihlal eder (acik mesaj = hesap sayim oracle'i) ya sessiz bir cikmaz uretir. D3 ucuncu dal olarak eklendi (§1.3).                    |
| Token'i yonlendirme fragment'inde tasimak (`#token=…`)      | ⚠️ Gecmise/`Referer`a/uzantilara sizar; ADR-0026'nin _"token DOM'a ve disk'e degmez"_ ilkesinin tersi (§5).                                  |
| State/nonce/verifier icin **tablo**                         | Temizlik isi, migration ve RLS sorusu getirirdi; imzali cookie **kendiliginden oluir** (§4.2).                                               |
| Baglama/kaldirmayi `platform.audit_log`a yazmak             | ⚠️ O tablonun `tenant_id`si **`NOT NULL`**; kimlik olaylari tenant'sizdir. `identity_outbox` zaten dogru yerdir (§2.3).                      |
| OAuth girisi icin ayri event (`UserLoggedInViaProvider`)    | Oturum semantigi birebir ayni; ayirmak **her tuketiciyi catallardi** (§2.3).                                                                 |
| `reset-password`i "parola ekleme"ye genisletmek             | Ucun anlamini ve ADR-0022'nin kaba kuvvet muhasebesini degistirirdi; dogrusu ayri bir uc ve **ayri bir istir** (§7.3).                       |
| Kisisellestirilmis kutu gorununce Google'i siradan cikarmak | ⚠️ Duzen, kontrol etmedigimiz bir betige bagimli olurdu (ziplama / hic cizilmeme). Iki kontrol ayrica **ayni soruyu sormuyor** (§10.2).      |
| Karisik duzen (2 yuvarlak + 2 yazili)                       | ⚠️ Ayni bolgede iki gorsel dil; iki saf secenekten de kotu (§9.2).                                                                           |
| Dordu de tam genislikte yazili dugme                        | Tam uyumlu ama PO'nun acik gorsel yonunu iptal eder; ADR-0052 §6.2'nin kaygisini buyutur (§9.2).                                             |
| Apple'i v1'e sikistirmak                                    | Developer Program kaydi **onkosuldur**; ayrica "Hide My Email" ayri bir karar gerektirir (§15).                                              |
| Saglayici access/refresh token'larini saklamak              | Tehdit modelini bastan yazardi; bugun ihtiyac **yok** (§3.4).                                                                                |

---

## Bu ADR kapanirken bilinen sinirlar

- ⚠️ **`start` ucunda oran siniri YOK.** Uc yalnizca bir cerez yazip
  yonlendirir; pahali adim (token exchange) saglayicidan gecerli bir `code`
  gerektirir. Kotuye kullanim gorulurse `platform.rate_limits` hazir bir
  tirmanistir.
- ⚠️ **Saglayici hesabi basina en fazla bir kullanici, kullanici basina en
  fazla bir saglayici hesabi** — iki Google hesabi baglanamaz.
- ⚠️ **Ad ve avatar SAKLANMAZ.** `displayName`/`avatarUrl` port'ta vardir ama
  `federated_identities`e yazilmaz: `platform.users`in **adi yoktur** ve bu
  bilincli bir daralmadir (`identity.public.ts` yalnizca `emailVerified` acar).
  Onlari saklamak, kimlik tablosunu bir **profil tablosuna** cevirmenin ilk
  adimi olurdu — ⚠️ ve ADR-0043'un _"calisan ≠ uyelik"_ karari zaten adin
  **IK'nin isi** oldugunu soylemisti.
- ⚠️ **Saglayici tarafinda hesap silinirse bizde iz kalmaz** — sarkan bir satir
  degil ama "olu" bir baglantidir; kullanici onu `/me/identities`ten kaldirabilir.
- ⚠️ **E-posta degisikligi saglayicidan bize akmaz.** D1'de e-postaya
  bakilmadigi icin `platform.users.email` **eski adres olarak kalir** — ve bu
  **dogrudur**: o adres bizim dogruladigimiz adrestir.
- ⚠️ **MFA/2FA yok** (parola tarafinda da yok). Saglayicinin MFA'si bizim
  MFA'miz **degildir** ve oyle sunulmamalidir.
- ⚠️ **`hd` (Workspace alan adi) kisiti yok** — herhangi bir Google hesabi
  girebilir. Tenant bazli alan adi kisiti ABAC'tir, backlog'ta.
- ⚠️ **Playwright e2e hala yok**; OAuth akisi tam olarak e2e'nin en cok
  gerektigi yerdir (uc taraf, iki alan adi, cerez). Dogrulama **gercek
  tarayicida elle** yapilacaktir.
- ⚠️ **Retention listesine YENI SATIR GIRMIYOR** ve gerekce ROADMAP §8.5'in
  kendi olcutudur (_"borcu doguran sey satirin ZAMANLA COGALMASIDIR"_):
  `federated_identities` **kullanici sayisiyla** artar, zamanla degil —
  `loyalty.accounts` ile ayni sebeple listeye girmemistir. **Liste 24'te kalir.**

---

## ✅ Product Owner onayi gereken kalemler — **ALTISI DA ONAYLANDI (2026-09-01)**

| #      | Kalem                                                                                                                                  | Neden onaya sunuldu                                                                                                                             | Durum |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | :---: |
| **A**  | ⚠️ **Hesap birlestirme = (c) + D3.** Dogrulanmamis e-postada **reddetmek yerine** kendi kodumuzu gonderiyoruz.                         | PO'nun yazdigi (c) "reddet" diyordu; bu bir **sapmadir** ve bedeli (bir kerelik ek adim) kabul edilmelidir.                                     |  ✅   |
| **B1** | ⚠️ **`platform.federated_identities`** (migration `0040`) — RLS yok; ⚠️ acik `REVOKE UPDATE` + `GRANT UPDATE (last_login_at)`.         | Onaylanan sey tablonun **varligi degil**, kolon bazli GRANT karari: `provider_subject` uzerinde UPDATE bir **hesap devri primitifidir** (§2.2). |  ✅   |
| **B2** | **`OAuthProviderPort`** — `shared/` + `infrastructure/oauth/`.                                                                         | ADR-0007/0009 deseninin tekrari; en dusuk riskli kalem ama `shared/` kernel'ine dokunuyor.                                                      |  ✅   |
| **B3** | ⚠️ **`TokenSigner` genisliyor** — ucuncu token turu (OAuth state), `typ` claim'i ile ayrilir.                                          | ⚠️ **B'nin en agir parcasi.** Alternatifi (ayri imzalayici) **ikinci bir anahtar yasam dongusu** demekti. Ayrim **testle kilitlenir** (§4.2).   |  ✅   |
| **B4** | ⚠️ **IKI yeni cerez** (bir degil): `state` (10 dk) ve **bekleyen baglama** (15 dk, yalnizca D3). Ikisi de **`SameSite=Lax`**.          | ⚠️ `Lax` bir tutarsizlik degil **zorunluluktur**: callback ust seviye cross-site navigasyondur, `Strict` orada **hic gonderilmez** (§4.2).      |  ✅   |
| **B5** | ⚠️ **Sifir yeni izin.** Bes ucun hicbiri ADR-0025 katalogunu buyutmuyor.                                                               | Bu da bir **Authorization kararidir**: izinler tenant kapsamlidir, bu uclar **global kimlik** uzerinde calisir (§8).                            |  ✅   |
| **C**  | ⚠️ **Facebook `emailVerified = false` sayiliyor** (§6.1) — Facebook kullanicisi ilk giriste bir kod girer.                             | Tek satirla `true`ya cevrilebilir. Durust konum `false`tur; **hiz** isteniyorsa PO bunu bilerek degistirmelidir.                                |  ✅   |
| **D**  | ⚠️ **Microsoft ve LinkedIn marka kilavuzlarindan SAPILIYOR** (§9.2) — yuvarlak yalnizca-ikon dugme.                                    | ⚠️ Hukuki gorus degildir; LinkedIn ve Meta API erisimini askiya alabilir. Geri donus yolu yazildi ama **riski PO ustlenir**.                    |  ✅   |
| **E**  | ⚠️ **Google GIS betigi giris ekranina ekleniyor** (§10.5).                                                                             | Kisisellestirilmis kutu **istege baglidir**; vazgecilirse geri kalan her sey aynen calisir — listedeki tek gercekten opsiyonel kalem.           |  ✅   |
| **F**  | ⚠️ **ADR-0052 §6.1 ve §6.2 DEGISIYOR**: dugmeler render edilecek; siralama **Google · Microsoft · LinkedIn · Facebook** (Apple cikti). | Yayinlanmis bir ADR'nin kararini degistiriyor; ADR-0052'nin metni **silinmez**, uzeri cizilir ve superseded notu eklenir.                       |  ✅   |

---

## Kapsam disi

Apple (§15) · parola ekleme ucu (§7.3) · MFA · SAML/kurumsal SSO · SCIM
kullanici saglama · saglayici API'lerine erisim (§3.4) · tenant bazli alan adi
kisiti · davet akisi (bir tenant'a OAuth ile davet edilme) · profil fotografi
ve ad saklama · e-posta sablonlarinin marka hali (ROADMAP §7).

---

## Bu karar ne zaman yeniden gozden gecirilir?

1. ⚠️ **Bir saglayici hesap devri bildirimi yaparsa** ya da yeni bir nOAuth
   sinifi zafiyet yayinlanirsa — §6'nin hukum tablosu **derhal** okunur.
2. ⚠️ **Microsoft veya LinkedIn gorsel sapmaya itiraz ederse** — §9.2'nin
   geri donus yolu isletilir: **satirin tamami** resmi dikdortgen varliklara
   gecer.
3. **Apple eklendiginde** — §15'in dort maddesi degisir; "Hide My Email" icin
   ayri bir ADR yazilir.
4. **Federe kullanici parola eklemek isterse** — §7.3 acilir.
5. ⚠️ **Bir saglayici API'sine kullanici adina erisim istenirse** — §3.4'un
   "token saklanmaz" karari **bastan** tartisilir; bu, tehdit modelini
   degistirir.
6. **Ilk gercek kullanicilardan sonra**, D3'e dusen giris orani olculur:
   `xms_edov` yapilandirmasinin gercekten calisip calismadigi ancak orada
   gorulur.
