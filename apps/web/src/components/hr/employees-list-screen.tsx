'use client';

import type { Employee, EmploymentType, HrOverview, WorkMode } from '@business-os/contracts';
import { MAX_EMPLOYEE_NAME_CHARS, MAX_JOB_TITLE_CHARS } from '@business-os/contracts';
import { useCallback, useEffect, useState } from 'react';

import { EmptyState, Pager, PrimaryButton, RISE } from '@/components/module-kit/chrome';
import {
  FieldGrid,
  FormActions,
  GhostButton,
  InlinePanel,
  SelectField,
  TextField,
} from '@/components/module-kit/form-kit';
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
import { createEmployee, getHrOverview, listEmployees } from '@/lib/api/hr';
import { canWriteEmployee } from '@/lib/config/hr';
import { useCurrentRole } from '@/lib/session/use-current-role';
import {
  EMPLOYMENT_TYPE_LABELS,
  EmploymentMark,
  HrTabs,
  StatusFilter,
  toEmploymentType,
  toWorkMode,
  WORK_MODE_LABELS,
} from './chrome';
import { HrWall } from './hr-wall';

export const PAGE_SIZE = 20;

/**
 * İK ODASI — çalışan listesi (ADR-0043 §10).
 *
 * ============================================================================
 * ⚠️ BU EKRANDA ÜCRET YOKTUR — VE BU, CSS İLE GİZLEME DEĞİLDİR
 * ============================================================================
 * Liste `Employee` tipiyle çalışır ve o tip ÜCRET TAŞIMAZ (contracts, §4.2
 * katman 1). Yani buraya bir maaş sütunu eklemek İMKÂNSIZDIR — önce şemayı,
 * sonra API'yi, sonra izni değiştirmek gerekir.
 *
 * ⚠️ Sunucu da aynı şeyi söylüyor: `GET /hr/employees` cevabında ücret alanı
 * YOKTUR ve maaşa göre sıralama/filtreleme parametresi 422 ile REDDEDİLİR —
 * bir değer dönmese bile SIRALAMANIN KENDİSİ bilgi sızdırır (§4.2).
 *
 * ============================================================================
 * ⚠️ BU EKRANDA BİR "MAAŞ TOPLAMI" DA YOKTUR
 * ============================================================================
 * Duvarın kahraman rakamı AKTİF ÇALIŞAN SAYISIDIR. Gerekçe `hr-wall.tsx`te;
 * özeti: para birimleri toplanmaz VE toplam, küçük bir ekipte tek tek
 * maaşlara neredeyse eşittir.
 *
 * ============================================================================
 * ARAMA SUNUCUDA
 * ============================================================================
 * `search` ad üzerinde çalışır (`ilike`). Randevu'nun "kişi filtresi
 * istemcide" bilinen sınırı burada TEKRARLANMADI: çalışan sayısı sayfa
 * sınırını aşabilir ve istemci tarafı arama yalnızca görünen sayfaya
 * uygulanırdı — kullanıcı "yok" sanıp AYNI KİŞİYİ ikinci kez açardı.
 */
export function EmployeesListScreen() {
  const role = useCurrentRole();
  const canWrite = canWriteEmployee(role);

  const [items, setItems] = useState<readonly Employee[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState<'active' | 'ended' | undefined>('active');
  const [department, setDepartment] = useState('');
  const [search, setSearch] = useState('');
  /*
   * ⚠️ DUVARIN İKİ UYDUSU AYRI BİR UÇTAN GELİR ve bu, "duvar veriyi kendi
   * çekmez" kuralını BOZMAZ: isteği ÇAĞIRAN atar, duvar yine prop alır.
   *
   * ⚠️ Hata YUTULUR ve `null` kalır: özet uydusu bir KOLAYLIKTIR, listenin
   * kendisi değil. `/hr/overview` çökerse ekip listesi çalışmaya devam eder.
   */
  const [overview, setOverview] = useState<HrOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [workEmail, setWorkEmail] = useState('');
  const [workPhone, setWorkPhone] = useState('');
  const [newDepartment, setNewDepartment] = useState('');
  const [newEmploymentType, setNewEmploymentType] = useState<EmploymentType>('full_time');
  const [newWorkMode, setNewWorkMode] = useState<WorkMode>('office');
  const [newStartedOn, setNewStartedOn] = useState('');
  const [newLeaveDays, setNewLeaveDays] = useState('14');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    listEmployees({
      limit: PAGE_SIZE,
      offset,
      ...(status === undefined ? {} : { status }),
      ...(department.trim() === '' ? {} : { department: department.trim() }),
      ...(search.trim() === '' ? {} : { search: search.trim() }),
    })
      .then((response) => {
        setItems(response.items);
        setTotal(response.total);
        setError(null);
      })
      .catch((cause: unknown) => {
        setError(errorMessage(cause));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [offset, status, department, search]);

  useEffect(load, [load]);

  useEffect(() => {
    let active = true;

    getHrOverview()
      .then((response) => {
        if (active) {
          setOverview(response);
        }
      })
      .catch(() => {
        // Sessiz: uydu bir kolaylıktır (yukarıdaki gerekçe).
      });

    return () => {
      active = false;
    };
  }, []);

  function submit(): void {
    setSaving(true);
    setFormError(null);

    createEmployee({
      fullName,
      jobTitle: jobTitle.trim() === '' ? null : jobTitle.trim(),
      workEmail: workEmail.trim() === '' ? null : workEmail.trim(),
      workPhone: workPhone.trim() === '' ? null : workPhone.trim(),
      department: newDepartment.trim() === '' ? null : newDepartment.trim(),
      employmentType: newEmploymentType,
      workMode: newWorkMode,
      startedOn: newStartedOn === '' ? null : newStartedOn,
      annualLeaveDays: Number(newLeaveDays),
    })
      .then(() => {
        setFullName('');
        setJobTitle('');
        setWorkEmail('');
        setWorkPhone('');
        setNewDepartment('');
        setNewStartedOn('');
        setFormOpen(false);
        setOffset(0);
        load();
      })
      .catch((cause: unknown) => {
        setFormError(errorMessage(cause));
      })
      .finally(() => {
        setSaving(false);
      });
  }

  return (
    <Room>
      <RoomScroll>
        <RoomTop
          name="Ekip"
          meta={total === 0 ? undefined : `${String(total)} kayıt`}
          action={
            // Sekmeler ile birincil eylem AYNI slotta: ikisi de "sağ taraf"tır
            // ve ayrı bir satır açmak başlık şeridini iki kat yükseltirdi
            // (`ProjectsScreen` deseni).
            <div className="flex flex-wrap items-center gap-2.5">
              <HrTabs />
              {canWrite ? (
                <PrimaryButton
                  onClick={() => {
                    setFormOpen((open) => !open);
                  }}
                >
                  {formOpen ? 'Vazgeç' : 'Çalışan ekle'}
                </PrimaryButton>
              ) : null}
            </div>
          }
        />

        <HrWall total={total} items={items} overview={overview} loading={loading} />

        <Desk>
          <DeskHead
            title="Çalışanlar"
            right={
              <div className="flex flex-wrap items-center gap-2">
                <StatusFilter
                  value={status}
                  onChange={(next) => {
                    setStatus(next);
                    setOffset(0);
                  }}
                />
                {/*
                  ⚠️ DEPARTMAN FİLTRESİ SUNUCUDA (`department` parametresi) —
                  arama ile aynı gerekçe: istemcide filtrelemek yalnızca
                  görünen sayfaya uygulanır ve kullanıcı bir departmanı BOŞ
                  sanırdı.
                */}
                <input
                  aria-label="Departmana göre süz"
                  className="h-[30px] w-[130px] rounded-full border border-border bg-surface px-3 text-[12px] text-fg placeholder:text-fg-3"
                  placeholder="Departman"
                  value={department}
                  onChange={(event) => {
                    setDepartment(event.target.value);
                    setOffset(0);
                  }}
                />
                <input
                  aria-label="Çalışan ara"
                  className="h-[30px] w-[150px] rounded-full border border-border bg-surface px-3 text-[12px] text-fg placeholder:text-fg-3"
                  placeholder="Ada göre ara"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setOffset(0);
                  }}
                />
              </div>
            }
          />

          <DeskBody>
            {formOpen ? (
              <InlinePanel title="Yeni çalışan">
                {/*
                  ⚠️ BU FORMDA BİR "NOT" ALANI YOKTUR (ADR-0043 §1.1) ve bu,
                  modülün en bilinçli eksiğidir: bir İK kaydındaki serbest
                  metne İLK YAZILACAK ŞEY SAĞLIK BİLGİSİDİR ("raporlu",
                  "ameliyat sonrası yarım gün"). §3'ün sınırını koyup yanına
                  boş bir metin kutusu bırakmak, sınırı KULLANICIYA İHLAL
                  ETTİRMEK olurdu.

                  ⚠️ Ücret alanı da YOKTUR: ücret ayrı bir uçtan, ayrı bir
                  izinle (`compensation:write`) yazılır (§4.2 katman 2).
                */}
                <FieldGrid>
                  <TextField
                    id="hr-full-name"
                    label="Ad soyad"
                    value={fullName}
                    onChange={setFullName}
                    required
                    disabled={saving}
                    hint={`en fazla ${String(MAX_EMPLOYEE_NAME_CHARS)} karakter`}
                  />
                  <TextField
                    id="hr-job-title"
                    label="Unvan"
                    value={jobTitle}
                    onChange={setJobTitle}
                    disabled={saving}
                    placeholder="Kıdemli Muhasebe Uzmanı"
                    hint={`serbest metin · en fazla ${String(MAX_JOB_TITLE_CHARS)} karakter`}
                  />
                  <TextField
                    id="hr-work-email"
                    label="İş e-postası"
                    value={workEmail}
                    onChange={setWorkEmail}
                    disabled={saving}
                  />
                  <TextField
                    id="hr-work-phone"
                    label="İş telefonu"
                    value={workPhone}
                    onChange={setWorkPhone}
                    disabled={saving}
                  />
                  <TextField
                    id="hr-department"
                    label="Departman"
                    value={newDepartment}
                    onChange={setNewDepartment}
                    disabled={saving}
                    placeholder="Muhasebe"
                    hint="serbest metin — sabit bir liste YOKTUR"
                  />
                  <SelectField
                    id="hr-employment-type"
                    label="Çalışma şekli"
                    value={newEmploymentType}
                    onChange={(next) => {
                      setNewEmploymentType(toEmploymentType(next));
                    }}
                    options={Object.entries(EMPLOYMENT_TYPE_LABELS).map(([value, label]) => ({
                      value,
                      label,
                    }))}
                    disabled={saving}
                  />
                  <SelectField
                    id="hr-work-mode"
                    label="Çalışma yeri"
                    value={newWorkMode}
                    onChange={(next) => {
                      setNewWorkMode(toWorkMode(next));
                    }}
                    options={Object.entries(WORK_MODE_LABELS).map(([value, label]) => ({
                      value,
                      label,
                    }))}
                    disabled={saving}
                  />
                  <TextField
                    id="hr-started-on"
                    label="İşe başlama"
                    value={newStartedOn}
                    onChange={setNewStartedOn}
                    type="date"
                    disabled={saving}
                  />
                  {/*
                    ⚠️ HAK EDİŞ ELLE GİRİLİR — sistem kıdemden HESAPLAMAZ
                    (ADR-0044 §2.2). İzin hakkı ülkeye özel MEVZUATTIR ve
                    hesaplasaydık, ülke değişince sessizce yanlış olurdu.
                  */}
                  <TextField
                    id="hr-leave-days"
                    label="Yıllık izin hakkı (gün)"
                    value={newLeaveDays}
                    onChange={setNewLeaveDays}
                    type="number"
                    disabled={saving}
                    hint="⚠️ elle girilir — mevzuat ülkeye göre değişir"
                  />
                </FieldGrid>

                <FormError message={formError} />

                <FormActions>
                  <PrimaryButton disabled={saving || fullName.trim() === ''} onClick={submit}>
                    {saving ? 'Kaydediliyor…' : 'Kaydet'}
                  </PrimaryButton>
                  <GhostButton
                    disabled={saving}
                    onClick={() => {
                      setFormOpen(false);
                    }}
                  >
                    Vazgeç
                  </GhostButton>
                </FormActions>
              </InlinePanel>
            ) : null}

            <FormError message={error} />

            {loading ? (
              <DeskSkeleton />
            ) : items.length === 0 ? (
              <EmptyState
                title="Kayıt yok"
                hint="Aramayı temizleyin ya da yeni bir çalışan ekleyin. Sisteme girişi olmayan çalışanlar da buraya yazılır — platform hesabı zorunlu değildir."
              />
            ) : (
              <div className="flex flex-col gap-2.5">
                {items.map((employee) => (
                  <Rise key={employee.id} delay={RISE.body}>
                    <RecordCard>
                      <CardHeader>
                        <CardTitleLink href={`/app/hr/${employee.id}`}>
                          {employee.fullName}
                        </CardTitleLink>
                        <EmploymentMark status={employee.employmentStatus} />
                      </CardHeader>
                      {/*
                        ⚠️ ÜÇ ALAN: unvan + iş iletişimi. Ücret YOK — ve
                        eklenemez, `Employee` tipi onu taşımaz.
                      */}
                      <CardMeta
                        items={[
                          employee.jobTitle,
                          employee.department,
                          employee.workEmail,
                          employee.workPhone,
                          employee.platformUserId === null ? 'platform hesabı yok' : null,
                        ]}
                      />
                    </RecordCard>
                  </Rise>
                ))}
              </div>
            )}

            <Pager
              offset={offset}
              count={items.length}
              total={total}
              loading={loading}
              onPrevious={() => {
                setOffset(Math.max(0, offset - PAGE_SIZE));
              }}
              onNext={() => {
                setOffset(offset + PAGE_SIZE);
              }}
            />
          </DeskBody>
        </Desk>
      </RoomScroll>
    </Room>
  );
}
