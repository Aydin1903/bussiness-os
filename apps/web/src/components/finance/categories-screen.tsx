'use client';

import {
  createFinanceCategorySchema,
  DIRECTION_LABELS,
  type CreateFinanceCategoryRequest,
  type FinanceCategory,
  type FinanceDirection,
} from '@business-os/contracts';
import { useCallback, useEffect, useState } from 'react';

import {
  createFinanceCategory,
  deleteFinanceCategory,
  listFinanceCategories,
  updateFinanceCategory,
} from '@/lib/api/finance';
import { errorMessage } from '@/lib/api/error-message';
import { ConfirmDelete } from '@/components/module-kit/confirm-delete';
import { EmptyState, PillButton, PrimaryButton, RISE } from '@/components/module-kit/chrome';
import {
  CardAction,
  CardActions,
  CardHeader,
  CardTitle,
  RecordCard,
} from '@/components/module-kit/record-card';
import {
  FieldGrid,
  FormActions,
  GhostButton,
  InlinePanel,
  SelectField,
  TextField,
} from '@/components/module-kit/form-kit';
import {
  fieldErrors,
  NO_FIELD_ERRORS,
  type FieldErrors,
} from '@/components/module-kit/field-errors';
import { FormError } from '@/components/ui/form-error';
import { Rise } from '@/components/panel/stream';
import { FinanceTabs } from './chrome';
import {
  Desk,
  DeskBody,
  DeskHead,
  Hero,
  HeroFigure,
  Room,
  ROOM_RISE,
  RoomScroll,
  RoomTop,
  Satellite,
  Satellites,
  Wall,
  DeskSkeleton,
} from '@/components/room/room';
import { DirectionPill } from './marks';

const FORBIDDEN = 'Kategorileri yalnızca şirket sahibi veya yönetici yönetebilir.';

/**
 * `/app/finance/categories` — projenin İLK tenant-tanımlı sözlüğü.
 *
 * ============================================================================
 * BU EKRAN İKİ KURALI GÖRÜNÜR KILAR
 * ============================================================================
 * 1. YÖN DEĞİŞTİRİLEMEZ. Form yalnızca yeni kayıtta yön sorar; düzenlemede o
 *    alan HİÇ ÇİZİLMEZ. Kullanımdaki bir kategorinin yönünü değiştirmek bileşik
 *    FK tarafından zaten reddedilir (ADR-0034 §3c); alanı çizip sonra 422
 *    döndürmek, kullanıcıya yapabileceğini sandığı bir şeyi teklif etmek olurdu.
 *
 * 2. SİLMENİN DOĞRU ALTERNATİFİ ARŞİVLEMEKTİR. Kullanımdaki kategori 409 alır
 *    ve mesaj arşivlemeyi önerir — silme geçmiş özetleri SESSİZCE değiştirirdi
 *    (§3e). Arşivlenmiş kategori listede kalır, yalnızca yeni kayıtlarda
 *    seçilemez.
 */
export function CategoriesScreen() {
  const [items, setItems] = useState<readonly FinanceCategory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(() => {
    setReloadToken((previous) => previous + 1);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);

    // ⚠️ `includeArchived: true` — bu ekran ARŞİV YÖNETİMİ ekranıdır. İşlem
    // formundaki liste ise arşivlenmişleri GÖRMEZ; iki farklı soru, iki farklı
    // çağrı.
    listFinanceCategories({ limit: 100, offset: 0, includeArchived: true })
      .then((page) => {
        if (!active) {
          return;
        }
        setItems(page.items);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (active) {
          setError(errorMessage(caught, undefined, { 403: FORBIDDEN }));
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
  }, [reloadToken]);

  async function save(body: CreateFinanceCategoryRequest): Promise<void> {
    setSaving(true);
    setFormError(null);
    try {
      await createFinanceCategory(body);
      setCreating(false);
      reload();
    } catch (caught) {
      setFormError(
        errorMessage(caught, undefined, {
          403: FORBIDDEN,
          409: 'Bu ad ve yönde bir kategori zaten var — arşivlenmiş olabilir.',
        }),
      );
    } finally {
      setSaving(false);
    }
  }

  async function toggleArchive(category: FinanceCategory): Promise<void> {
    setBusyId(category.id);
    setActionError(null);
    try {
      await updateFinanceCategory(category.id, { isArchived: !category.isArchived });
      reload();
    } catch (caught) {
      setActionError(errorMessage(caught, undefined, { 403: FORBIDDEN }));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(category: FinanceCategory): Promise<void> {
    setBusyId(category.id);
    setActionError(null);
    try {
      await deleteFinanceCategory(category.id);
      reload();
    } catch (caught) {
      setActionError(
        errorMessage(caught, undefined, {
          403: FORBIDDEN,
          409: 'Bu kategori kullanımda olduğu için silinemez. Bunun yerine arşivleyin — geçmiş kayıtlar kategorilerini korur.',
        }),
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Room>
      <RoomScroll>
        <RoomTop
          name="Finans"
          meta="sözlük · kategoriler"
          action={
            <div className="flex flex-wrap items-center gap-2.5">
              <FinanceTabs />
              {creating ? null : (
                <PrimaryButton
                  onClick={() => {
                    setCreating(true);
                  }}
                >
                  Yeni kategori
                </PrimaryButton>
              )}
            </div>
          }
        />

        {/*
          ⚠️ BU ODANIN DUVARI FARKLI — ve bu kuralın istisnası değil, kuralın
          kendisidir: duvarın kahramanı ROTANIN SORDUĞU SORUYA göre seçilir.
          İşlemler ve Nakit akışı "dönem ne durumda?" diye sorar ve ortak bir
          duvar paylaşır (`FinanceWall`). Kategoriler ise sözlük yönetir;
          oraya dönem neti koymak, sorulmamış bir soruya dev puntoyla cevap
          vermek olurdu.
        */}
        <Wall>
          <Rise delay={ROOM_RISE.wall}>
            <Hero label="Kategori sözlüğü">
              <HeroFigure>{loading ? '—' : items.length}</HeroFigure>
              <p className="mt-2 max-w-[44ch] text-[12.5px] leading-[1.6] text-fg-2">
                Her kategori tek bir yöne aittir; bu kısıt veritabanı seviyesinde zorlanır — gelir
                kaydına gider kategorisi seçilemez.
              </p>
            </Hero>
          </Rise>

          {loading ? null : (
            <Rise delay={ROOM_RISE.ai}>
              <Satellites>
                <Satellite
                  label={DIRECTION_LABELS.income}
                  value={items.filter((item) => item.direction === 'income').length}
                  note="kategori"
                />
                <Satellite
                  label={DIRECTION_LABELS.expense}
                  value={items.filter((item) => item.direction === 'expense').length}
                  note="kategori"
                />
              </Satellites>
            </Rise>
          )}
        </Wall>

        <Desk>
          <DeskHead title="Kategoriler" />

          <DeskBody>
            {creating ? (
              <CategoryForm
                pending={saving}
                error={formError}
                onSubmit={(body) => {
                  void save(body);
                }}
                onCancel={() => {
                  setCreating(false);
                  setFormError(null);
                }}
              />
            ) : null}

            <div className="flex flex-col gap-3">
              <FormError message={error} />
              <FormError message={actionError} />
            </div>

            <Rise delay={RISE.body}>
              {items.length === 0 ? (
                loading ? (
                  <DeskSkeleton />
                ) : error !== null ? null : (
                  <EmptyState
                    title="Henüz kategori yok"
                    hint="Kategoriler kayıtlarınızı sınıflandırır ve nakit akışı kırılımını mümkün kılar. Sabit bir liste yoktur — kendi kalemlerinizi siz açarsınız."
                    action={
                      <PillButton
                        onClick={() => {
                          setCreating(true);
                        }}
                      >
                        İlk kategoriyi aç
                      </PillButton>
                    }
                  />
                )
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {items.map((category) => (
                    <li key={category.id}>
                      <RecordCard>
                        <CardHeader>
                          <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                            <CardTitle>{category.name}</CardTitle>
                            <DirectionPill direction={category.direction} />
                            {category.isArchived ? (
                              /*
                            Arşiv rozeti: renk TEK bilgi taşıyıcısı değildir —
                            "arşiv" kelimesi zaten yazıyor (FRONTEND §4.8).
                          */
                              <span className="inline-flex shrink-0 items-center rounded-[6px] border border-border-strong px-1.5 py-[2px] font-mono text-[9.5px] font-semibold tracking-[0.08em] text-fg-3 uppercase">
                                arşiv
                              </span>
                            ) : null}
                          </div>

                          <CardActions>
                            <CardAction
                              onClick={() => {
                                void toggleArchive(category);
                              }}
                              ariaLabel={`${category.name} kategorisini ${category.isArchived ? 'arşivden çıkar' : 'arşivle'}`}
                            >
                              {busyId === category.id
                                ? '…'
                                : category.isArchived
                                  ? 'Arşivden çıkar'
                                  : 'Arşivle'}
                            </CardAction>
                            <ConfirmDelete
                              pending={busyId === category.id}
                              ariaLabel={`${category.name} kategorisini sil`}
                              question={`"${category.name}" silinecek. Kullanımdaysa silinemez — o durumda arşivlemeniz gerekir.`}
                              onConfirm={() => {
                                void remove(category);
                              }}
                            />
                          </CardActions>
                        </CardHeader>
                      </RecordCard>
                    </li>
                  ))}
                </ul>
              )}
            </Rise>
          </DeskBody>
        </Desk>
      </RoomScroll>
    </Room>
  );
}

/**
 * Kategori formu — YALNIZCA yeni kayıt için.
 *
 * ⚠️ Düzenleme formu YOKTUR ve bu bilinçli: değiştirilebilecek tek alan `name`
 * ve arşiv durumu; ikisi de kart üzerinden yapılıyor. Yön değiştirilemediği
 * için (ADR-0034 §3c) tam bir düzenleme formu, alanların yarısını devre dışı
 * gösteren yanıltıcı bir ekran olurdu.
 */
function CategoryForm({
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  pending: boolean;
  error: string | null;
  onSubmit: (body: CreateFinanceCategoryRequest) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [direction, setDirection] = useState<FinanceDirection>('expense');
  const [errors, setErrors] = useState<FieldErrors>(NO_FIELD_ERRORS);

  function submit(): void {
    const parsed = createFinanceCategorySchema.safeParse({ name: name.trim(), direction });

    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }

    setErrors(NO_FIELD_ERRORS);
    onSubmit(parsed.data);
  }

  return (
    <InlinePanel title="Yeni kategori">
      <FieldGrid>
        <TextField
          id="category-name"
          label="Ad"
          value={name}
          onChange={setName}
          placeholder="Kira"
          required
          disabled={pending}
          error={errors.name ?? null}
        />

        <SelectField
          id="category-direction"
          label="Yön"
          value={direction}
          onChange={(value) => {
            setDirection(value === 'income' ? 'income' : 'expense');
          }}
          disabled={pending}
          options={[
            { value: 'expense', label: DIRECTION_LABELS.expense },
            { value: 'income', label: DIRECTION_LABELS.income },
          ]}
          hint="⚠️ Sonradan DEĞİŞTİRİLEMEZ. Yanlış seçilirse kategori silinip yeniden açılır."
        />
      </FieldGrid>

      <FormError message={error} />

      <FormActions>
        <PrimaryButton type="button" disabled={pending} onClick={submit}>
          {pending ? 'Kaydediliyor…' : 'Kaydet'}
        </PrimaryButton>
        <GhostButton disabled={pending} onClick={onCancel}>
          Vazgeç
        </GhostButton>
      </FormActions>
    </InlinePanel>
  );
}
