'use client';

import {
  DOCUMENT_TYPE_LABELS,
  MAX_DOCUMENT_LABEL_CHARS,
  type DocumentRow,
} from '@business-os/contracts';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { EmptyState, PillButton, PrimaryButton, RISE } from '@/components/module-kit/chrome';
import { ConfirmDelete } from '@/components/module-kit/confirm-delete';
import { FieldGrid, FormActions, GhostButton, TextField } from '@/components/module-kit/form-kit';
import { Rise } from '@/components/panel/stream';
import {
  Desk,
  DeskBody,
  DeskHead,
  DeskSkeleton,
  Room,
  RoomScroll,
  RoomTop,
} from '@/components/room/room';
import { FormError } from '@/components/ui/form-error';
import { deleteDocument, downloadDocument, getDocument, updateDocument } from '@/lib/api/documents';
import { errorMessage } from '@/lib/api/error-message';
import { formatBytes, IndexPill, TypePill, UnsearchableNote } from './chrome';

/**
 * BELGE DETAYI — indirme · etiket düzenleme · silme (ADR-0037 §11).
 *
 * ============================================================================
 * ⚠️ BU EKRANIN DUVARI YOKTUR — ve bu ADR-0038'in kuralıdır
 * ============================================================================
 * _"Detay sayfalarının duvarı YOKTUR — özetlenecek bir durum değil, tek bir
 * kayıt var."_ Bir duvar burada kendi kendini tekrar ederdi: kahraman rakam
 * neyin toplamı olacaktı?
 *
 * `RoomTop` + `Desk` kalır; `Wall` yoktur.
 *
 * ============================================================================
 * ⚠️ DOSYA DEĞİŞTİRME BU EKRANDA YOK — ve bu bilinçli bir kapsam kararı
 * ============================================================================
 * `PUT /documents/:id/file` ucu backend'de VAR (ADR-0037 §7) ama arayüzü bu
 * slice'a alınmadı. Sebep, ucun kendisinin taşıdığı geri alınamazlıktır: eski
 * dosya ve TÜM parçaları silinir, geri getirilemez.
 *
 * Bunu bir arayüze koymak, "yanlışlıkla tıklanabilir bir yok etme" demektir ve
 * doğru tasarımı (iki aşamalı onay + farkın gösterilmesi) tek başına bir iştir.
 * Silme de geri alınamaz ama kullanıcı NE yaptığını bilir; dosya değişiminde
 * "eskisi ne olacak" sorusu görünmez.
 *
 * ⚠️ Bu, kayıtlı bir bilinen sınırdır — uç ölü değil, arayüzü yok.
 */
export function DocumentDetailScreen({ documentId }: { documentId: string }) {
  const router = useRouter();

  const [row, setRow] = useState<DocumentRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);

    getDocument(documentId)
      .then((found) => {
        if (!active) {
          return;
        }
        setRow(found);
        setLabel(found.label ?? '');
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!active) {
          return;
        }
        setNotFound(true);
        setError(errorMessage(caught));
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [documentId]);

  const save = useCallback(() => {
    setSaving(true);

    // ⚠️ Boş etiket `null` GÖNDERİR ("temizle"), boş dize DEĞİL: sunucu
    // "girilmedi" ile "boş girildi"yi aynı sayar ve `null` niyeti açıkça
    // yazar (ADR-0037 §2, §10).
    updateDocument(documentId, { label: label.trim() === '' ? null : label.trim() })
      .then((result) => {
        // ⚠️ Etiket değişimi sunucuda PARÇALARI YENİDEN ÜRETİR (etiket bağlam
        // başlığının parçasıdır — §8.1). Dönen `chunkCount` bu yüzden yeni
        // değeri taşır ve ekranda tazelenir.
        setRow((current) =>
          current === null
            ? current
            : { ...current, label: result.document.label, chunkCount: result.chunkCount },
        );
        setEditing(false);
        setError(null);
      })
      .catch((caught: unknown) => {
        setError(errorMessage(caught));
      })
      .finally(() => {
        setSaving(false);
      });
  }, [documentId, label]);

  const download = useCallback(() => {
    if (row === null) {
      return;
    }
    setDownloading(true);

    downloadDocument(row.id, row.originalFilename)
      .catch((caught: unknown) => {
        setError(errorMessage(caught));
      })
      .finally(() => {
        setDownloading(false);
      });
  }, [row]);

  const remove = useCallback(() => {
    deleteDocument(documentId)
      .then(() => {
        router.push('/app/documents');
      })
      .catch((caught: unknown) => {
        setError(errorMessage(caught));
        setConfirming(false);
      });
  }, [documentId, router]);

  if (loading) {
    return (
      <Room>
        <RoomScroll>
          <RoomTop name="Belge" />
          <Desk>
            <DeskBody>
              <DeskSkeleton />
            </DeskBody>
          </Desk>
        </RoomScroll>
      </Room>
    );
  }

  if (row === null || notFound) {
    return (
      <Room>
        <RoomScroll>
          <RoomTop name="Belge" />
          <Desk>
            <DeskBody>
              <EmptyState
                title="Belge bulunamadı"
                hint="Kayıt silinmiş olabilir ya da erişiminiz yok."
              />
            </DeskBody>
          </Desk>
        </RoomScroll>
      </Room>
    );
  }

  const labelTooLong = label.length > MAX_DOCUMENT_LABEL_CHARS;

  return (
    <Room>
      <RoomScroll>
        <RoomTop
          name={row.originalFilename}
          meta={`${DOCUMENT_TYPE_LABELS[row.mimeType]} · ${formatBytes(row.sizeBytes)}`}
          action={
            <PillButton onClick={download} disabled={downloading}>
              {downloading ? 'İndiriliyor…' : 'İndir'}
            </PillButton>
          }
        />

        <Desk>
          <DeskHead title="Belge bilgileri" />
          <DeskBody>
            {error === null ? null : <FormError message={error} />}

            <Rise delay={RISE.body}>
              <div className="flex flex-wrap items-center gap-2">
                <TypePill mimeType={row.mimeType} />
                <IndexPill chunkCount={row.chunkCount} />
              </div>
            </Rise>

            {/* ⚠️ ADR-0037 §6.3 — detayda TAM açıklama verilir. */}
            {row.chunkCount === 0 ? (
              <Rise delay={RISE.body}>
                <div className="rounded-card border border-danger/30 bg-danger/10 px-3.5 py-2.5">
                  <UnsearchableNote compact />
                </div>
              </Rise>
            ) : null}

            <Rise delay={RISE.body}>
              <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Detail term="Etiket" value={row.label} />
                {/*
                  ⚠️ Bağlı kayıt adı yoksa "—" yazılır, "silinmiş" DEĞİL: üç
                  sebep (bağlı değil · silinmiş · izin yok) ayırt edilmez.
                */}
                <Detail term="Kişi" value={row.contactName} />
                <Detail term="Proje" value={row.projectName} />
                <Detail
                  term="Yüklendi"
                  value={new Date(row.createdAt).toLocaleString('tr-TR', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                />
              </dl>
            </Rise>

            {editing ? (
              <Rise delay={RISE.body}>
                <FieldGrid>
                  <TextField
                    id="document-label-edit"
                    label="Etiket"
                    value={label}
                    onChange={setLabel}
                    disabled={saving}
                    placeholder="sözleşme, teklif, şartname…"
                    hint="Boş bırakırsanız etiket kaldırılır."
                    error={
                      labelTooLong ? `En fazla ${String(MAX_DOCUMENT_LABEL_CHARS)} karakter` : null
                    }
                  />
                </FieldGrid>
                <FormActions>
                  <GhostButton
                    onClick={() => {
                      setLabel(row.label ?? '');
                      setEditing(false);
                    }}
                    disabled={saving}
                  >
                    Vazgeç
                  </GhostButton>
                  <PrimaryButton onClick={save} disabled={saving || labelTooLong}>
                    {saving ? 'Kaydediliyor…' : 'Kaydet'}
                  </PrimaryButton>
                </FormActions>
              </Rise>
            ) : (
              <Rise delay={RISE.body}>
                <div className="flex flex-wrap gap-2">
                  <PillButton
                    onClick={() => {
                      setEditing(true);
                    }}
                  >
                    Etiketi düzenle
                  </PillButton>
                  <PillButton
                    onClick={() => {
                      setConfirming(true);
                    }}
                  >
                    Sil
                  </PillButton>
                </div>
              </Rise>
            )}

            {confirming ? (
              <ConfirmDelete
                // ⚠️ Silme İKİ KAT geri alınamaz: DB satırı VE R2'deki nesne
                // gider, denetim izi YOKTUR (ADR-0037 §1, §5.3). Soru bunu
                // açıkça söyler.
                question="Bu belge ve dosyası kalıcı olarak silinsin mi? Bu işlem geri alınamaz."
                ariaLabel="Belgeyi sil"
                onConfirm={remove}
              />
            ) : null}
          </DeskBody>
        </Desk>
      </RoomScroll>
    </Room>
  );
}

/** Tek satırlık künye alanı; değer yoksa "—". */
function Detail({ term, value }: { term: string; value: string | null }) {
  return (
    <div>
      <dt className="font-mono text-[8.5px] font-semibold tracking-[0.17em] text-fg-3 uppercase">
        {term}
      </dt>
      <dd className="mt-0.5 text-[13px] text-fg">{value ?? '—'}</dd>
    </div>
  );
}
