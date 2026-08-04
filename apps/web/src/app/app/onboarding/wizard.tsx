'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/api/error-message';
import { createNote } from '@/lib/api/knowledge';
import { markOnboardingCompleted } from '@/lib/onboarding/completed';
import { getCurrentTenantId } from '@/lib/session/session-store';
import { ONBOARDING_CLOSING_MESSAGE, ONBOARDING_QUESTIONS } from './questions';

/**
 * Onboarding wizard'ı — TEK TEK, sohbet tarzı 7 soru (ADR-0030 §3).
 *
 * ============================================================================
 * NEDEN ADIM ADIM GÖNDERİM (sonda toplu değil)
 * ============================================================================
 * Her cevap, kullanıcı ilerlediği anda `POST /knowledge/notes` ile AYRI bir not
 * olur (başlık = soru, gövde = cevap — ADR-0030 §3'te karara bağlandı).
 *
 * Sonda toplu göndermek iki şeyi bozardı: (1) wizard yarıda bırakılırsa verilen
 * cevaplar KAYBOLURDU, (2) son adımda 7 ardışık embedding çağrısı beklemek
 * gerekirdi.
 *
 * Gönderim BEKLENİR ve hata olursa kullanıcı AYNI SORUDA kalır. "Arka planda
 * gönder, devam et" daha akıcı görünürdü ama sessizce kaybolan bir cevap
 * üretirdi — kurumsal hafızaya yazıldığını sandığınız bir bilginin orada
 * olmaması, en kötü hata türüdür.
 *
 * ============================================================================
 * "ATLA" AĞA HİÇ ÇIKMAZ
 * ============================================================================
 * Atlanan soru için not YOKTUR (ADR-0030 §3: "cevaplar 7 ayrı not olur —
 * atlanmayanlar"). Boş gövdeli bir not backend'de zaten `422` alırdı.
 *
 * ============================================================================
 * HEPSİ ATLANIRSA
 * ============================================================================
 * Hiç not oluşmaz, yani tetikleme koşulu ("notu yoksa göster") hâlâ doğrudur.
 * Bu yüzden tamamlanma bayrağı, not yazılıp yazılmadığından BAĞIMSIZ olarak
 * kapanışta yazılır (`completed.ts` gerekçesi).
 * ============================================================================
 */
export function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const finished = step >= ONBOARDING_QUESTIONS.length;
  const current = ONBOARDING_QUESTIONS[step];

  function advance(): void {
    setAnswer('');
    setError(null);
    setStep((previous) => previous + 1);
  }

  /** Bayrağı yazar ve panele döner — hem tamamlama hem "hepsini atla" yolu. */
  function finish(): void {
    const tenantId = getCurrentTenantId();
    if (tenantId !== undefined) {
      markOnboardingCompleted(tenantId);
    }
    router.replace('/app');
  }

  async function submitAnswer(): Promise<void> {
    if (current === undefined) {
      return;
    }

    const body = answer.trim();
    if (body === '') {
      // Boş "İleri" atlamayla aynı şeydir; sunucuya gitmesinin anlamı yok.
      advance();
      return;
    }

    setError(null);
    setLoading(true);
    try {
      await createNote({ title: current.question, body });
      advance();
    } catch (caught) {
      // Kullanıcı AYNI soruda kalır ve cevabı ekranda durur: tekrar denemek
      // için yeniden yazmak zorunda kalmamalı.
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  if (finished) {
    return <ClosingScreen onFinish={finish} />;
  }

  if (current === undefined) {
    return null;
  }

  return (
    <section className="mx-auto flex max-w-xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="text-sm text-fg-muted">
          Soru {step + 1} / {ONBOARDING_QUESTIONS.length}
        </p>
        <h1 className="text-xl font-semibold">Şirketinizi tanıyalım</h1>
        <p className="text-sm text-fg-muted">
          Verdiğiniz her cevap bir not olarak kaydedilir; sistem bunları bağlam olarak kullanır.
        </p>
      </header>

      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submitAnswer();
        }}
      >
        <FormError message={error} />

        <Field label={current.question} htmlFor="onboarding-answer">
          <Input
            id="onboarding-answer"
            value={answer}
            placeholder={current.placeholder}
            autoComplete="off"
            onChange={(event) => {
              setAnswer(event.target.value);
            }}
          />
        </Field>

        <div className="flex flex-col gap-2">
          <Button type="submit" loading={loading}>
            İleri
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={loading}
            onClick={() => {
              advance();
            }}
          >
            Atla
          </Button>
        </div>
      </form>
    </section>
  );
}

/**
 * Kapanış ekranı — ADR-0030 §3'ün son adımı.
 *
 * Ayrı bileşen: soru ekranıyla ORTAK state'i yoktur (girdi, hata, yükleme
 * durumu burada anlamsız). Aynı fonksiyonda tutmak, hiçbiri kullanılmayan
 * beş state'in altında iki ekranı birden okumak demekti.
 */
function ClosingScreen({ onFinish }: { onFinish: () => void }) {
  return (
    <section className="mx-auto flex max-w-xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold">Hazırsınız</h1>
        <p className="text-sm text-fg-muted">{ONBOARDING_CLOSING_MESSAGE}</p>
      </header>

      <Button onClick={onFinish}>Panele git</Button>
    </section>
  );
}
