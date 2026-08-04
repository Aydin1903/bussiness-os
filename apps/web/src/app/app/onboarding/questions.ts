/**
 * Onboarding soruları — ADR-0030 §3'ten BİREBİR, sırasıyla.
 *
 * Metinler ADR'de karara bağlandı; burada değiştirilmezler. Her cevap AYRI bir
 * not olur ve **soru başlık, cevap gövde** olarak kaydedilir (ADR-0030 §3):
 * yani bu diziler yalnızca ekran metni değil, kurumsal hafızaya yazılan
 * başlıkların ta kendisidir.
 *
 * Soruların tenant'a göre özelleştirilmesi ADR-0030'da açıkça KAPSAM DIŞIDIR.
 *
 * `placeholder` ADR'de yok — yalnızca ekran yardımıdır ve nota GİRMEZ.
 */
export interface OnboardingQuestion {
  /** Nota başlık olarak yazılır. */
  readonly question: string;
  readonly placeholder: string;
}

export const ONBOARDING_QUESTIONS: readonly OnboardingQuestion[] = [
  { question: 'Şirketiniz ne iş yapıyor?', placeholder: 'Örn. kurumsal müşterilere yazılım…' },
  { question: 'Kaç kişilik bir ekipsiniz?', placeholder: 'Örn. 12 kişi, 3 ekip' },
  { question: 'Hangi sektördesiniz?', placeholder: 'Örn. lojistik' },
  {
    question: 'Şu an en çok zaman harcadığınız iş süreci ne?',
    placeholder: 'Örn. teklif hazırlama',
  },
  { question: 'En büyük rakipleriniz kim?', placeholder: 'Örn. X ve Y' },
  { question: 'Şu an hangi araçları kullanıyorsunuz?', placeholder: 'Örn. Excel, Trello' },
  {
    question: 'Bu üründen beklentiniz ne?',
    placeholder: 'Örn. dağınık bilgiyi tek yerde toplamak',
  },
] as const;

/** ADR-0030 §3'te birebir tanımlı kapanış cümlesi. */
export const ONBOARDING_CLOSING_MESSAGE =
  'İstediğiniz zaman daha fazla not ekleyebilirsiniz, sistem kullandıkça sizi daha iyi tanıyacak.';
