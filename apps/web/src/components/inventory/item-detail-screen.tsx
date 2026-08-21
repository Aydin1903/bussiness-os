'use client';

import {
  MAX_ITEM_NOTE_CHARS,
  type CountResult,
  type MovementDirection,
  type StockItemRow,
  type StockMovement,
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
  DeskNumber,
  DeskRow,
  DeskSkeleton,
  Room,
  RoomScroll,
  RoomTop,
} from '@/components/room/room';
import { FormError } from '@/components/ui/form-error';
import { errorMessage } from '@/lib/api/error-message';
import {
  createMovement,
  deleteStockItem,
  getStockItem,
  listMovements,
  recordCount,
  updateStockItem,
} from '@/lib/api/inventory';
import { CorrectionMark, DirectionPill, formatDate, Quantity, StockLevelPill } from './chrome';
import { CountForm } from './count-form';
import { MovementForm } from './movement-form';

const HISTORY_SIZE = 25;

/**
 * KALEM DETAYI — hareket geçmişi · not · arşivleme (ADR-0039 §11).
 *
 * ============================================================================
 * ⚠️ BU EKRANIN DUVARI YOKTUR (ADR-0038 §6.5)
 * ============================================================================
 * _"Detay sayfalarının duvarı YOKTUR — özetlenecek bir durum değil, tek bir
 * kayıt var."_ Kalemin miktarı `RoomTop`un yanında ve künyede görünür; dev bir
 * kahraman rakama çevrilmez.
 *
 * ⚠️ Sekme şeridi de YOKTUR: detay hiçbir çalışma yüzeyine ait değildir
 * (`InventoryTabs` bu yüzden `active` prop'unu açıkça ister — `pathname`
 * tabanlı bir kural burada yanlış bir sekmeyi yakardı).
 *
 * ============================================================================
 * ⚠️ HAREKET GEÇMİŞİ SALT OKUNURDUR — DÜZENLE/SİL YOKTUR (ADR-0039 §3.3)
 * ============================================================================
 * Satırlarda hiçbir eylem yoktur ve olmayacaktır. Defter değiştirilemez:
 * bugünkü miktar geçmişin tamamından türetilir (§2), yani bir geçmiş satırını
 * değiştirmek BUGÜNÜ sessizce yeniden yazardı.
 *
 * Telafi yolu ekranda AÇIKÇA sunulur: ters yönde hareket ya da fiziksel sayım.
 */
export function ItemDetailScreen({ itemId }: { itemId: string }) {
  const router = useRouter();

  const [row, setRow] = useState<StockItemRow | null>(null);
  const [history, setHistory] = useState<readonly StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [pane, setPane] = useState<'none' | 'movement' | 'count' | 'edit'>('none');
  const [pending, setPending] = useState(false);
  const [paneError, setPaneError] = useState<string | null>(null);
  /** ⚠️ SUNUCUDAN dönen sayım sonucu — istemcide türetilmiş hiçbir sayı yok. */
  const [countResult, setCountResult] = useState<CountResult | null>(null);

  const [note, setNote] = useState('');
  const [minQuantity, setMinQuantity] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);

    Promise.all([getStockItem(itemId), listMovements({ limit: HISTORY_SIZE, offset: 0, itemId })])
      .then(([item, page]) => {
        if (!active) {
          return;
        }
        setRow(item);
        setHistory(page.items);
        setNote(item.note ?? '');
        setMinQuantity(item.minQuantity ?? '');
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
  }, [itemId, reloadToken]);

  const reload = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  const submitMovement = useCallback(
    (input: { direction: MovementDirection; quantity: string; note: string }) => {
      setPending(true);
      setPaneError(null);

      createMovement({
        itemId,
        direction: input.direction,
        quantity: input.quantity,
        ...(input.note === '' ? {} : { note: input.note }),
      })
        .then(() => {
          setPane('none');
          reload();
        })
        .catch((caught: unknown) => {
          setPaneError(errorMessage(caught));
        })
        .finally(() => {
          setPending(false);
        });
    },
    [itemId, reload],
  );

  /**
   * FİZİKSEL SAYIM (ADR-0039 §3.2).
   *
   * ⚠️ GÖNDERİLEN TEK SAYI `countedQuantity`DİR. Bu fonksiyon mevcut miktarı
   * OKUMAZ, farkı HESAPLAMAZ ve gövdeye koymaz — sunucu farkı kalem satırı
   * kilitliyken kendisi hesaplar.
   *
   * ⚠️ Sonuç `setCountResult` ile SAKLANIR ve ekranda yalnızca O gösterilir.
   * Bir "önizleme" gösterilseydi, istemcinin okuduğu miktar ile isteğin
   * sunucuya vardığı an arasında başka bir hareket girdiğinde ekran ile defter
   * AYRIŞIRDI — ve kullanıcı ekrandakine inanırdı.
   */
  const submitCount = useCallback(
    (input: { countedQuantity: string; note: string }) => {
      setPending(true);
      setPaneError(null);

      recordCount({
        itemId,
        countedQuantity: input.countedQuantity,
        ...(input.note === '' ? {} : { note: input.note }),
      })
        .then((result) => {
          setCountResult(result);
          reload();
        })
        .catch((caught: unknown) => {
          setPaneError(errorMessage(caught));
        })
        .finally(() => {
          setPending(false);
        });
    },
    [itemId, reload],
  );

  const saveDetails = useCallback(() => {
    setPending(true);
    setPaneError(null);

    updateStockItem(itemId, {
      // ⚠️ Boş dize `null` GÖNDERİR ("temizle"), `undefined` DEĞİL. Fark
      // gerçektir: eşiği kaldırmak (izleme yok) meşru bir istektir ve
      // `undefined` gönderilseydi sunucu alana DOKUNMAZDI.
      note: note.trim() === '' ? null : note.trim(),
      minQuantity: minQuantity.trim() === '' ? null : minQuantity.trim(),
    })
      .then(() => {
        setPane('none');
        reload();
      })
      .catch((caught: unknown) => {
        setPaneError(errorMessage(caught));
      })
      .finally(() => {
        setPending(false);
      });
  }, [itemId, note, minQuantity, reload]);

  const toggleArchive = useCallback(() => {
    if (row === null) {
      return;
    }
    setPending(true);
    setPaneError(null);

    updateStockItem(itemId, { archived: row.archivedAt === null })
      .then(() => {
        reload();
      })
      .catch((caught: unknown) => {
        setPaneError(errorMessage(caught));
      })
      .finally(() => {
        setPending(false);
      });
  }, [itemId, row, reload]);

  const remove = useCallback(() => {
    setPending(true);
    setPaneError(null);

    deleteStockItem(itemId)
      .then(() => {
        router.push('/app/inventory');
      })
      .catch((caught: unknown) => {
        // ⚠️ Hareketi olan kalem 409 döner ve mesaj ARŞİVLEMEYİ söyler
        // (sunucu tarafında `StockItemHasMovementsError`). Bu ekran o mesajı
        // olduğu gibi gösterir — kendi metnini uydurmaz.
        setPaneError(errorMessage(caught));
        setPending(false);
      });
  }, [itemId, router]);

  if (loading) {
    return (
      <Room>
        <RoomScroll>
          <RoomTop name="Stok" />
          <Desk>
            <DeskBody>
              <DeskSkeleton />
            </DeskBody>
          </Desk>
        </RoomScroll>
      </Room>
    );
  }

  if (row === null) {
    return (
      <Room>
        <RoomScroll>
          <RoomTop name="Stok" />
          <Desk>
            <DeskBody>
              {error === null ? null : <FormError message={error} />}
              <EmptyState title="Kalem bulunamadı" hint="Kayıt silinmiş ya da erişiminiz yok." />
            </DeskBody>
          </Desk>
        </RoomScroll>
      </Room>
    );
  }

  const archived = row.archivedAt !== null;

  return (
    <Room>
      <RoomScroll>
        <RoomTop
          name={row.name}
          meta={row.sku ?? undefined}
          action={
            archived ? null : (
              <div className="flex flex-wrap items-center gap-2">
                <PillButton
                  onClick={() => {
                    setPaneError(null);
                    setCountResult(null);
                    setPane(pane === 'movement' ? 'none' : 'movement');
                  }}
                >
                  {pane === 'movement' ? 'Kapat' : 'Hareket yaz'}
                </PillButton>
                <PillButton
                  onClick={() => {
                    setPaneError(null);
                    setCountResult(null);
                    setPane(pane === 'count' ? 'none' : 'count');
                  }}
                >
                  {pane === 'count' ? 'Kapat' : 'Fiziksel sayım'}
                </PillButton>
              </div>
            )
          }
        />

        <Desk>
          <DeskHead title="Kalem" />
          <DeskBody>
            {error === null ? null : <FormError message={error} />}
            {paneError === null ? null : <FormError message={paneError} />}

            <Rise delay={RISE.body}>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-card border border-border bg-surface px-4 py-3 shadow-card">
                {/*
                  ⚠️ MİKTAR SUNUCUDAN GELİR (`row.quantity`) — bu ekran onu
                  hareketlerden yeniden toplamaz. Toplasaydı yalnızca görünen
                  25 hareketten hesaplar ve YANLIŞ olurdu (§2).
                */}
                <Quantity
                  value={row.quantity}
                  unit={row.unit}
                  negative={row.quantity.startsWith('-')}
                />
                <StockLevelPill quantity={row.quantity} minQuantity={row.minQuantity} />
                <span className="text-[11.5px] text-fg-3">
                  {row.minQuantity === null
                    ? 'eşik tanımsız — bu kalem izlenmiyor'
                    : `eşik ${row.minQuantity} ${row.unit}`}
                </span>
                {archived ? (
                  <span className="font-mono text-[8px] tracking-[0.1em] text-fg-3 uppercase">
                    arşivde
                  </span>
                ) : null}
              </div>
            </Rise>

            {row.note === null ? null : (
              <Rise delay={RISE.body}>
                <p className="mt-3 max-w-[70ch] text-[12.5px] leading-[1.6] text-fg-2">
                  {row.note}
                </p>
              </Rise>
            )}

            {pane === 'movement' ? (
              <div className="mt-4">
                <MovementForm
                  itemName={row.name}
                  unit={row.unit}
                  pending={pending}
                  error={null}
                  onSubmit={submitMovement}
                  onCancel={() => {
                    setPane('none');
                  }}
                />
              </div>
            ) : null}

            {pane === 'count' ? (
              <div className="mt-4">
                {/*
                  ⚠️ `CountForm` MEVCUT MİKTARI PROP OLARAK ALMAZ — ve almamalı.
                  Alsaydı ekranda bir "fark önizlemesi" göstermek bir satır kod
                  olurdu ve o satır sessiz bir yalan üretirdi (§3.2).
                */}
                <CountForm
                  itemName={row.name}
                  unit={row.unit}
                  pending={pending}
                  error={null}
                  result={countResult}
                  onSubmit={submitCount}
                  onCancel={() => {
                    setPane('none');
                    setCountResult(null);
                  }}
                />
              </div>
            ) : null}

            {pane === 'edit' ? (
              <div className="mt-4">
                <FieldGrid>
                  <TextField
                    id="detail-min"
                    label={`Uyarı eşiği (${row.unit})`}
                    type="number"
                    value={minQuantity}
                    onChange={setMinQuantity}
                    disabled={pending}
                    hint="Boş bırakılırsa bu kalem izlenmez. 0 = tükendiğinde haber ver."
                  />
                  <TextField
                    id="detail-note"
                    label="Not"
                    value={note}
                    onChange={setNote}
                    disabled={pending}
                    hint={`Asistanın aramasına girer. En fazla ${String(MAX_ITEM_NOTE_CHARS)} karakter.`}
                  />
                </FieldGrid>
                <FormActions>
                  <PrimaryButton onClick={saveDetails} disabled={pending}>
                    {pending ? 'Kaydediliyor…' : 'Kaydet'}
                  </PrimaryButton>
                  <GhostButton
                    onClick={() => {
                      setPane('none');
                      setNote(row.note ?? '');
                      setMinQuantity(row.minQuantity ?? '');
                    }}
                    disabled={pending}
                  >
                    Vazgeç
                  </GhostButton>
                </FormActions>
              </div>
            ) : null}

            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              {pane === 'edit' ? null : (
                <GhostButton
                  onClick={() => {
                    setPaneError(null);
                    setPane('edit');
                  }}
                  disabled={pending}
                >
                  Eşik ve notu düzenle
                </GhostButton>
              )}
              <GhostButton onClick={toggleArchive} disabled={pending}>
                {archived ? 'Arşivden çıkar' : 'Arşivle'}
              </GhostButton>
              {/*
                ⚠️ SİLME YALNIZCA HAREKETSİZ KALEMDE BAŞARILI OLUR (§3.4).
                Arayüz bunu ÖNCEDEN engellemez — çünkü bir ön kontrol ile silme
                arasında bir hareket yazılabilir ve kontrol YANILIRDI. Sunucu
                409 döner ve mesajı arşivlemeyi söyler.
              */}
              <ConfirmDelete
                question="Bu kalemi silmek istiyor musunuz? Yalnızca hiç hareketi olmayan bir kalem silinebilir; hareketi varsa defteri korumak için ARŞİVLEYİN."
                confirmLabel="Kalıcı olarak sil"
                ariaLabel="Kalemi sil"
                pending={pending}
                onConfirm={remove}
              />
            </div>

            <div className="mt-8">
              <p className="font-mono text-[9px] font-semibold tracking-[0.18em] text-fg-3 uppercase">
                Hareket geçmişi
              </p>
              <p className="mt-1.5 mb-3 max-w-[62ch] text-[11.5px] leading-[1.6] text-fg-3">
                Bu defter değiştirilemez: hareketler düzenlenemez ve silinemez. Yanlış bir kayıt
                ters yönde bir hareketle ya da fiziksel sayımla düzeltilir.
              </p>

              {history.length === 0 ? (
                <EmptyState title="Hareket yok" hint="Bu kalemin stoğu henüz hiç değişmedi." />
              ) : (
                <div className="-mx-5 md:-mx-9">
                  {history.map((movement) => (
                    <DeskRow key={movement.id} columns="auto minmax(0,1fr) minmax(0,1.4fr)">
                      <DirectionPill direction={movement.direction} />
                      <span className="flex items-baseline gap-1.5">
                        <DeskNumber>{movement.quantity}</DeskNumber>
                        <span className="text-[11px] text-fg-3">{row.unit}</span>
                      </span>
                      <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-[11.5px] text-fg-3">
                        <span>{formatDate(movement.occurredAt)}</span>
                        {movement.isCorrection ? <CorrectionMark /> : null}
                        {movement.note === null ? null : (
                          <span className="min-w-0 truncate">{movement.note}</span>
                        )}
                      </span>
                    </DeskRow>
                  ))}
                </div>
              )}
            </div>
          </DeskBody>
        </Desk>
      </RoomScroll>
    </Room>
  );
}
