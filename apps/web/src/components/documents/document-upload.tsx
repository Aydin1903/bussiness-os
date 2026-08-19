'use client';

import {
  DOCUMENT_ACCEPT,
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENT_LABEL_CHARS,
} from '@business-os/contracts';
import { useRef, useState, type DragEvent } from 'react';

import { PrimaryButton } from '@/components/module-kit/chrome';
import {
  FieldGrid,
  FormActions,
  GhostButton,
  InlinePanel,
  SelectField,
  TextField,
} from '@/components/module-kit/form-kit';
import { FormError } from '@/components/ui/form-error';
import { formatBytes } from './chrome';

/**
 * Belge yükleme formu — SÜRÜKLE-BIRAK + etiket + iki bağımsız bağlantı.
 *
 * ============================================================================
 * ⚠️ PROJEDEKİ İLK DOSYA YÜKLEME YÜZEYİ
 * ============================================================================
 * Bugüne kadar her form JSON gönderiyordu. ADR-0037 §11 bu yüzeyin üç gerçek
 * yükümlülüğünü yazdı ve üçü de burada:
 *
 *   1. SINIRLAR ÖNCEDEN GÖSTERİLİR — kabul edilen türler ve boyut, dosya
 *      seçilmeden önce ekranda yazar. 20 MB'lik bir dosyayı yükleyip **413**
 *      almak, dakikalarca süren bir yüklemeyi çöpe atmaktır.
 *   2. İLERLEME GÖRÜNÜR — geri bildirimsiz bir bekleyiş kullanıcıyı ikinci kez
 *      göndermeye iter ve ortaya İKİ KOPYA çıkar (ki burada ikinci kopya
 *      ikinci bir R2 nesnesi, yani ikinci bir fatura kalemidir).
 *   3. `chunkCount: 0` SÖYLENİR — çağıran ekranın işi (`documents-list-screen`).
 *
 * ============================================================================
 * ⚠️ İSTEMCİ KONTROLÜ BİR KOLAYLIKTIR, GÜVENLİK SINIRI DEĞİL
 * ============================================================================
 * Burada YALNIZCA boyut ve uzantı bakılır. Tür tespiti sunucuda İÇERİKTEN
 * yapılır (ADR-0037 §6.1) ve son sözü o söyler — `sozlesme.pdf` adlı bir dosya
 * PDF olmak zorunda değildir.
 *
 * Yani buradaki kontroller kullanıcıyı BEKLEMEKTEN kurtarır; sunucunun
 * 413/415/422'si her koşulda ayakta kalır ve mesajları olduğu gibi gösterilir.
 */

/** Sunucunun ürettiği mesaj gelmezse kullanılacak yedekler (ADR-0037 §9). */
export const UPLOAD_STATUS_MESSAGES: Readonly<Record<number, string>> = {
  413: `Dosya çok büyük. En fazla ${formatBytes(MAX_DOCUMENT_BYTES)} olabilir.`,
  415: 'Yalnızca PDF ve Word (.docx) dosyaları yüklenebilir.',
  422: 'Belge çok uzun; arama için parçalanamadı. Belgeyi bölerek yükleyin.',
  429: 'Saatlik yükleme hakkınız doldu. Bir süre sonra tekrar deneyin.',
};

/** Uzantı ön kontrolü — sunucunun içerik tespitinin YERİNE GEÇMEZ. */
function looksSupported(file: File): boolean {
  const name = file.name.toLocaleLowerCase('tr');
  return name.endsWith('.pdf') || name.endsWith('.docx');
}

export interface UploadLinkOption {
  readonly value: string;
  readonly label: string;
}

export function DocumentUpload({
  contacts,
  projects,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  readonly contacts: readonly UploadLinkOption[];
  readonly projects: readonly UploadLinkOption[];
  readonly pending: boolean;
  readonly error: string | null;
  readonly onSubmit: (input: {
    file: File;
    label: string;
    contactId: string;
    projectId: string;
  }) => void;
  readonly onCancel: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState('');
  const [contactId, setContactId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  /** Tek giriş noktası: hem seçici hem sürükle-bırak buradan geçer. */
  const accept = (next: File | undefined) => {
    if (next === undefined) {
      return;
    }

    if (!looksSupported(next)) {
      setLocalError(UPLOAD_STATUS_MESSAGES[415] ?? 'Desteklenmeyen dosya türü.');
      setFile(null);
      return;
    }

    // ⚠️ BOYUT SEÇİLİR SEÇİLMEZ bakılır — yükleme BAŞLAMADAN. Sunucuya
    // gönderip 413 beklemek, kullanıcının bağlantısını boşuna harcamaktır.
    if (next.size > MAX_DOCUMENT_BYTES) {
      setLocalError(UPLOAD_STATUS_MESSAGES[413] ?? 'Dosya çok büyük.');
      setFile(null);
      return;
    }

    setLocalError(null);
    setFile(next);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    accept(event.dataTransfer.files[0]);
  };

  const labelTooLong = label.length > MAX_DOCUMENT_LABEL_CHARS;
  const blocked = pending || file === null || labelTooLong;

  return (
    <InlinePanel title="Belge yükle">
      {error === null ? null : <FormError message={error} />}
      {localError === null ? null : <FormError message={localError} />}

      {/*
        ⚠️ SÜRÜKLE-BIRAK TEK YOL DEĞİL: alan aynı zamanda bir düğmedir ve
        klavyeyle çalışır. Yalnızca sürüklemeye izin veren bir yüzey, fare
        kullanamayan kullanıcı için modülü TÜMÜYLE kapatırdı.
      */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Dosya seç veya sürükleyip bırak"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => {
          setDragging(false);
        }}
        onDrop={onDrop}
        className={[
          'flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-card border border-dashed px-4 py-7 text-center transition-colors',
          dragging ? 'border-accent bg-tint' : 'border-border-strong bg-sunken hover:border-accent',
        ].join(' ')}
      >
        {file === null ? (
          <>
            <p className="text-[13px] font-semibold text-fg">
              Dosyayı buraya sürükleyin veya seçmek için tıklayın
            </p>
            {/*
              ⚠️ SINIRLAR SEÇİM ÖNCESİ YAZILI (ADR-0037 §11) — sonradan 413/415
              göstermek, kullanıcıyı boşuna bekletmektir.
            */}
            <p className="text-[11.5px] text-fg-3">
              PDF veya Word (.docx) · en fazla {formatBytes(MAX_DOCUMENT_BYTES)}
            </p>
          </>
        ) : (
          <>
            <p className="max-w-full truncate text-[13px] font-semibold text-ink">{file.name}</p>
            <p className="text-[11.5px] text-fg-3">
              {formatBytes(file.size)} · değiştirmek için tıklayın
            </p>
          </>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={DOCUMENT_ACCEPT}
        className="hidden"
        disabled={pending}
        onChange={(event) => {
          accept(event.target.files?.[0]);
          // Aynı dosya art arda seçilebilsin diye girdiyi sıfırla: aksi halde
          // ikinci `change` olayı hiç tetiklenmezdi.
          event.target.value = '';
        }}
      />

      <FieldGrid>
        {/*
          ⚠️ ETİKET SERBEST METİN (ADR-0037 §2) — açılır liste DEĞİL. Sabit bir
          sözlük kullanıcıyı SAHTE KATEGORİYE iter ve o etiket bağlam başlığına
          girip AI'a yanlış bilgi öğretirdi.
        */}
        <TextField
          id="document-label"
          label="Etiket"
          value={label}
          onChange={setLabel}
          disabled={pending}
          placeholder="sözleşme, teklif, şartname…"
          hint="Kendi kelimenizi yazın; sabit bir liste yok."
          error={labelTooLong ? `En fazla ${String(MAX_DOCUMENT_LABEL_CHARS)} karakter` : null}
        />

        {/*
          ⚠️ İKİ BAĞLANTI BAĞIMSIZDIR (ADR-0037 §4): bir belge ikisine birden,
          yalnızca birine ya da HİÇBİRİNE bağlanabilir. Bu yüzden iki AYRI
          seçici var ve hiçbiri diğerini zorunlu kılmıyor — bir şirket ana kira
          sözleşmesi hiçbirine ait değildir.
        */}
        <SelectField
          id="document-contact"
          label="Kişi (opsiyonel)"
          value={contactId}
          onChange={setContactId}
          disabled={pending}
          options={[{ value: '', label: 'Bağlantısız' }, ...contacts]}
        />

        <SelectField
          id="document-project"
          label="Proje (opsiyonel)"
          value={projectId}
          onChange={setProjectId}
          disabled={pending}
          options={[{ value: '', label: 'Bağlantısız' }, ...projects]}
        />
      </FieldGrid>

      <FormActions>
        <GhostButton
          onClick={() => {
            onCancel();
          }}
          disabled={pending}
        >
          Vazgeç
        </GhostButton>
        <PrimaryButton
          onClick={() => {
            if (file !== null) {
              onSubmit({ file, label, contactId, projectId });
            }
          }}
          disabled={blocked}
        >
          {/* ⚠️ İLERLEME GÖRÜNÜR (ADR-0037 §11): sessiz bir bekleyiş ikinci bir
              gönderime ve mükerrer kayda yol açar. */}
          {pending ? 'Yükleniyor…' : 'Yükle'}
        </PrimaryButton>
      </FormActions>
    </InlinePanel>
  );
}
