'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/api/error-message';
import { createNote } from '@/lib/api/knowledge';

/**
 * Not ekleme formu (ADR-0029 §4).
 *
 * Başlık OPSİYONEL: ADR "kullanıcı hızlıca bir düşünce bırakabilmeli" der.
 * Boş bırakılırsa `null` gider — boş string DEĞİL; backend `title IS NULL OR
 * length(btrim(title)) > 0` kısıtı taşıyor ve boş string 422 alırdı.
 *
 * Gövde `textarea`: not tek satırlık bir alan değil. UI kit'te `textarea`
 * yok — `Input`'un sınıflarını paylaşan yerel bir eleman kullanılır; yeni bir
 * tasarım dili değil, aynı dilin ikinci elemanı.
 *
 * Başarıda form temizlenir ve `onCreated` ile liste tazelenir: yeni notun
 * listede görünmemesi, kaydedilmediği izlenimi verirdi.
 */
export function NoteForm({ onCreated }: { onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(): Promise<void> {
    const trimmedBody = body.trim();
    if (trimmedBody === '') {
      return;
    }

    const trimmedTitle = title.trim();

    setError(null);
    setLoading(true);
    try {
      await createNote({ title: trimmedTitle === '' ? null : trimmedTitle, body: trimmedBody });
      setTitle('');
      setBody('');
      onCreated();
    } catch (caught) {
      // 429 dahil: sunucunun mesajı aynen gösterilir, limit istemcide
      // tekrarlanmaz.
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="rounded-card border border-border bg-surface p-6">
      <h2 className="text-base font-semibold">Not ekle</h2>
      <p className="mt-1 max-w-xl text-sm text-fg-muted">
        Eklediğiniz her not kurumsal hafızaya girer ve sorularınızda bağlam olarak kullanılır.
      </p>

      <form
        className="mt-5 flex flex-col gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <FormError message={error} />

        <Field label="Başlık (opsiyonel)" htmlFor="note-title">
          <Input
            id="note-title"
            value={title}
            placeholder="Örn. Fatura süreci"
            autoComplete="off"
            onChange={(event) => {
              setTitle(event.target.value);
            }}
          />
        </Field>

        <Field label="Not" htmlFor="note-body">
          <textarea
            id="note-body"
            value={body}
            rows={5}
            placeholder="Ne kaydetmek istersiniz?"
            onChange={(event) => {
              setBody(event.target.value);
            }}
            className="w-full rounded-lg border border-border bg-bg px-3.5 py-2.5 text-sm text-fg placeholder:text-fg-muted transition-colors outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 disabled:opacity-60"
          />
        </Field>

        <Button type="submit" loading={loading} disabled={body.trim() === ''}>
          Kaydet
        </Button>
      </form>
    </section>
  );
}
