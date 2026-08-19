'use client';

import type { DocumentRow } from '@business-os/contracts';
import { useCallback, useEffect, useState } from 'react';

import { EmptyState, Pager, PillButton, RISE } from '@/components/module-kit/chrome';
import { TextField, SelectField } from '@/components/module-kit/form-kit';
import {
  CardHeader,
  CardMeta,
  CardTitleLink,
  RecordCard,
} from '@/components/module-kit/record-card';
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
import { listContacts } from '@/lib/api/crm';
import { listDocuments, uploadDocument } from '@/lib/api/documents';
import { errorMessage } from '@/lib/api/error-message';
import { listProjects } from '@/lib/api/projects';
import { formatBytes, IndexPill, TypePill, UnsearchableNote } from './chrome';
import { DocumentUpload, UPLOAD_STATUS_MESSAGES, type UploadLinkOption } from './document-upload';
import { DocumentsWall } from './documents-wall';

export const PAGE_SIZE = 20;

/**
 * BELGELER ODASI — arşivin tek listesi (ADR-0037 §11).
 *
 * Üstte duvar ("kaç belgem var, kaçı aranamıyor"), altta tezgah (liste +
 * filtreler + yükleme). ADR-0038'in oda düzeni: `ModuleHeader`/`ModuleBody`
 * EMEKLİ, `RoomTop` + `Wall` + `Desk` tek ızgarayı paylaşır.
 *
 * ⚠️ FİLTRELER SUNUCUDA (ADR-0037 §10). Randevu'nun "kişi filtresi istemcide"
 * bilinen sınırına DÜŞÜLMEDİ: orada filtre uç listesini bir arayüz ihtiyacı
 * yüzünden genişletmek olurdu, burada filtre modülün BİRİNCİL okuma yoludur —
 * bir arşiv filtresiz kullanılamaz ve uç onu ilk günden taşıyor.
 */
export function DocumentsListScreen() {
  const [items, setItems] = useState<readonly DocumentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [label, setLabel] = useState('');
  const [contactId, setContactId] = useState('');
  const [projectId, setProjectId] = useState('');

  const [uploading, setUploading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  /** Son yüklemenin parça sayısı — `0` ise kullanıcıya AÇIKÇA söylenir. */
  const [lastUpload, setLastUpload] = useState<{ name: string; chunkCount: number } | null>(null);

  const [contacts, setContacts] = useState<readonly UploadLinkOption[]>([]);
  const [projects, setProjects] = useState<readonly UploadLinkOption[]>([]);

  /**
   * Bağlantı seçeneklerini BİR KEZ yükler.
   *
   * ⚠️ Hata SESSİZCE yutulur ve bu bilinçli: `contact:read` / `project:read`
   * taşımayan bir kullanıcı listeleri göremez ama BELGE YÜKLEYEBİLMELİDİR.
   * Hata gösterilseydi, hiçbir şeyi engellemeyen bir uyarı ekranda dururdu.
   */
  useEffect(() => {
    listContacts({ limit: 100, offset: 0 })
      .then((page) => {
        setContacts(page.items.map((row) => ({ value: row.id, label: row.fullName })));
      })
      .catch(() => {
        setContacts([]);
      });

    listProjects({ limit: 100, offset: 0 })
      .then((page) => {
        setProjects(page.items.map((row) => ({ value: row.id, label: row.name })));
      })
      .catch(() => {
        setProjects([]);
      });
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);

    // ⚠️ Alanlar KOŞULLU eklenir, `undefined` ATANMAZ:
    // `exactOptionalPropertyTypes` altında "alan yok" ile "alan var ama
    // undefined" AYRI tiplerdir.
    listDocuments({
      limit: PAGE_SIZE,
      offset,
      ...(label.trim() === '' ? {} : { label: label.trim() }),
      ...(contactId === '' ? {} : { contactId }),
      ...(projectId === '' ? {} : { projectId }),
    })
      .then((page) => {
        if (!active) {
          return;
        }
        setItems(page.items);
        setTotal(page.total);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(errorMessage(caught));
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [offset, label, contactId, projectId, reloadToken]);

  const upload = useCallback(
    (input: { file: File; label: string; contactId: string; projectId: string }) => {
      setUploading(true);
      setUploadError(null);

      uploadDocument({
        file: input.file,
        ...(input.label.trim() === '' ? {} : { label: input.label.trim() }),
        ...(input.contactId === '' ? {} : { contactId: input.contactId }),
        ...(input.projectId === '' ? {} : { projectId: input.projectId }),
      })
        .then((result) => {
          setUploadOpen(false);
          // ⚠️ ADR-0037 §6.3: `chunkCount` HEMEN gösterilir. Kullanıcı "yüklendi
          // ama aranamıyor" durumunu aylar sonra değil O ANDA öğrenmelidir.
          setLastUpload({
            name: result.document.originalFilename,
            chunkCount: result.chunkCount,
          });
          setOffset(0);
          setReloadToken((token) => token + 1);
        })
        .catch((caught: unknown) => {
          // ⚠️ Sunucunun mesajı ÖNCELİKLİDİR (backend 413/415/422'de anlaşılır
          // metin üretiyor — ADR-0037 §9); `UPLOAD_STATUS_MESSAGES` yalnızca
          // gövdesiz bir cevap gelirse devreye girer.
          setUploadError(errorMessage(caught, undefined, UPLOAD_STATUS_MESSAGES));
        })
        .finally(() => {
          setUploading(false);
        });
    },
    [],
  );

  const filtersActive = label.trim() !== '' || contactId !== '' || projectId !== '';

  return (
    <Room>
      <RoomScroll>
        <RoomTop
          name="Belgeler"
          meta={`${String(total)} belge`}
          action={
            <PillButton
              onClick={() => {
                setUploadError(null);
                setUploadOpen((open) => !open);
              }}
            >
              {uploadOpen ? 'Kapat' : 'Belge yükle'}
            </PillButton>
          }
        />

        <DocumentsWall total={total} items={items} loading={loading} />

        <Desk>
          <DeskHead title="Arşiv" />
          <DeskBody>
            {error === null ? null : <FormError message={error} />}

            {/*
              ⚠️ SON YÜKLEMENİN SONUCU — ADR-0037 §6.3'ün arayüz yükümlülüğü.
              `chunkCount: 0` bir hata değildir (taranmış PDF'te metin gerçekten
              yoktur) ama SÖYLENMEK ZORUNDADIR; yoksa kullanıcı belgesinin
              aranabilir olmadığını hiç öğrenemez.
            */}
            {lastUpload === null ? null : (
              <Rise delay={RISE.body}>
                <div
                  className={[
                    'rounded-card border px-3.5 py-2.5',
                    lastUpload.chunkCount === 0
                      ? 'border-danger/30 bg-danger/10'
                      : 'border-border bg-sunken',
                  ].join(' ')}
                >
                  <p className="text-[12.5px] font-semibold text-fg">
                    {lastUpload.chunkCount === 0
                      ? `"${lastUpload.name}" yüklendi — ancak metni okunamadı.`
                      : `"${lastUpload.name}" yüklendi ve arama için ${String(lastUpload.chunkCount)} parçaya ayrıldı.`}
                  </p>
                  {lastUpload.chunkCount === 0 ? <UnsearchableNote compact /> : null}
                </div>
              </Rise>
            )}

            {uploadOpen ? (
              <DocumentUpload
                contacts={contacts}
                projects={projects}
                pending={uploading}
                error={uploadError}
                onSubmit={upload}
                onCancel={() => {
                  setUploadOpen(false);
                }}
              />
            ) : null}

            <Rise delay={RISE.body}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <TextField
                  id="filter-label"
                  label="Etiket"
                  value={label}
                  onChange={(next) => {
                    setOffset(0);
                    setLabel(next);
                  }}
                  placeholder="sözleşme"
                  hint="Büyük/küçük harf ayrımı yok."
                />
                <SelectField
                  id="filter-contact"
                  label="Kişi"
                  value={contactId}
                  onChange={(next) => {
                    setOffset(0);
                    setContactId(next);
                  }}
                  options={[{ value: '', label: 'Tüm kişiler' }, ...contacts]}
                />
                <SelectField
                  id="filter-project"
                  label="Proje"
                  value={projectId}
                  onChange={(next) => {
                    setOffset(0);
                    setProjectId(next);
                  }}
                  options={[{ value: '', label: 'Tüm projeler' }, ...projects]}
                />
              </div>
            </Rise>

            {loading ? (
              <DeskSkeleton />
            ) : items.length === 0 ? (
              <EmptyState
                title="Belge yok"
                hint={
                  filtersActive
                    ? 'Seçtiğiniz filtrelerle eşleşen belge bulunamadı.'
                    : 'Henüz belge yüklenmedi. PDF veya Word dosyalarınızı yükleyin.'
                }
              />
            ) : (
              <Rise delay={RISE.body}>
                <div className="flex flex-col gap-2">
                  {items.map((row) => (
                    <RecordCard key={row.id}>
                      <CardHeader>
                        <CardTitleLink href={`/app/documents/${row.id}`}>
                          {row.originalFilename}
                        </CardTitleLink>
                        <TypePill mimeType={row.mimeType} />
                        <IndexPill chunkCount={row.chunkCount} />
                      </CardHeader>

                      {/*
                        ⚠️ Ad çözülemezse HİÇBİR ŞEY yazılmaz — "silinmiş" bile:
                        null'ın üç sebebi (bağlı değil · silinmiş · izin yok)
                        AYIRT EDİLMEZ ve "silinmiş" demek bir kaydın bir
                        zamanlar var olduğunu sızdırırdı (ADR-0037 §4).
                      */}
                      <CardMeta
                        items={[
                          row.label,
                          row.contactName,
                          row.projectName,
                          formatBytes(row.sizeBytes),
                          new Date(row.createdAt).toLocaleDateString('tr-TR', {
                            dateStyle: 'medium',
                          }),
                        ]}
                      />
                    </RecordCard>
                  ))}
                </div>
              </Rise>
            )}

            <Pager
              offset={offset}
              count={items.length}
              total={total}
              loading={loading}
              onPrevious={() => {
                setOffset((current) => Math.max(0, current - PAGE_SIZE));
              }}
              onNext={() => {
                setOffset((current) => current + PAGE_SIZE);
              }}
            />
          </DeskBody>
        </Desk>
      </RoomScroll>
    </Room>
  );
}
