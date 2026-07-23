import { exportPKCS8, exportSPKI, generateKeyPair } from 'jose';

/**
 * Identity sirlarini test ortamina kurar.
 *
 * `IdentityModule` acilista JWT anahtarlarini ve pepper'i config'ten ister ve
 * eksikse surec BASLAMAZ (ADR-0019, ADR-0020). Uygulamayi ayaga kaldiran her
 * entegrasyon testi bu yuzden once burayi cagirir.
 *
 * Anahtar cifti her calistirmada YENIDEN URETILIR: testler sabit bir anahtara
 * bagli olmamalidir ve repoda anahtar bulunmamalidir.
 */
export async function setIdentityTestEnv(): Promise<void> {
  const { privateKey, publicKey } = await generateKeyPair('EdDSA', { extractable: true });

  process.env.JWT_ISSUER = 'https://api.businessos.test';
  process.env.JWT_AUDIENCE = 'businessos-api';
  process.env.JWT_SIGNING_KID = 'test-1';
  process.env.JWT_PRIVATE_KEY = Buffer.from(await exportPKCS8(privateKey)).toString('base64');
  process.env.JWT_PUBLIC_KEY = Buffer.from(await exportSPKI(publicKey)).toString('base64');
  process.env.VERIFICATION_CODE_PEPPER = 'integration-test-pepper-32-chars';

  // Outbox relay KAPALI: arka planda tiklayan bir zamanlayici, testlerin
  // gozlemledigi satirlari onlarin altindan degistirir ve sonuclari zamana
  // bagimli kilar. Tuketici testleri turu KENDILERI tetikler.
  process.env.OUTBOX_RELAY_ENABLED = 'false';

  // E-posta saglayicisi KONSOL — testler gelistiricinin `.env`'ine BAGIMLI
  // OLMAMALIDIR. Bu satirlar olmasaydi, `.env`'inde `EMAIL_PROVIDER=resend`
  // yazan bir makinede testler ya acilista patlar (anahtar yoksa) ya da GERCEK
  // e-posta gondermeye calisirdi. Testler hermetik olmak zorundadir.
  //
  // NOT: dotenv ZATEN TANIMLI `process.env` degerlerini EZMEZ; burada atanan
  // deger `.env`'dekine gore onceliklidir.
  process.env.EMAIL_PROVIDER = 'console';
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
}
