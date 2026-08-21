'use client';

import type { StockItemRow, StockMovement } from '@business-os/contracts';
import { useEffect, useState } from 'react';

import { EmptyState, Pager, RISE } from '@/components/module-kit/chrome';
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
import { listMovements, listStockItems } from '@/lib/api/inventory';
import { CorrectionMark, DirectionPill, formatDate } from './chrome';
import { InventoryTabs } from './tabs';
import { InventoryWall } from './inventory-wall';

const PAGE_SIZE = 25;

/**
 * STOK ODASI — hareket defteri (ADR-0039 §11.2).
 *
 * ============================================================================
 * ⚠️ AYNI ODA, AYNI DUVAR — FARKLI TEZGAH (ADR-0038 §6.5)
 * ============================================================================
 * `InventoryWall` BURADA DA kullanılır ve kopyalanmaz. Gerekçe kullanıcı
 * modelidir: sekmeler arasında gezerken _"stok durumu ne"_ sorusunun cevabı
 * GÖZDEN KAYBOLMAMALIDIR.
 *
 * ⚠️ Duvarın verisi için kalem listesi AYRICA çekilir. Bu, bu ekranın
 * kabul ettiği tek fazladan istektir ve alternatifi duvarı boş bırakmaktı —
 * yani ADR-0038 §6.5'i ihlal etmek.
 *
 * ============================================================================
 * ⚠️ DEFTER DEĞİŞTİRİLEMEZ — BU EKRANDA DÜZENLE/SİL YOKTUR (ADR-0039 §3.3)
 * ============================================================================
 * Satırlar tıklanabilir DEĞİLDİR, bir "düzenle" düğmesi YOKTUR ve bir bağlam
 * menüsü YOKTUR. Sunucuda da uç yok, izin yok, entity'de metot yok.
 *
 * Bu bir eksiklik değil kararın kendisidir: bugünkü miktar geçmişin
 * tamamından türetilir (§2), yani bir geçmiş satırını değiştirmek BUGÜNÜ
 * sessizce yeniden yazar. Yanlış girilen bir hareketin telafisi TERS YÖNDE
 * bir hareket yazmaktır; fiziksel sayım bunu otomatik yapar.
 */
export function MovementsScreen() {
  const [movements, setMovements] = useState<readonly StockMovement[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** Duvar için — ve satırlarda kalem adını/birimini çözmek için. */
  const [items, setItems] = useState<readonly StockItemRow[]>([]);
  const [itemTotal, setItemTotal] = useState(0);
  const [itemsLoading, setItemsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    listStockItems({ limit: 100, offset: 0 })
      .then((page) => {
        if (active) {
          setItems(page.items);
          setItemTotal(page.total);
        }
      })
      .catch(() => {
        // ⚠️ SESSİZCE yutulur: kalem listesi gelmezse duvar boş kalır ama
        // DEFTER GÖRÜNMEYE DEVAM EDER. Hareket defteri bu ekranın asıl işidir;
        // duvarın eksikliği onu engellememeli.
        if (active) {
          setItems([]);
        }
      })
      .finally(() => {
        if (active) {
          setItemsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);

    listMovements({ limit: PAGE_SIZE, offset })
      .then((page) => {
        if (!active) {
          return;
        }
        setMovements(page.items);
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
  }, [offset]);

  const itemsById = new Map(items.map((row) => [row.id, row]));

  return (
    <Room>
      <RoomScroll>
        <RoomTop name="Stok" meta={`${String(total)} hareket`} />

        {/* ⚠️ ORTAK DUVAR — kalem listesi rotasıyla AYNI bileşen. */}
        <InventoryWall total={itemTotal} items={items} loading={itemsLoading} />

        <Desk>
          <DeskHead title="Hareket defteri" right={<InventoryTabs active="movements" />} />
          <DeskBody>
            {error === null ? null : <FormError message={error} />}

            <Rise delay={RISE.body}>
              <p className="mb-4 max-w-[62ch] text-[12px] leading-[1.6] text-fg-3">
                Defter değiştirilemez: bir hareket yazıldıktan sonra düzenlenemez ve silinemez.
                Yanlış bir kayıt ters yönde bir hareketle ya da fiziksel sayımla düzeltilir.
              </p>
            </Rise>

            {loading ? (
              <DeskSkeleton rows={4} />
            ) : movements.length === 0 ? (
              <EmptyState
                title="Hareket yok"
                hint="Henüz stok hareketi yazılmadı. Bir kalem açıp giriş yazdığınızda burada görünür."
              />
            ) : (
              <div className="-mx-5 mt-1 md:-mx-9">
                {movements.map((movement) => {
                  const item = itemsById.get(movement.itemId);

                  return (
                    <DeskRow
                      key={movement.id}
                      columns="minmax(0,1.6fr) auto minmax(0,1fr) minmax(0,1.2fr)"
                    >
                      <span className="min-w-0 truncate font-semibold text-fg">
                        {/*
                          ⚠️ Kalem adı çözülemezse id GÖSTERİLMEZ, sade bir
                          yer tutucu yazılır: bir uuid kullanıcıya hiçbir şey
                          söylemez ve ekranı kirletir. (Ad, ilk 100 kalemin
                          dışındaysa çözülemez — kabul edilen bir sınır.)
                        */}
                        {item?.name ?? 'Kalem'}
                      </span>

                      <DirectionPill direction={movement.direction} />

                      <span className="flex items-baseline gap-1.5">
                        {/*
                          ⚠️ MİKTAR POZİTİF BASILIR — işaret `direction`dadır.
                          Burada bir eksi işareti üretmek, aynı bilgiyi iki
                          yerde taşımak olurdu (§3.1).
                        */}
                        <DeskNumber>{movement.quantity}</DeskNumber>
                        <span className="text-[11px] text-fg-3">{item?.unit ?? ''}</span>
                      </span>

                      <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-[11.5px] text-fg-3">
                        <span>{formatDate(movement.occurredAt)}</span>
                        {movement.isCorrection ? <CorrectionMark /> : null}
                        {movement.note === null ? null : (
                          <span className="min-w-0 truncate">{movement.note}</span>
                        )}
                      </span>
                    </DeskRow>
                  );
                })}
              </div>
            )}

            <Pager
              offset={offset}
              count={movements.length}
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
