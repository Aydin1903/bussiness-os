'use client';

import type { FeedbackResponse, FeedbackSummary } from '@business-os/contracts';
import {
  LOW_RATING_MAX,
  MAX_FEEDBACK_COMMENT_CHARS,
  MAX_RATING,
  MIN_RATING,
} from '@business-os/contracts';
import { useCallback, useEffect, useState } from 'react';

import { EmptyState, Pager, PillButton, RISE } from '@/components/module-kit/chrome';
import { ConfirmDelete } from '@/components/module-kit/confirm-delete';
import {
  FieldGrid,
  FormActions,
  GhostButton,
  InlinePanel,
  SelectField,
  TextAreaField,
  TextField,
} from '@/components/module-kit/form-kit';
import { CardActions, CardHeader, CardMeta, RecordCard } from '@/components/module-kit/record-card';
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
  createFeedback,
  deleteFeedback,
  getFeedbackSummary,
  listFeedback,
} from '@/lib/api/feedback';
import { canDeleteFeedback } from '@/lib/config/feedback';
import { isReadOnly, useCurrentRole } from '@/lib/session/use-current-role';
import { Channel, Comment, RatingBadge, formatDate } from './chrome';
import { FeedbackWall } from './feedback-wall';

export const PAGE_SIZE = 20;

/**
 * GERİ BİLDİRİM ODASI (ADR-0045 §9).
 *
 * Üstte duvar, altta tezgah — tek dikey kaydırma (ADR-0038).
 *
 * ============================================================================
 * ⚠️ BU EKRANDA HİÇBİR DÜZENLEME ALANI YOKTUR — VE BU BİR EKSİK DEĞİL (§2)
 * ============================================================================
 * Ne bir "Düzenle" düğmesi, ne bir satır içi form, ne bir detay rotası. Kayıt
 * GÜNCELLENMEZ ve arayüz bunu YANSITIR:
 *
 *     izin      -> `feedback:write` DİYE BİR İZİN YOK (`create` + `delete`)
 *     kod       -> entity'de/repository'de `update` yok
 *     veritabanı-> `UPDATE` yalnızca `embedding` kolonunda (migration `0037`)
 *     ⚠️ arayüz -> BURASI: düzenlenebilir hiçbir yüzey çizilmez
 *
 * Gerekçe: bir geri bildirim BİZİM SÖZÜMÜZ DEĞİL, bir ÜÇÜNCÜ KİŞİNİN
 * beyanıdır. Bir "Düzenle" düğmesi koymak — sunucu onu reddedecek olsa bile —
 * kullanıcıya müşterinin sözünün DÜZELTİLEBİLİR olduğunu söylerdi.
 *
 * ⚠️ AMA "SİL" VARDIR ve gerekçesi kolaylık değil KVKK'dır (§2.2): yorum
 * kişisel veri içerebilir ve veri sahibinin silme talebi hakkı vardır. Yanlış
 * girilen bir kaydın yolu da budur — SİL ve YENİDEN GİR.
 *
 * ============================================================================
 * ⚠️ İKİ AYRI İSTEK: DUVAR VE LİSTE
 * ============================================================================
 * `SuppliersWall` uydularını çağırandan alıyordu ("bu sayfada"). Burada
 * KABUL EDİLEMEZ: bir ortalama sayfaya bağlı olamaz. Özet ayrı bir uçtan gelir
 * ve toplama SQL'de yapılır.
 *
 * ⚠️ Bedeli: silme sonrası İKİSİ DE tazelenmek zorunda — `reloadToken` her iki
 * `useEffect`i de tetikler. Yalnızca liste tazelenseydi duvar eski ortalamayı
 * göstermeye devam ederdi ve hata SESSİZ olurdu.
 *
 * ============================================================================
 * ⚠️ ARAMA YOKTUR — NE ANLAMSAL NE KLASİK (§10)
 * ============================================================================
 * Yalnızca PUAN BANDI filtresi var. Yorum metni üzerinde arama, ADR-0011'in
 * onuncu kez açık kalan FTS kalemidir; anlamsal arama ise `POST /ask`in
 * işidir. Buraya bir arama kutusu koymak, sunucuda olmayan bir yeteneği İMA
 * EDERDİ.
 */
export function FeedbackListScreen() {
  const role = useCurrentRole();
  const canCreate = !isReadOnly(role);
  const mayDelete = canDeleteFeedback(role);

  const [items, setItems] = useState<readonly FeedbackResponse[]>([]);
  const [summary, setSummary] = useState<FeedbackSummary | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  /** `null` = banda göre filtre yok. */
  const [band, setBand] = useState<'low' | 'high' | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);

    // ⚠️ Alanlar KOŞULLU eklenir, `undefined` ATANMAZ:
    // `exactOptionalPropertyTypes` altında "alan yok" ile "alan var ama
    // undefined" AYRI tiplerdir.
    listFeedback({
      limit: PAGE_SIZE,
      offset,
      ...(band === 'low' ? { maxRating: LOW_RATING_MAX } : {}),
      ...(band === 'high' ? { minRating: LOW_RATING_MAX + 1 } : {}),
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
  }, [offset, band, reloadToken]);

  /*
   * ⚠️ ÖZET AYRI BİR ETKİ — ve `band`e BAĞLI DEĞİL.
   *
   * Duvar TÜM pencereyi özetler; filtre yalnızca TEZGAHI daraltır. Bağlansaydı
   * "düşük puanlar" filtresinde ortalama 1,4'e düşer ve kullanıcı işletmenin
   * gerçekten öyle olduğunu sanardı — hata SESSİZ olurdu.
   */
  useEffect(() => {
    let active = true;
    setSummaryLoading(true);

    getFeedbackSummary()
      .then((next) => {
        if (active) {
          setSummary(next);
        }
      })
      .catch(() => {
        // ⚠️ Özet hatası LİSTEYİ ÇÖKERTMEZ: duvar iskelet olarak kalır ve
        // kullanıcı kayıtları görmeye devam eder. Ortak bir hata bandına
        // bağlansaydı, çalışan bir listeyi bir toplama sorgusu yüzünden
        // gizlemiş olurduk.
        if (active) {
          setSummary(null);
        }
      })
      .finally(() => {
        if (active) {
          setSummaryLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [reloadToken]);

  const create = useCallback(
    (input: { rating: string; comment: string; channel: string; receivedAt: string }) => {
      setCreating(true);
      setCreateError(null);

      createFeedback({
        rating: Number(input.rating),
        // ⚠️ Boş alanlar GÖNDERİLMEZ. Sunucu boş dizeyi zaten `null`a çevirir
        // ama göndermemek niyeti açık tutar: "girilmedi" ile "boş girildi"
        // aynı şeydir (§1.4).
        ...(input.comment.trim() === '' ? {} : { comment: input.comment.trim() }),
        ...(input.channel.trim() === '' ? {} : { channel: input.channel.trim() }),
        // ⚠️ Yerel tarih-saat girdisi OFSETLİ bir ana çevrilir: sunucu ofsetsiz
        // dizeyi 422 ile reddeder (§1.1) ve haklıdır — ofsetsiz bir zaman iki
        // sunucuda İKİ FARKLI ANI kaydederdi.
        receivedAt: new Date(input.receivedAt).toISOString(),
      })
        .then(() => {
          setCreateOpen(false);
          setOffset(0);
          setReloadToken((token) => token + 1);
        })
        .catch((caught: unknown) => {
          // ⚠️ 502 BURAYA DÜŞER ve mesajı SUNUCUDAN gelir: "Geri bildirim
          // kaydedildi ancak arama için indekslenemedi; /feedback/reindex ile
          // onarılabilir." Kendi metnimizi yazsaydık kaydın KAYDEDİLDİĞİ
          // söylenmezdi ve kullanıcı aynı geri bildirimi İKİNCİ KEZ girerdi —
          // mükerrer kayıt ORTALAMAYI BOZAR.
          setCreateError(errorMessage(caught));
        })
        .finally(() => {
          setCreating(false);
        });
    },
    [],
  );

  const remove = useCallback((id: string) => {
    setDeletingId(id);

    deleteFeedback(id)
      .then(() => {
        // ⚠️ HEM liste HEM duvar tazelenir: ikisi ayrı isteklerdir ve yalnızca
        // biri tazelenseydi ortalama ile kayıtlar ayrışırdı.
        setReloadToken((token) => token + 1);
      })
      .catch((caught: unknown) => {
        setError(errorMessage(caught));
      })
      .finally(() => {
        setDeletingId(null);
      });
  }, []);

  return (
    <Room>
      <RoomScroll>
        <RoomTop
          name="Geri bildirim"
          meta={`${String(total)} kayıt`}
          action={
            canCreate ? (
              <PillButton
                onClick={() => {
                  setCreateError(null);
                  setCreateOpen((open) => !open);
                }}
              >
                {createOpen ? 'Kapat' : 'Geri bildirim ekle'}
              </PillButton>
            ) : undefined
          }
        />

        <FeedbackWall summary={summary} loading={summaryLoading} />

        <Desk>
          <DeskHead
            title="Gelen geri bildirimler"
            right={<BandFilter value={band} onChange={setBand} />}
          />
          <DeskBody>
            {error === null ? null : <FormError message={error} />}

            {createOpen ? (
              <FeedbackCreateForm
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
                title="Geri bildirim yok"
                hint={
                  band === null
                    ? 'Henüz geri bildirim girilmedi. Puan girdiğinizde ortalama duvarda belirir; yorum da yazarsanız müşterinin kendi cümlesi asistanın hafızasına girer.'
                    : 'Bu puan bandında kayıt yok.'
                }
              />
            ) : (
              <Rise delay={RISE.body}>
                <div className="flex flex-col gap-2">
                  {items.map((row) => (
                    <RecordCard key={row.id}>
                      <CardHeader>
                        <div className="flex min-w-0 items-center gap-2">
                          <RatingBadge value={row.rating} />
                          <Channel value={row.channel} />
                        </div>

                        {/*
                          ⚠️ YALNIZCA "SİL" — bir "Düzenle" eylemi YOKTUR (§2).
                          Kart hiçbir koşulda düzenlenebilir bir yüzeye
                          dönüşmez.
                        */}
                        {mayDelete ? (
                          <CardActions>
                            <ConfirmDelete
                              question="Bu geri bildirim kalıcı olarak silinsin mi? Müşterinin yorumu ve asistanın aramasındaki karşılığı da gider."
                              ariaLabel={`${String(row.rating)} puanlı geri bildirimi sil`}
                              pending={deletingId === row.id}
                              onConfirm={() => {
                                remove(row.id);
                              }}
                            />
                          </CardActions>
                        ) : null}
                      </CardHeader>

                      <div className="mt-1.5">
                        <Comment value={row.comment} />
                      </div>

                      {/*
                        ⚠️ Kişi adı KOLONDA SAKLANMAZ, her okumada çözülür
                        (§6.1). `null` ÜÇ ANLAMA gelir ve üçü de AYIRT
                        EDİLEMEZ: anonim kayıt · kişi silinmiş · çağıranda
                        `contact:read` yok. Ayırt edilseydi, göremediği bir
                        kişinin VAR OLDUĞU sızardı.
                      */}
                      <CardMeta items={[row.contactName, formatDate(row.receivedAt)]} />
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
 * Puan bandı şeridi.
 *
 * ⚠️ ÜÇ SEÇENEK, BİR ARAMA KUTUSU DEĞİL: bu modülde metin araması YOKTUR (§10).
 * Eşik `LOW_RATING_MAX`tan gelir — etiket burada İCAT EDİLMEZ.
 */
function BandFilter({
  value,
  onChange,
}: {
  readonly value: 'low' | 'high' | null;
  readonly onChange: (next: 'low' | 'high' | null) => void;
}) {
  const options: readonly { readonly key: 'low' | 'high' | null; readonly label: string }[] = [
    { key: null, label: 'Tümü' },
    { key: 'low', label: `≤${String(LOW_RATING_MAX)}` },
    { key: 'high', label: `≥${String(LOW_RATING_MAX + 1)}` },
  ];

  return (
    <div className="flex items-center gap-1">
      {options.map((option) => (
        <button
          key={option.label}
          type="button"
          // ⚠️ Aktif seçenek RENKLE DEĞİL, `aria-pressed` + kalın yazıyla da
          // işaretlenir: renk hiçbir yerde TEK ayırt edici olmaz.
          aria-pressed={value === option.key}
          onClick={() => {
            onChange(option.key);
          }}
          className={`rounded-md px-2 py-1 font-mono text-[11px] tabular-nums transition-colors ${
            value === option.key
              ? 'bg-accent-tint font-semibold text-ink'
              : 'text-fg-2 hover:bg-fill-2'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Geri bildirim girme formu.
 *
 * ============================================================================
 * ⚠️ BU FORM YALNIZCA EKLEMEK İÇİNDİR — DÜZENLEME KARŞILIĞI YOKTUR (§2)
 * ============================================================================
 * Aynı bileşen bir "düzenle" kipinde YENİDEN KULLANILMAZ ve `id` almaz. Alsaydı
 * düzenleme yüzeyi bir `prop`la açılabilir hâle gelir ve §2'nin arayüz
 * katmanı bir bayrağa indirgenirdi.
 *
 * ⚠️ PUAN ZORUNLU, YORUM DEĞİL (§1.4): gerçek geri bildirimlerin çoğu yalnızca
 * bir puandır (QR kod, tek tıklık anket). Yorumu zorunlu kılmak kullanıcıyı
 * `"-"` yazmaya iterdi ve havuza ANLAMSIZ VEKTÖRLER girerdi.
 */
function FeedbackCreateForm({
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  readonly pending: boolean;
  readonly error: string | null;
  readonly onSubmit: (input: {
    rating: string;
    comment: string;
    channel: string;
    receivedAt: string;
  }) => void;
  readonly onCancel: () => void;
}) {
  const [rating, setRating] = useState(String(MAX_RATING));
  const [comment, setComment] = useState('');
  const [channel, setChannel] = useState('');
  const [receivedAt, setReceivedAt] = useState(() => toLocalInputValue(new Date()));

  const tooLong = comment.trim().length > MAX_FEEDBACK_COMMENT_CHARS;

  return (
    <InlinePanel title="Yeni geri bildirim">
      {error === null ? null : <FormError message={error} />}

      <FieldGrid>
        {/*
          ⚠️ PUAN BİR SEÇİMDİR, serbest sayı girişi DEĞİL: ölçek SABİTTİR
          (1..5, §1.3) ve ondalık puan sunucuda 422 alır. Serbest bir sayı
          alanı kullanıcıya olmayan bir esneklik gösterirdi.

          ⚠️ Seçenekler ÖLÇEKTEN ÜRETİLİR (`MIN_RATING`..`MAX_RATING`), elle
          yazılmaz: ölçek bir gün değişirse liste onunla birlikte değişir.
        */}
        <SelectField
          id="feedback-rating"
          label="Puan"
          value={rating}
          onChange={setRating}
          disabled={pending}
          options={Array.from(
            { length: MAX_RATING - MIN_RATING + 1 },
            (_, index) => MIN_RATING + index,
          ).map((value) => ({
            value: String(value),
            label: `${String(value)} / ${String(MAX_RATING)}`,
          }))}
        />

        <TextField
          id="feedback-channel"
          label="Kanal"
          value={channel}
          onChange={setChannel}
          placeholder="Google"
          disabled={pending}
          // ⚠️ İpucu SERBEST METİN olduğunu söyler: "google" ile "Google" iki
          // ayrı değerdir (§1.5) ve gruplama güvenilmezdir.
          hint="Serbest metin. Aynı kanalı hep aynı yazmak, listeyi okunur tutar."
        />

        {/*
          ⚠️ GEÇMİŞE DÖNÜK girilebilir ve bu, alanın VAR OLMA SEBEBİDİR: dün
          gelen bir telefon, geçen hafta doldurulmuş bir kâğıt form.
          `now()` varsayılanı geçmiş kayıtları BUGÜNE yığar ve "son 30 gün"
          penceresini anlamsızlaştırırdı.
        */}
        <TextField
          id="feedback-received-at"
          label="Alındığı zaman"
          type="datetime-local"
          value={receivedAt}
          onChange={setReceivedAt}
          disabled={pending}
          hint="Geçmişe dönük girilebilir."
        />
      </FieldGrid>

      <div className="mt-3">
        <TextAreaField
          id="feedback-comment"
          label="Yorum"
          value={comment}
          onChange={setComment}
          placeholder="Siparişim iki hafta gecikti ve kimse dönmedi."
          disabled={pending}
          rows={4}
          // ⚠️ Sayaç SUNUCUYLA AYNI sabiti okur (`MAX_FEEDBACK_COMMENT_CHARS`,
          // `@business-os/contracts`). İki tarafta ayrı yazılsaydı kullanıcı
          // "1250/1250, tamam" görür, sunucu 422 döner ve sebebini anlayamazdı.
          hint={`${String(comment.trim().length)}/${String(MAX_FEEDBACK_COMMENT_CHARS)} — boş bırakılabilir, ama yorumsuz kayıt asistanın aramasına girmez.`}
          error={tooLong ? 'Yorum sınırı aşıldı; kısaltmadan gönderilemez.' : null}
        />
      </div>

      <FormActions>
        <GhostButton onClick={onCancel} disabled={pending}>
          Vazgeç
        </GhostButton>
        <PillButton
          disabled={pending || tooLong}
          onClick={() => {
            onSubmit({ rating, comment, channel, receivedAt });
          }}
        >
          {pending ? 'Kaydediliyor…' : 'Kaydet'}
        </PillButton>
      </FormActions>
    </InlinePanel>
  );
}

/**
 * `datetime-local` girdisinin beklediği YEREL biçim (`YYYY-MM-DDTHH:mm`).
 *
 * ⚠️ `toISOString()` KULLANILMAZ: o UTC'ye çevirir ve kullanıcı saat diliminde
 * olmayan bir saat görürdü. Çevrim GÖNDERİRKEN yapılır (`new Date(...)
 * .toISOString()`), yani sunucuya giden değer daima OFSETLİDİR (§1.1).
 */
function toLocalInputValue(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
