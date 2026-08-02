'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { changePassword } from '@/lib/api/auth';
import { errorMessage } from '@/lib/api/error-message';

/** İstemci tarafı kural: iki yeni parola alanı eşleşmeli. */
const MISMATCH_MESSAGE = 'Yeni parolalar eşleşmiyor.';

/**
 * Mevcut parola + yeni parola + yeni parola tekrar.
 *
 * ============================================================================
 * "TEKRAR" ALANI SUNUCUYA GİTMEZ
 * ============================================================================
 * Eşleşme kontrolü tümüyle burada yapılır: bu bir YAZIM HATASI korumasıdır,
 * sunucunun bilebileceği bir kural değildir. Gövdeye koymak, backend'in
 * doğrulamadığı bir alan taşımak olurdu (`auth.dto.ts` `strict` zaten reddeder).
 *
 * Parola POLİTİKASI (ADR-0018) burada tekrarlanmaz — tek doğruluk kaynağı
 * sunucudur ve ihlali `422` ile döner. İki yerde kural yazmak, ikisinin
 * ayrışması demektir (`reset-password-form` ile aynı disiplin).
 * ============================================================================
 *
 * Başarıda yönlendirme YOK: bu oturum ayakta kaldığı için kullanıcıyı login'e
 * atmak yanlış olurdu (sıfırlamadan farkı tam olarak budur). Yerine kalıcı bir
 * onay mesajı gösterilir ve form temizlenir.
 */
export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [succeeded, setSucceeded] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(): Promise<void> {
    setError(null);
    setSucceeded(false);

    // Ağa çıkmadan önce elenir: sunucuya gitse bile bir şey öğrenemezdik.
    if (newPassword !== confirmation) {
      setError(MISMATCH_MESSAGE);
      return;
    }

    setLoading(true);
    try {
      await changePassword({ currentPassword, newPassword });
      setSucceeded(true);
      // Parolalar formda BIRAKILMAZ: işlem bitti, ekranda durmalarının bir
      // faydası yok ve omuz üstü okumaya açık.
      setCurrentPassword('');
      setNewPassword('');
      setConfirmation('');
    } catch (caught) {
      setError(errorMessage(caught, 'Parola değiştirilemedi.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-5"
      noValidate
    >
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">Şifre değiştir</h1>
        <p className="text-sm text-fg-muted">
          Değişiklikten sonra bu cihazdaki oturumun devam eder; diğer tüm
          cihazlardaki oturumların kapanır.
        </p>
      </header>

      <FormError message={error} />

      {succeeded ? (
        <p
          role="status"
          className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-fg"
        >
          Parolan değiştirildi. Diğer cihazlardaki oturumların kapatıldı; bu
          cihazda oturumun açık kalmaya devam ediyor.
        </p>
      ) : null}

      <Field label="Mevcut parola" htmlFor="currentPassword">
        <Input
          id="currentPassword"
          type="password"
          name="currentPassword"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => {
            setCurrentPassword(event.target.value);
          }}
          required
        />
      </Field>

      <Field label="Yeni parola" htmlFor="newPassword">
        <Input
          id="newPassword"
          type="password"
          name="newPassword"
          autoComplete="new-password"
          value={newPassword}
          onChange={(event) => {
            setNewPassword(event.target.value);
          }}
          required
        />
      </Field>

      <Field label="Yeni parola (tekrar)" htmlFor="confirmation">
        <Input
          id="confirmation"
          type="password"
          name="confirmation"
          autoComplete="new-password"
          aria-invalid={error === MISMATCH_MESSAGE}
          value={confirmation}
          onChange={(event) => {
            setConfirmation(event.target.value);
          }}
          required
        />
      </Field>

      <Button type="submit" loading={loading}>
        Parolayı değiştir
      </Button>
    </form>
  );
}
