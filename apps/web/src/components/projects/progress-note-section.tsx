'use client';

import type { ProgressNote } from '@business-os/contracts';
import { useState } from 'react';

import { EmptyState, PrimaryButton, SectionLabel } from '@/components/module-kit/chrome';
import { FormActions, GhostButton, TextAreaField } from '@/components/module-kit/form-kit';
import { StreamEntry } from '@/components/panel/stream';
import { localRelativeWhen } from '@/lib/format/datetime';

/**
 * İlerleme notu akışı ve yazma alanı.
 *
 * ============================================================================
 * ⚠️ VARYANT `you`, `ai` DEĞİL — VE SERİF YOK
 * ============================================================================
 * İlerleme notunu yazan İNSANDIR. Dolu terracotta nokta ve serif "ses",
 * sistemde AI'a ayrılmıştır (FRONTEND_ARCHITECTURE §4.5); kullanıcının kendi
 * yazdığı metni o sesle çizmek, onu asistanın söylediği bir şey sanmasına yol
 * açardı. `InteractionStream`'in birebir aynı kararı.
 *
 * ⚠️ Projeler'de modül içi AI yüzeyi YOKTUR (ADR-0033 §10) — yani bu ekranda
 * terracotta hiç görünmez ve bu DOĞRUDUR. Modül rengi zeytindir; terracotta
 * eklendiği gün yalnızca AI'ın konuştuğu yerde belirir.
 *
 * ============================================================================
 * TARİH: `createdAt` — VE BU CRM'DEN FARKLI
 * ============================================================================
 * `InteractionStream` `occurredOn` kullanır çünkü bir görüşme günler sonra
 * yazılabilir. İlerleme notunun böyle bir alanı YOKTUR (ADR-0033 §1): akan bir
 * günlüktür, yazıldığı an kayıt anıdır. Bu yüzden AN biçimlenir (saat dahil),
 * takvim günü değil.
 */
export function ProgressNoteSection({
  notes,
  readOnly,
  busy,
  error,
  onCreate,
}: {
  notes: readonly ProgressNote[];
  readOnly: boolean;
  busy: boolean;
  error: string | null;
  onCreate: (body: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);

  function submit(): void {
    const body = draft.trim();
    if (body === '') {
      return;
    }
    onCreate(body);
    setDraft('');
    setOpen(false);
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <SectionLabel>İlerleme notları</SectionLabel>
        {readOnly || open ? null : (
          <PrimaryButton
            onClick={() => {
              setOpen(true);
            }}
          >
            Not ekle
          </PrimaryButton>
        )}
      </div>

      {open ? (
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          className="rounded-card border border-border bg-raised p-5 shadow-float"
        >
          <TextAreaField
            id="progress-note-body"
            label="Ne oldu?"
            rows={4}
            value={draft}
            onChange={setDraft}
            error={error}
            placeholder="Örn. Tasarım onaylandı, kodlamaya geçildi."
            hint="Yazdığınız her notu yapay zekâ okur ve sorularınızda kullanır."
            disabled={busy}
          />

          <FormActions>
            <GhostButton
              onClick={() => {
                setOpen(false);
                setDraft('');
              }}
              disabled={busy}
            >
              Vazgeç
            </GhostButton>
            <PrimaryButton type="submit" disabled={busy || draft.trim() === ''}>
              {busy ? 'Kaydediliyor…' : 'Notu kaydet'}
            </PrimaryButton>
          </FormActions>
        </form>
      ) : null}

      {notes.length === 0 ? (
        <EmptyState
          title="Henüz not yok"
          hint={
            readOnly
              ? 'Ekibinizden biri not yazdığında burada görünecek.'
              : 'Projede ne olduğunu buraya yazın. Notlar yapay zekânın hafızasına girer; "bu projede ne oldu?" diye sorabilirsiniz.'
          }
        />
      ) : (
        <div>
          {notes.map((note, index) => (
            <StreamEntry
              key={note.id}
              when={localRelativeWhen(note.createdAt)}
              variant="you"
              last={index === notes.length - 1}
            >
              <p className="text-[13.5px] leading-[1.65] whitespace-pre-wrap text-fg">
                {note.body}
              </p>
            </StreamEntry>
          ))}
        </div>
      )}
    </section>
  );
}
