'use client';

import type { StockItemRow } from '@business-os/contracts';
import { useCallback, useEffect, useState } from 'react';

import { EmptyState, Pager, PillButton, PrimaryButton, RISE } from '@/components/module-kit/chrome';
import { FieldGrid, GhostButton, InlinePanel, TextField } from '@/components/module-kit/form-kit';
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
import { errorMessage } from '@/lib/api/error-message';
import { createStockItem, listStockItems } from '@/lib/api/inventory';
import { formatDate, Quantity, StockLevelPill } from './chrome';
import { InventoryTabs } from './tabs';
import { InventoryWall } from './inventory-wall';

export const PAGE_SIZE = 20;

/**
 * STOK ODASI — kalem listesi (ADR-0039 §11.2).
 *
 * Üstte ORTAK duvar, altta tezgah. İkinci rota (`/inventory/movements`) AYNI
 * duvarı kullanır: ikisi de _"stok durumu ne"_ sorusunu cevaplıyor
 * (ADR-0038 §6.5).
 *
 * ============================================================================
 * ⚠️ MİKTAR SUNUCUDAN GELİR — BU EKRAN ONU HESAPLAMAZ
 * ============================================================================
 * `row.quantity` `movements`tan türetilmiş bir toplamdır (ADR-0039 §2). Bu
 * ekranda hiçbir yerde hareket toplanmaz; toplansaydı YALNIZCA GÖRÜNEN
 * sayfadaki hareketlerden hesaplanır ve YANLIŞ olurdu.
 *
 * ⚠️ ARAMA SUNUCUDA (`search` parametresi). Randevu'nun "kişi filtresi
 * istemcide" bilinen sınırı burada TEKRARLANMADI: envanterde kalem sayısı
 * sayfa sınırını kolayca aşar ve istemci tarafı arama yalnızca görünen sayfaya
 * uygulanırdı — kullanıcı "yok" sanıp AYNI KALEMİ İKİNCİ KEZ açardı ve stok
 * ikiye bölünürdü.
 */
export function ItemsListScreen() {
  const [items, setItems] = useState<readonly StockItemRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [search, setSearch] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);

    // ⚠️ Alanlar KOŞULLU eklenir, `undefined` ATANMAZ:
    // `exactOptionalPropertyTypes` altında "alan yok" ile "alan var ama
    // undefined" AYRI tiplerdir.
    listStockItems({
      limit: PAGE_SIZE,
      offset,
      lowStockOnly,
      includeArchived,
      ...(search.trim() === '' ? {} : { search: search.trim() }),
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
  }, [offset, search, lowStockOnly, includeArchived, reloadToken]);

  const create = useCallback(
    (input: { name: string; sku: string; unit: string; minQuantity: string; note: string }) => {
      setCreating(true);
      setCreateError(null);

      createStockItem({
        name: input.name,
        unit: input.unit,
        // ⚠️ Boş dize `null`a çevrilir, `undefined`a DEĞİL: "SKU yok" bilinçli
        // bir değerdir. `minQuantity` için de aynısı — ve orada fark daha
        // keskin: `null` = izleme yok, `"0"` = tükendiğinde haber ver.
        ...(input.sku.trim() === '' ? {} : { sku: input.sku.trim() }),
        ...(input.minQuantity.trim() === '' ? {} : { minQuantity: input.minQuantity.trim() }),
        ...(input.note.trim() === '' ? {} : { note: input.note.trim() }),
      })
        .then(() => {
          setCreateOpen(false);
          setOffset(0);
          setReloadToken((token) => token + 1);
        })
        .catch((caught: unknown) => {
          setCreateError(errorMessage(caught));
        })
        .finally(() => {
          setCreating(false);
        });
    },
    [],
  );

  const filtersActive = search.trim() !== '' || lowStockOnly || includeArchived;

  return (
    <Room>
      <RoomScroll>
        <RoomTop
          name="Stok"
          meta={`${String(total)} kalem`}
          action={
            <PillButton
              onClick={() => {
                setCreateError(null);
                setCreateOpen((open) => !open);
              }}
            >
              {createOpen ? 'Kapat' : 'Kalem ekle'}
            </PillButton>
          }
        />

        {/* ⚠️ ORTAK DUVAR — hareket defteri rotası da AYNI bileşeni kullanır. */}
        <InventoryWall total={total} items={items} loading={loading} />

        <Desk>
          <DeskHead title="Kalemler" right={<InventoryTabs active="items" />} />
          <DeskBody>
            {error === null ? null : <FormError message={error} />}

            {createOpen ? (
              <ItemCreateForm
                pending={creating}
                error={createError}
                onSubmit={create}
                onCancel={() => {
                  setCreateOpen(false);
                }}
              />
            ) : null}

            <Rise delay={RISE.body}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto_auto]">
                <TextField
                  id="filter-search"
                  label="Ara"
                  value={search}
                  onChange={(next) => {
                    setOffset(0);
                    setSearch(next);
                  }}
                  placeholder="vida"
                  hint="Sunucuda aranır; büyük/küçük harf ayrımı yok."
                />
                <Toggle
                  id="filter-low"
                  label="Yalnızca eşik altı"
                  checked={lowStockOnly}
                  onChange={(next) => {
                    setOffset(0);
                    setLowStockOnly(next);
                  }}
                />
                <Toggle
                  id="filter-archived"
                  label="Arşivi de göster"
                  checked={includeArchived}
                  onChange={(next) => {
                    setOffset(0);
                    setIncludeArchived(next);
                  }}
                />
              </div>
            </Rise>

            {loading ? (
              <DeskSkeleton />
            ) : items.length === 0 ? (
              <EmptyState
                title="Kalem yok"
                hint={
                  filtersActive
                    ? 'Seçtiğiniz filtrelerle eşleşen kalem bulunamadı.'
                    : 'Henüz stok kalemi açılmadı. Kalem ekleyip giriş hareketi yazın.'
                }
              />
            ) : (
              <Rise delay={RISE.body}>
                <div className="flex flex-col gap-2">
                  {items.map((row) => (
                    <RecordCard key={row.id}>
                      <CardHeader>
                        <CardTitleLink href={`/app/inventory/${row.id}`}>{row.name}</CardTitleLink>
                        <StockLevelPill quantity={row.quantity} minQuantity={row.minQuantity} />
                        {row.archivedAt === null ? null : (
                          <span className="font-mono text-[8px] tracking-[0.1em] text-fg-3 uppercase">
                            arşivde
                          </span>
                        )}
                      </CardHeader>

                      <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                        {/*
                          ⚠️ MİKTAR BİRİMİYLE — çıplak sayı değil (§4.1).
                          Birimsiz bir sayı, farklı kalemlerin toplanabileceğini
                          ima ederdi.
                        */}
                        <Quantity
                          value={row.quantity}
                          unit={row.unit}
                          negative={row.quantity.startsWith('-')}
                        />
                        <span className="text-[11.5px] text-fg-3">
                          {row.minQuantity === null
                            ? 'eşik tanımsız'
                            : `eşik ${row.minQuantity} ${row.unit}`}
                        </span>
                      </div>

                      <CardMeta items={[row.sku, formatDate(row.createdAt)]} />
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

/**
 * Kalem açma formu.
 *
 * ⚠️ BAŞLANGIÇ MİKTARI ALANI YOKTUR — ve bu, ADR-0039 §2'nin arayüzdeki en
 * görünür sonucudur. Miktar bir kolonda saklanmadığı için "açılış stoğu" diye
 * bir alan olamaz; kullanıcı kalemi açar, sonra bir GİRİŞ hareketi yazar.
 *
 * Bu fazladan bir adım gibi görünür ama tam olarak istenen şeydir: her miktarın
 * bir hareketi vardır ve "nasıl bu hale geldik" sorusu her zaman cevaplanabilir.
 */
function ItemCreateForm({
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  readonly pending: boolean;
  readonly error: string | null;
  readonly onSubmit: (input: {
    name: string;
    sku: string;
    unit: string;
    minQuantity: string;
    note: string;
  }) => void;
  readonly onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [unit, setUnit] = useState('adet');
  const [minQuantity, setMinQuantity] = useState('');
  const [note, setNote] = useState('');

  const ready = name.trim() !== '' && unit.trim() !== '' && !pending;

  return (
    <InlinePanel title="Yeni stok kalemi">
      {error === null ? null : <FormError message={error} />}

      <FieldGrid>
        <TextField
          id="item-name"
          label="Ad"
          value={name}
          onChange={setName}
          placeholder="Vida M8 galvaniz"
          required
          disabled={pending}
        />
        <TextField
          id="item-sku"
          label="SKU (opsiyonel)"
          value={sku}
          onChange={setSku}
          placeholder="VDA-M8"
          disabled={pending}
          hint="Büyük/küçük harf ayrımı yoktur: ABC-1 ile abc-1 aynı kalemdir."
        />
        <TextField
          id="item-unit"
          label="Birim"
          value={unit}
          onChange={setUnit}
          placeholder="adet"
          required
          disabled={pending}
          hint="Serbest metin: adet, kg, metre, litre…"
        />
        <TextField
          id="item-min"
          label="Uyarı eşiği (opsiyonel)"
          type="number"
          value={minQuantity}
          onChange={setMinQuantity}
          placeholder="20"
          disabled={pending}
          /*
            ⚠️ İPUCU `null` İLE `0` FARKINI SÖYLER (§6.1). İkisi de anlamlıdır
            ve biri diğerinin yerine geçmez; söylenmezse kullanıcı "izleme yok"
            demek için 0 yazar ve tükendiğinde uyarı alır — beklemediği bir
            davranış.
          */
          hint="Boş bırakılırsa bu kalem izlenmez. 0 yazmak 'tükendiğinde haber ver' demektir."
        />
      </FieldGrid>

      <div className="mt-4">
        <TextField
          id="item-note"
          label="Not (opsiyonel)"
          value={note}
          onChange={setNote}
          placeholder="parti no 2026-04, tedarikçi Yıldız Cıvata"
          disabled={pending}
          hint="Asistanın aramasına girer. Parti/tedarikçi bilgisi serbest metindir."
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2.5">
        <PrimaryButton
          onClick={() => {
            if (ready) {
              onSubmit({ name, sku, unit, minQuantity, note });
            }
          }}
          disabled={!ready}
        >
          {pending ? 'Kaydediliyor…' : 'Kalemi aç'}
        </PrimaryButton>
        <GhostButton onClick={onCancel} disabled={pending}>
          Vazgeç
        </GhostButton>
      </div>

      <p className="mt-3 text-[11.5px] leading-[1.6] text-fg-3">
        Başlangıç miktarı burada girilmez: stok, hareketlerden hesaplanır. Kalemi açtıktan sonra bir
        giriş hareketi yazın.
      </p>
    </InlinePanel>
  );
}

/** Sade onay kutusu — `form-kit`te karşılığı yok ve tek kullanım burada. */
function Toggle({
  id,
  label,
  checked,
  onChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (next: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className="flex min-h-11 cursor-pointer items-center gap-2 self-end text-[12px] text-fg-2"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => {
          onChange(event.target.checked);
        }}
        className="h-4 w-4 accent-[var(--accent)]"
      />
      {label}
    </label>
  );
}
