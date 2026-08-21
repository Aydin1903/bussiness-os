'use client';

import type { Supplier, SupplierContact, SupplierInteraction } from '@business-os/contracts';
import { useCallback, useEffect, useState } from 'react';

import { EmptyState, Pager, PillButton, RISE } from '@/components/module-kit/chrome';
import { CardHeader, CardTitleLink, RecordCard } from '@/components/module-kit/record-card';
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
import {
  createSupplierInteraction,
  listSupplierContacts,
  listSupplierInteractions,
  listSuppliers,
} from '@/lib/api/suppliers';
import { formatDay } from './chrome';
import { InteractionForm } from './interaction-form';
import { SuppliersWall } from './suppliers-wall';
import { SupplierTabs } from './tabs';

const PAGE_SIZE = 20;

/**
 * TEDARİKÇİ ODASININ İKİNCİ TEZGAHI — görüşme akışı (ADR-0040 §8.2).
 *
 * ⚠️ AYNI ODA: duvar ORTAKTIR (`SuppliersWall`) ve kopyalanmaz. ADR-0038
 * §6.5'in karar noktası — _"bu rota hangi soruyu cevaplıyor?"_ — burada "aynı
 * soru" cevabını verir.
 *
 * ============================================================================
 * ⚠️ AKIŞ SALT OKUNURDUR — DÜZENLE/SİL YOKTUR
 * ============================================================================
 * Günlük EKLEME-YALNIZDIR (§1) ve ekran bunu SÖYLER. Söylemeseydi kullanıcı
 * düğmeyi arar, bulamaz ve bunu bir arayüz eksikliği sanardı.
 *
 * ⚠️ Bu, Stok'un "defter değiştirilemez" ekranıyla AYNI GÖRÜNÜR ama AYNI ŞEY
 * DEĞİLDİR: orada koruma üç katmanlıydı çünkü BUGÜNKÜ MİKTAR o defterden
 * türetiliyordu. Burada türetilen hiçbir sayı yok — günlük yalnızca
 * güncellenmiyor, çünkü bir görüşme olduktan sonra "değişmiş" olmaz.
 *
 * ============================================================================
 * ⚠️ DUVAR TEDARİKÇİLERİ İSTER, TEZGAH GÖRÜŞMELERİ — İKİ AYRI İSTEK
 * ============================================================================
 * Duvar ortak olduğu için burada da tedarikçi listesi çekilir. Bu, ikinci bir
 * istek demektir ve bedeli açıkça kabul edilmiştir: alternatifi duvarı bu
 * rotada FARKLI göstermekti (ADR-0038 §6.5 ihlali) ya da görüşme cevabına
 * tedarikçi özeti gömmekti (uç sözleşmesini bir arayüz ihtiyacı için
 * genişletmek).
 */
export function InteractionsScreen() {
  const [items, setItems] = useState<readonly SupplierInteraction[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  /** Duvar ve tedarikçi seçici için — adları çözmekte de kullanılır. */
  const [suppliers, setSuppliers] = useState<readonly Supplier[]>([]);
  const [supplierTotal, setSupplierTotal] = useState(0);

  const [contacts, setContacts] = useState<readonly SupplierContact[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);

    Promise.all([
      listSupplierInteractions({ limit: PAGE_SIZE, offset }),
      listSuppliers({ limit: 100, offset: 0 }),
    ])
      .then(([page, supplierPage]) => {
        if (!active) {
          return;
        }
        setItems(page.items);
        setTotal(page.total);
        setSuppliers(supplierPage.items);
        setSupplierTotal(supplierPage.total);
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
  }, [offset, reloadToken]);

  /*
   * ⚠️ KİŞİLER YALNIZCA SEÇİLİ TEDARİKÇİ İÇİN çekilir (§1.3).
   *
   * Hepsini birden listelemek, başka bir firmanın kişisini seçtirirdi ve
   * sunucu **404** dönerdi — kullanıcı sebebini anlayamazdı ("kişi var ama
   * bulunamadı" der).
   */
  useEffect(() => {
    if (selectedSupplier === '') {
      setContacts([]);
      return;
    }

    let active = true;
    listSupplierContacts(selectedSupplier)
      .then((page) => {
        if (active) {
          setContacts(page.items);
        }
      })
      .catch(() => {
        // Kişi listesi ikincildir: alınamazsa form kişisiz çalışmaya devam
        // eder (kişi zaten opsiyonel bir alan).
        if (active) {
          setContacts([]);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedSupplier]);

  const create = useCallback(
    (input: { supplierId: string; contactId: string; occurredOn: string; body: string }) => {
      setCreating(true);
      setCreateError(null);

      createSupplierInteraction({
        supplierId: input.supplierId,
        occurredOn: input.occurredOn,
        body: input.body.trim(),
        ...(input.contactId === '' ? {} : { contactId: input.contactId }),
      })
        .then(() => {
          setCreateOpen(false);
          setOffset(0);
          setReloadToken((token) => token + 1);
        })
        .catch((caught: unknown) => {
          /*
           * ⚠️ **502 GÖVDESİ AÇIKTIR** (`DisclosableProblem`) ve mesaj OLDUĞU
           * GİBİ gösterilir: "Görüşme kaydedildi ancak arama için
           * indekslenemedi; /suppliers/reindex ile onarılabilir."
           *
           * Kendi metnimizi yazsaydık ("bir şeyler ters gitti") kullanıcı
           * kaydın DURDUĞUNU öğrenemez, yeniden yazar ve EKLEME-YALNIZ bir
           * günlükte SİLİNEMEYEN mükerrer bir kayıt oluşurdu.
           */
          setCreateError(errorMessage(caught));
        })
        .finally(() => {
          setCreating(false);
        });
    },
    [],
  );

  const nameOf = useCallback(
    (supplierId: string): string =>
      suppliers.find((row) => row.id === supplierId)?.name ?? 'Bilinmeyen tedarikçi',
    [suppliers],
  );

  return (
    <Room>
      <RoomScroll>
        <RoomTop
          name="Tedarikçi"
          meta={`${String(total)} görüşme`}
          action={
            <PillButton
              onClick={() => {
                setCreateError(null);
                setCreateOpen((open) => !open);
              }}
            >
              {createOpen ? 'Kapat' : 'Görüşme yaz'}
            </PillButton>
          }
        />

        {/* ⚠️ ORTAK DUVAR — tedarikçi listesi rotasıyla AYNI bileşen. */}
        <SuppliersWall total={supplierTotal} items={suppliers} loading={loading} />

        <Desk>
          <DeskHead title="Görüşmeler" right={<SupplierTabs active="interactions" />} />
          <DeskBody>
            {error === null ? null : <FormError message={error} />}

            {createOpen ? (
              <InteractionForm
                suppliers={suppliers}
                contacts={contacts}
                // ⚠️ SEÇİM BURADA TUTULUR, formun içinde DEĞİL: kişi listesi
                // seçili firmaya bağlıdır ve onu bu ekran çeker (§1.3).
                supplierId={selectedSupplier}
                onSupplierChange={setSelectedSupplier}
                pending={creating}
                error={createError}
                onSubmit={create}
                onCancel={() => {
                  setCreateOpen(false);
                }}
              />
            ) : null}

            {loading ? (
              <DeskSkeleton />
            ) : items.length === 0 ? (
              <EmptyState
                title="Görüşme yok"
                hint="Henüz görüşme yazılmadı. Yazdıklarınız asistanın kurumsal hafızasına girer — “şu zam ne zaman konuşulmuştu” sorusu oradan cevaplanır."
              />
            ) : (
              <Rise delay={RISE.body}>
                <div className="flex flex-col gap-2">
                  {items.map((row) => (
                    <RecordCard key={row.id}>
                      <CardHeader>
                        <CardTitleLink href={`/app/suppliers/${row.supplierId}`}>
                          {nameOf(row.supplierId)}
                        </CardTitleLink>
                        <span className="font-mono text-[9px] tracking-[0.1em] text-fg-3 uppercase">
                          {formatDay(row.occurredOn)}
                        </span>
                      </CardHeader>

                      {/*
                        ⚠️ `whitespace-pre-wrap`: kullanıcının satır sonları
                        korunur. Görüşme notu bir paragraf değil, çoğu zaman
                        maddelenmiş bir kayıttır.
                      */}
                      <p className="mt-1.5 text-[12.5px] leading-[1.6] whitespace-pre-wrap text-fg-2">
                        {row.body}
                      </p>
                    </RecordCard>
                  ))}
                </div>
              </Rise>
            )}

            {/*
              ⚠️ SALT OKUNUR OLDUĞU AÇIKÇA YAZILIR. Kullanıcı düzenle düğmesini
              arayıp bulamazsa bunu bir eksiklik sanır; sebebini okursa bir
              karar olarak görür.
            */}
            {items.length === 0 ? null : (
              <p className="mt-4 text-[11.5px] leading-[1.6] text-fg-3">
                Görüşme kayıtları sonradan düzenlenemez ve silinemez — yanlış bir kayıt varsa
                doğrusu yeni bir kayıt olarak yazılır.
              </p>
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
