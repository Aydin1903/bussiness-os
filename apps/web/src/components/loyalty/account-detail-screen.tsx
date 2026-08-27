'use client';

import type { LoyaltyAccount, PointEntry } from '@business-os/contracts';
import { MAX_POINT_ENTRY_NOTE_CHARS } from '@business-os/contracts';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { EmptyState, Pager, PillButton } from '@/components/module-kit/chrome';
import { ConfirmDelete } from '@/components/module-kit/confirm-delete';
import {
  FieldGrid,
  FormActions,
  GhostButton,
  InlinePanel,
  SelectField,
  TextField,
} from '@/components/module-kit/form-kit';
import { Rise } from '@/components/panel/stream';
import {
  Desk,
  DeskBody,
  DeskHead,
  DeskSkeleton,
  ROOM_RISE,
  Room,
  RoomScroll,
  RoomTop,
} from '@/components/room/room';
import { FormError } from '@/components/ui/form-error';
import { errorMessage } from '@/lib/api/error-message';
import {
  createPointEntry,
  deleteLoyaltyAccount,
  getLoyaltyAccount,
  listPointEntries,
} from '@/lib/api/loyalty';
import { canDeleteLoyaltyAccount, formatPoints } from '@/lib/config/loyalty';
import { isReadOnly, useCurrentRole } from '@/lib/session/use-current-role';

import { BalanceMark, DirectionMark, UnresolvedContact, toPointDirection } from './chrome';

export const ENTRY_PAGE_SIZE = 20;

const DIRECTION_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'earn', label: 'Puan kazandır' },
  { value: 'spend', label: 'Puan kullandır' },
];

/**
 * Tek sadakat hesabı — ⚠️ DÜZENLENMEZ, YALNIZCA DEFTERE YAZILIR (ADR-0051 §2.2).
 *
 * ============================================================================
 * ⚠️ BU EKRANDA BİR "KAYDET" DÜĞMESİ YOKTUR — VE BU BİR EKSİKLİK DEĞİLDİR
 * ============================================================================
 * Kampanya'nın detay sayfası bir DÜZENLEME formuydu (sonuç notu kampanya
 * bittikten sonra yazılır). Burada düzenlenecek hiçbir alan yoktur:
 * `crm_contact_id` değiştirilemez çünkü onu değiştirmek ⚠️ **BİR BAKİYEYİ
 * BAŞKA BİR İNSANA DEVRETMEKTİR**. Yanlış kişiye açılmış bir hesabın doğru
 * çözümü SİLİP YENİDEN AÇMAKTIR — görünür, iz bırakan ve niyeti belli bir
 * işlem.
 *
 * ⚠️ Sunucuda bir `PATCH` ucu de yoktur ve `loyalty.accounts` üzerinde bir
 * TRIGGER her `UPDATE`i reddeder (prod'da doğrulandı) — yani bu ekranın
 * yokluğu bir arayüz tercihi değil, üç katmanın en üstüdür.
 *
 * ============================================================================
 * ⚠️ DEFTER SATIRI DA DÜZENLENMEZ VE SİLİNMEZ
 * ============================================================================
 * Bir satırı değiştirmek BUGÜNKÜ BAKİYEYİ SESSİZCE YENİDEN YAZAR (§2.1).
 * ⚠️ Düzeltme TERS YÖNDE BİR SATIRDIR — ADR-0041'in "iskonto ALANI yok,
 * negatif birim fiyatlı bir satır olarak yazılır" kararıyla aynı şekil.
 */
export function LoyaltyAccountDetailScreen({ accountId }: { readonly accountId: string }) {
  const router = useRouter();
  const role = useCurrentRole();
  const canWrite = !isReadOnly(role);
  const mayDelete = canDeleteLoyaltyAccount(role);

  const [account, setAccount] = useState<LoyaltyAccount | null>(null);
  const [entries, setEntries] = useState<readonly PointEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [next, page] = await Promise.all([
        getLoyaltyAccount(accountId),
        listPointEntries(accountId, { limit: ENTRY_PAGE_SIZE, offset }),
      ]);
      setAccount(next);
      setEntries(page.items);
      setTotal(page.total);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [accountId, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && account === null) {
    return (
      <Room>
        <RoomTop name="Sadakat hesabı" />
        <RoomScroll>
          <Desk>
            <DeskBody>
              <DeskSkeleton />
            </DeskBody>
          </Desk>
        </RoomScroll>
      </Room>
    );
  }

  if (account === null) {
    return (
      <Room>
        <RoomTop name="Sadakat hesabı" meta="Kayıt açılamadı" />
        <RoomScroll>
          <Desk>
            <DeskBody>{error === null ? null : <FormError message={error} />}</DeskBody>
          </Desk>
        </RoomScroll>
      </Room>
    );
  }

  return (
    <Room>
      {/*
        ⚠️ DETAY SAYFASININ DUVARI YOKTUR (ADR-0038): özetlenecek bir durum
        değil, TEK BİR KAYIT var. Bakiye `RoomTop`un metasında durur.
      */}
      <RoomTop
        name={account.contactName ?? 'Sadakat hesabı'}
        meta={`${formatPoints(account.balance)} puan · ${String(account.entryCount)} hareket`}
      />

      <RoomScroll>
        <Rise delay={ROOM_RISE.desk}>
          <Desk>
            <DeskHead
              title="Puan defteri"
              right={
                canWrite ? (
                  <PillButton
                    onClick={() => {
                      setAdding((open) => !open);
                    }}
                  >
                    {adding ? 'Vazgeç' : 'Puan hareketi'}
                  </PillButton>
                ) : undefined
              }
            />

            <DeskBody>
              <div className="mb-3 flex items-center justify-between gap-3 rounded-card border border-border bg-surface px-3.5 py-2.5 shadow-card">
                <div className="min-w-0">
                  <p className="font-mono text-[8.5px] font-semibold tracking-[0.17em] text-fg-3 uppercase">
                    Bakiye
                  </p>
                  <div className="mt-0.5">
                    <BalanceMark balance={account.balance} />
                  </div>
                </div>
                {account.contactName === null ? <UnresolvedContact /> : null}
              </div>

              {adding ? (
                <AddEntryForm
                  accountId={account.id}
                  onCancel={() => {
                    setAdding(false);
                  }}
                  onAdded={async () => {
                    setAdding(false);
                    setOffset(0);
                    await load();
                  }}
                />
              ) : null}

              {error === null ? null : <FormError message={error} />}

              {entries.length === 0 ? (
                <EmptyState
                  title="Hareket yok"
                  hint="Bu hesapta henüz puan kazanımı ya da kullanımı kaydedilmedi."
                />
              ) : (
                <ul className="flex flex-col gap-2">
                  {entries.map((entry) => (
                    <li
                      key={entry.id}
                      className="rounded-card border border-border bg-surface px-3.5 py-2.5 shadow-card"
                    >
                      <div className="flex items-baseline justify-between gap-3">
                        <DirectionMark direction={entry.direction} points={entry.points} />
                        <span className="text-[11px] text-fg-2">
                          {new Date(entry.occurredAt).toLocaleDateString('tr-TR')}
                        </span>
                      </div>
                      {entry.note === null ? null : (
                        <p className="mt-1 text-[12px] leading-[1.55] text-fg-2">{entry.note}</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <Pager
                offset={offset}
                count={entries.length}
                total={total}
                loading={loading}
                onPrevious={() => {
                  setOffset((value) => Math.max(0, value - ENTRY_PAGE_SIZE));
                }}
                onNext={() => {
                  setOffset((value) => value + ENTRY_PAGE_SIZE);
                }}
              />

              {canWrite ? (
                <FormActions>
                  {mayDelete ? (
                    <ConfirmDelete
                      /*
                        ⚠️ KVKK GEREKÇELİ ONAY METNİ — VE İKİ ŞEYİ BİRDEN
                        SÖYLEMEK ZORUNDA (ADR-0051 §2.1):
                          a) DEFTER DE GİDER (kullanıcı bunu bilmeli),
                          b) ⚠️ HİÇBİR SAYI YALANLANMAZ — bir satırı silmek
                             bakiyeyi sessizce yeniden yazardı, hesabı silmek
                             bakiyeyi YOK EDER.
                        ⚠️ Kampanya'nın ("geçmişi tümüyle kaldırır") ve
                        Tedarikçi'nin metinlerinden AYRI yazılmasının sebebi
                        budur: burada silinen şey bir KİŞİNİN kaydıdır ve
                        silme yolu bir kolaylık değil bir YÜKÜMLÜLÜKTÜR
                        (KVKK m.7/m.11).
                      */
                      question="Bu müşterinin sadakat hesabı ve TÜM puan geçmişi kalıcı olarak silinecek. Bakiye başka bir yere taşınmaz, yok olur. (Kişisel veri silme talebi için doğru işlem budur.)"
                      confirmLabel="Kalıcı olarak sil"
                      ariaLabel="Sadakat hesabını sil"
                      onConfirm={() => {
                        void deleteLoyaltyAccount(account.id).then(() => {
                          router.push('/app/loyalty');
                        });
                      }}
                    />
                  ) : (
                    <GhostButton onClick={() => undefined} disabled>
                      Silme yetkiniz yok
                    </GhostButton>
                  )}
                </FormActions>
              ) : null}
            </DeskBody>
          </Desk>
        </Rise>
      </RoomScroll>
    </Room>
  );
}

/**
 * Puan hareketi ekleme — ⚠️ BACKEND'İN `FOR UPDATE` KORUMASININ ARAYÜZ KARŞILIĞI.
 *
 * ============================================================================
 * ⚠️ BU FORM BAKİYEYİ HESAPLAMAZ VE "YETERLİ Mİ" DİYE BAKMAZ
 * ============================================================================
 * ADR-0051 §4.2: kullanıcı KAÇ PUAN harcanacağını yazar, yeterli olup
 * olmadığına SUNUCU karar verir — `SELECT … FOR UPDATE` kilidi altında.
 *
 * ⚠️ İstemcide bir ön kontrol (`points > balance ise düğmeyi kapat`) yazmak
 * CAZİPTİR ve YANLIŞTIR: istemcinin okuduğu bakiye ile isteğin vardığı an
 * arasında başka bir hareket girebilir. O kontrol kullanıcıya "yeterli" der,
 * sunucu 422 döner — ya da daha kötüsü, geliştirici bir gün sunucudaki
 * kontrolü "zaten istemcide var" diye gevşetir. ⚠️ ADR-0039'un fiziksel sayım
 * dersinin birebir aynısı.
 *
 * ⚠️ Bu yüzden burada TEK doğrulama vardır: pozitif tam sayı. Yetersiz bakiye
 * bir ARAYÜZ kuralı değil, bir SUNUCU cevabıdır (422) ve olduğu gibi gösterilir
 * — mesaj MEVCUT BAKİYEYİ taşır, yani kullanıcı listeyi tazelemek zorunda
 * kalmaz.
 */
function AddEntryForm({
  accountId,
  onCancel,
  onAdded,
}: {
  readonly accountId: string;
  readonly onCancel: () => void;
  readonly onAdded: () => Promise<void>;
}) {
  const [direction, setDirection] = useState('earn');
  const [points, setPoints] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = Number.parseInt(points, 10);
  const valid = Number.isSafeInteger(parsed) && parsed > 0;

  const submit = async () => {
    const narrowed = toPointDirection(direction);
    if (narrowed === null || !valid) {
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await createPointEntry(accountId, {
        direction: narrowed,
        points: parsed,
        note: note.trim() === '' ? null : note.trim(),
      });
      await onAdded();
    } catch (cause) {
      // ⚠️ YETERSİZ BAKİYE BURADA GÖRÜNÜR (422). Sunucunun mesajı istenen
      // puanı VE mevcut bakiyeyi söyler; kısaltmak ya da kendi metnimizle
      // değiştirmek kullanıcıyı listeyi tazelemeye iterdi.
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  return (
    <InlinePanel title="Puan hareketi">
      <FieldGrid>
        {/*
          ⚠️ KAZANIM VE KULLANIM AYRI SEÇENEKLERDİR — işaretli tek bir miktar
          alanı DEĞİL (ADR-0051 §1.4). Negatif bir sayı yazdırmak, işaret
          koymayı unutan bir yolun bir harcamayı kazanç gibi toplamasına kapı
          açardı ve hata SESSİZ olurdu.
          ⚠️ ÜÇÜNCÜ BİR SEÇENEK ("düzeltme") YOKTUR: düzeltme ters yönde bir
          satırdır ve açıklamaya yazılır.
        */}
        <SelectField
          id="loyalty-direction"
          label="İşlem"
          value={direction}
          onChange={setDirection}
          options={DIRECTION_OPTIONS}
        />
        <TextField
          id="loyalty-points"
          label="Puan"
          value={points}
          onChange={setPoints}
          placeholder="örn. 50"
        />
      </FieldGrid>

      <TextField
        id="loyalty-note"
        label="Açıklama (opsiyonel)"
        value={note}
        onChange={setNote}
        placeholder="örn. Bedava kahve"
        hint={`En fazla ${String(MAX_POINT_ENTRY_NOTE_CHARS)} karakter`}
      />

      {/*
        ⚠️ BU CÜMLE BİR SÜS DEĞİL: `note` bir ETİKETTİR, bir anlatı değil
        (ADR-0051 §3.1) ve embed EDİLMEZ — yani buraya yazılan hiçbir şey
        asistanın hafızasına girmez. Söylenmezse kullanıcı buraya uzun notlar
        yazar ve "asistan neden bilmiyor" sorusu cevapsız kalır.
      */}
      <p className="mt-1.5 text-[11px] text-fg-2">
        Açıklama kısa bir etikettir (en fazla {MAX_POINT_ENTRY_NOTE_CHARS} karakter) ve asistanın
        aramasına girmez. Yanlış girilen bir puan, ters yönde bir hareketle düzeltilir — kayıtlar
        silinemez.
      </p>

      {error === null ? null : <FormError message={error} />}

      <FormActions>
        <GhostButton onClick={onCancel}>Vazgeç</GhostButton>
        <PillButton onClick={() => void submit()} disabled={saving || !valid}>
          {saving ? 'Kaydediliyor…' : 'Kaydet'}
        </PillButton>
      </FormActions>
    </InlinePanel>
  );
}
