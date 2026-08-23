'use client';

import {
  MAX_DOCUMENT_LINES,
  MAX_LINE_DESCRIPTION_CHARS,
  MAX_LINE_UNIT_CHARS,
  type SalesDocumentLineInput,
} from '@business-os/contracts';

import { GhostButton, TextField } from '@/components/module-kit/form-kit';

/**
 * SATIR KALEMLERİ DÜZENLEYİCİSİ (ADR-0041 §1).
 *
 * ============================================================================
 * ⚠️ SATIRLAR BÜTÜN OLARAK YAZILIR — tek tek DEĞİL (§2)
 * ============================================================================
 * Bu bileşen bir satır listesi tutar ve çağıran onu `lines` alanında BİR BÜTÜN
 * olarak gönderir. Satır bazlı bir uç (`PATCH /lines/:id`) YOKTUR ve olmamalı:
 * değiştirilebilirliğin tek kapısı BELGENİN DURUMUDUR ve satır bazlı bir yol o
 * kapıyı ATLAYAN ikinci bir yol açardı.
 *
 * ============================================================================
 * ⚠️ SIRA İSTEKTEKİ SIRADAN GELİR — `position` GÖNDERİLMEZ
 * ============================================================================
 * İstemciye bırakılsaydı iki satır aynı sırayı taşıyabilir ya da boşluk
 * bırakabilirdi — belgede açıklanamaz bir numaralandırma. Sunucu sırayı
 * dizinin kendisinden türetir.
 *
 * ============================================================================
 * ⚠️ BU BİLEŞEN TOPLAM HESAPLAMAZ
 * ============================================================================
 * Ne satır toplamı ne genel toplam. Sunucu onları `totals` altında döndürür
 * (§1.3) ve istemcide ikinci bir aritmetik, SATIR BAZINDA YUVARLAMA kuralının
 * (`document-money.ts`) ikinci bir uygulaması olurdu. İki aritmetik zamanla
 * AYRIŞIR ve hata SESSİZDİR: formda yazan toplam ile belgede yazan toplam
 * farklı olur, ikisi de "doğru" görünür.
 *
 * ⚠️ Bedeli açıkça: kullanıcı kaydetmeden toplamı GÖREMEZ. Kabul edildi —
 * yanlış bir toplam göstermektense hiç göstermemek yeğdir.
 *
 * ============================================================================
 * ⚠️ SERBEST METİN — stok kalemi seçici YOKTUR (§7.3)
 * ============================================================================
 * Bir "kalem seç" açılır listesi CAZİPTİR ve v1'de REDDEDİLDİ: bağlantının
 * doğal beklentisi STOK DÜŞÜLMESİDİR ve o, bu modülün envanterin
 * doğruluğundan sorumlu olması demektir. Ayrıca bir danışmanlık saati ya da
 * kargo bedeli bir stok kalemi DEĞİLDİR — seçici zorunlu olsaydı kullanıcıyı
 * envantere SAHTE KALEM açmaya iterdi.
 */
export interface LineDraft {
  readonly description: string;
  readonly quantity: string;
  readonly unit: string;
  readonly unitPrice: string;
  readonly taxRate: string;
}

export function emptyLine(): LineDraft {
  return { description: '', quantity: '1', unit: '', unitPrice: '', taxRate: '20' };
}

/**
 * Taslak satırları isteğe çevirir.
 *
 * ⚠️ TÜMÜYLE BOŞ SATIRLAR DÜŞÜRÜLÜR: kullanıcı bir satır ekleyip vazgeçtiğinde
 * form onu sessizce göndermemelidir — sunucu boş açıklamayı 422 ile reddeder
 * ve kullanıcı neyi düzelteceğini anlamazdı.
 *
 * ⚠️ Kısmen dolu satırlar DÜŞÜRÜLMEZ: onlar bir hatadır ve sunucudan gelen 422
 * doğru cevaptır. Sessizce atmak, kullanıcının yazdığı bir satırı yok etmek
 * olurdu.
 */
export function toLineInputs(lines: readonly LineDraft[]): SalesDocumentLineInput[] {
  return lines
    .filter((line) => !isBlank(line))
    .map((line) => ({
      description: line.description.trim(),
      quantity: line.quantity.trim(),
      unitPrice: line.unitPrice.trim(),
      ...(line.unit.trim() === '' ? {} : { unit: line.unit.trim() }),
      ...(line.taxRate.trim() === '' ? {} : { taxRate: line.taxRate.trim() }),
    }));
}

function isBlank(line: LineDraft): boolean {
  return line.description.trim() === '' && line.unitPrice.trim() === '' && line.unit.trim() === '';
}

export function LinesEditor({
  lines,
  onChange,
  disabled = false,
}: {
  readonly lines: readonly LineDraft[];
  readonly onChange: (lines: readonly LineDraft[]) => void;
  readonly disabled?: boolean;
}) {
  function update(index: number, patch: Partial<LineDraft>): void {
    onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function remove(index: number): void {
    onChange(lines.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-mono text-[9.5px] font-medium tracking-[0.09em] text-fg-3 uppercase">
          Kalemler
        </span>
        <span className="text-[11px] text-fg-3">
          {lines.length} / {MAX_DOCUMENT_LINES}
        </span>
      </div>

      {lines.map((line, index) => (
        /*
         * ⚠️ ANAHTAR OLARAK INDEX — ve bu bilinçli.
         *
         * Taslak satırlarının kalıcı bir kimliği YOKTUR: sunucuya yazılana
         * kadar id'siz yaşarlar. Uydurma bir id üretmek (`crypto.randomUUID`)
         * daha "doğru" görünürdü ve YANLIŞ olurdu — satır bir KONUMDUR, bir
         * kayıt değil; sıra değiştiğinde React'in aynı konumu yeniden
         * eşleştirmesi TAM OLARAK istenen davranıştır.
         */
        <div key={index} className="rounded-card border border-border bg-raised p-3">
          <div className="flex flex-col gap-2.5">
            <TextField
              id={`line-${String(index)}-description`}
              label={`${String(index + 1)}. kalem`}
              value={line.description}
              onChange={(value) => {
                update(index, { description: value.slice(0, MAX_LINE_DESCRIPTION_CHARS) });
              }}
              placeholder="M8 civata, paslanmaz"
              disabled={disabled}
            />

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <TextField
                id={`line-${String(index)}-quantity`}
                label="Miktar"
                value={line.quantity}
                onChange={(value) => {
                  update(index, { quantity: value });
                }}
                placeholder="500"
                disabled={disabled}
              />
              <TextField
                id={`line-${String(index)}-unit`}
                label="Birim"
                value={line.unit}
                onChange={(value) => {
                  update(index, { unit: value.slice(0, MAX_LINE_UNIT_CHARS) });
                }}
                placeholder="adet"
                disabled={disabled}
              />
              <TextField
                id={`line-${String(index)}-price`}
                label="Birim fiyat"
                value={line.unitPrice}
                onChange={(value) => {
                  update(index, { unitPrice: value });
                }}
                placeholder="12.50"
                disabled={disabled}
                /*
                 * ⚠️ NEGATİF DEĞER MEŞRUDUR ve ipucu bunu SÖYLER (§1.7): bir
                 * iskonto satırı ("Sadakat indirimi × 1 × -500") gerçek bir
                 * belge satırıdır. Söylenmezse kullanıcı ayrı bir "iskonto"
                 * alanı arar ve bulamaz.
                 */
                {...(index === 0 ? { hint: 'İskonto için eksi değer yazılabilir' } : {})}
              />
              <TextField
                id={`line-${String(index)}-tax`}
                label="Vergi %"
                value={line.taxRate}
                onChange={(value) => {
                  update(index, { taxRate: value });
                }}
                placeholder="20"
                disabled={disabled}
              />
            </div>

            {lines.length > 1 ? (
              <div className="flex justify-end">
                <GhostButton
                  onClick={() => {
                    remove(index);
                  }}
                  disabled={disabled}
                >
                  Kalemi çıkar
                </GhostButton>
              </div>
            ) : null}
          </div>
        </div>
      ))}

      <div>
        <GhostButton
          onClick={() => {
            onChange([...lines, emptyLine()]);
          }}
          disabled={disabled || lines.length >= MAX_DOCUMENT_LINES}
        >
          Kalem ekle
        </GhostButton>
      </div>
    </div>
  );
}
