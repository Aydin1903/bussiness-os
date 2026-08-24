'use client';

import type { AuditEntry, Employee, EmploymentType, WorkMode } from '@business-os/contracts';
import { MAX_JOB_TITLE_CHARS } from '@business-os/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { PrimaryButton, SectionLabel } from '@/components/module-kit/chrome';
import {
  FieldGrid,
  FormActions,
  GhostButton,
  SelectField,
  TextField,
} from '@/components/module-kit/form-kit';
import { Room, RoomScroll, RoomTop } from '@/components/room/room';
import { FormError } from '@/components/ui/form-error';
import { listAuditEntries } from '@/lib/api/audit';
import { errorMessage } from '@/lib/api/error-message';
import { getEmployee, listEmployees, updateEmployee } from '@/lib/api/hr';
import {
  canDecideLeave,
  canReadAudit,
  canReadCompensation,
  canRequestLeave,
  canWriteEmployee,
} from '@/lib/config/hr';
import { useCurrentRole } from '@/lib/session/use-current-role';
import {
  EMPLOYMENT_TYPE_LABELS,
  EmploymentMark,
  WORK_MODE_LABELS,
  fieldLabel,
  formatDay,
  formatInstant,
  tenureLabel,
  toEmploymentType,
  toWorkMode,
} from './chrome';
import { CompensationSection } from './compensation-section';
import { LeaveSection } from './leave-section';

/**
 * ÇALIŞAN DETAYI (ADR-0043 §10).
 *
 * ============================================================================
 * ⚠️ DETAYIN DUVARI YOKTUR — ADR-0038'in kuralı
 * ============================================================================
 * Özetlenecek bir DURUM yok, tek bir KAYIT var. Beş modülde de aynı karar.
 *
 * ============================================================================
 * ⚠️ ÜCRET BÖLÜMÜ KOŞULLU MOUNT EDİLİR — GİZLENMEZ (§4.2)
 * ============================================================================
 * `canReadCompensation(role)` yanlışsa `<CompensationSection>` HİÇ ÇİZİLMEZ:
 * DOM'da düğümü yoktur, `useEffect`i çalışmaz, `/compensation` ucuna İSTEK
 * ATILMAZ ve "Ücret" kelimesi sayfa kaynağında GEÇMEZ.
 *
 * ⚠️ Kapı FAIL-CLOSED'dır (`unknown` rol de göremez) ve bu, `isReadOnly`nin
 * fail-open kuralından BİLİNÇLİ SAPMADIR — gerekçe `lib/config/hr.ts`te.
 */
export function EmployeeDetailScreen({ employeeId }: { readonly employeeId: string }) {
  const role = useCurrentRole();
  const canWrite = canWriteEmployee(role);
  const showCompensation = canReadCompensation(role);
  const showAudit = canReadAudit(role);
  const mayRequestLeave = canRequestLeave(role);
  const mayDecideLeave = canDecideLeave(role);

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [workEmail, setWorkEmail] = useState('');
  const [workPhone, setWorkPhone] = useState('');
  const [department, setDepartment] = useState('');
  const [employmentType, setEmploymentType] = useState<EmploymentType>('full_time');
  const [workMode, setWorkMode] = useState<WorkMode>('office');
  const [contractEndsOn, setContractEndsOn] = useState('');
  const [annualLeaveDays, setAnnualLeaveDays] = useState('0');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    getEmployee(employeeId)
      .then((row) => {
        setEmployee(row);
        setFullName(row.fullName);
        setJobTitle(row.jobTitle ?? '');
        setWorkEmail(row.workEmail ?? '');
        setWorkPhone(row.workPhone ?? '');
        setDepartment(row.department ?? '');
        setEmploymentType(row.employmentType);
        setWorkMode(row.workMode);
        setContractEndsOn(row.contractEndsOn ?? '');
        setAnnualLeaveDays(String(row.annualLeaveDays));
        setError(null);
      })
      .catch((cause: unknown) => {
        setError(errorMessage(cause));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [employeeId]);

  useEffect(load, [load]);

  function submit(): void {
    setSaving(true);
    setFormError(null);

    updateEmployee(employeeId, {
      fullName,
      jobTitle: jobTitle.trim() === '' ? null : jobTitle.trim(),
      workEmail: workEmail.trim() === '' ? null : workEmail.trim(),
      workPhone: workPhone.trim() === '' ? null : workPhone.trim(),
      department: department.trim() === '' ? null : department.trim(),
      employmentType,
      workMode,
      contractEndsOn: contractEndsOn === '' ? null : contractEndsOn,
      annualLeaveDays: Number(annualLeaveDays),
    })
      .then(() => {
        setEditing(false);
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
          name="Çalışan"
          meta={employee?.fullName}
          action={
            canWrite && employee !== null ? (
              <PrimaryButton
                onClick={() => {
                  setEditing((open) => !open);
                }}
              >
                {editing ? 'Vazgeç' : 'Düzenle'}
              </PrimaryButton>
            ) : undefined
          }
        />

        <div className="mx-auto w-full max-w-[1180px] px-5 pt-4 pb-12 md:px-9">
          <Link
            href="/app/hr"
            className="font-mono text-[10px] tracking-[0.1em] text-fg-3 uppercase hover:text-fg-2"
          >
            ← Ekip
          </Link>

          <FormError message={error} />

          {loading ? (
            <p className="mt-6 text-[12.5px] text-fg-3">Yükleniyor…</p>
          ) : employee === null ? null : (
            <>
              <header className="mt-5 flex flex-wrap items-baseline gap-x-4 gap-y-2">
                <h2 className="text-[24px] font-bold tracking-[-0.03em] text-fg">
                  {employee.fullName}
                </h2>
                <EmploymentMark status={employee.employmentStatus} />
              </header>

              {editing ? (
                <div className="mt-5 rounded-card border border-border bg-surface px-5 py-4 shadow-card">
                  {/*
                    ⚠️ BU FORMDA "NOT" ALANI YOKTUR (§1.1) ve ÜCRET ALANI DA
                    YOKTUR (§4.2 katman 2): ücret ayrı bir uçtan, ayrı bir
                    izinle yazılır ve BURADAN DEĞİŞTİRİLEMEZ.
                  */}
                  <FieldGrid>
                    <TextField
                      id="hr-detail-name"
                      label="Ad soyad"
                      value={fullName}
                      onChange={setFullName}
                      required
                      disabled={saving}
                    />
                    <TextField
                      id="hr-detail-title"
                      label="Unvan"
                      value={jobTitle}
                      onChange={setJobTitle}
                      disabled={saving}
                      hint={`serbest metin · en fazla ${String(MAX_JOB_TITLE_CHARS)} karakter`}
                    />
                    <TextField
                      id="hr-detail-email"
                      label="İş e-postası"
                      value={workEmail}
                      onChange={setWorkEmail}
                      disabled={saving}
                    />
                    <TextField
                      id="hr-detail-phone"
                      label="İş telefonu"
                      value={workPhone}
                      onChange={setWorkPhone}
                      disabled={saving}
                    />
                    <TextField
                      id="hr-detail-department"
                      label="Departman"
                      value={department}
                      onChange={setDepartment}
                      disabled={saving}
                      placeholder="Muhasebe"
                    />
                    <SelectField
                      id="hr-detail-employment-type"
                      label="Çalışma şekli"
                      value={employmentType}
                      onChange={(next) => {
                        setEmploymentType(toEmploymentType(next));
                      }}
                      options={Object.entries(EMPLOYMENT_TYPE_LABELS).map(([value, label]) => ({
                        value,
                        label,
                      }))}
                      disabled={saving}
                    />
                    <SelectField
                      id="hr-detail-work-mode"
                      label="Çalışma yeri"
                      value={workMode}
                      onChange={(next) => {
                        setWorkMode(toWorkMode(next));
                      }}
                      options={Object.entries(WORK_MODE_LABELS).map(([value, label]) => ({
                        value,
                        label,
                      }))}
                      disabled={saving}
                    />
                    <TextField
                      id="hr-detail-contract-end"
                      label="Sözleşme bitişi"
                      value={contractEndsOn}
                      onChange={setContractEndsOn}
                      type="date"
                      disabled={saving}
                      hint="süresiz ise boş bırakın"
                    />
                    <TextField
                      id="hr-detail-leave-days"
                      label="Yıllık izin hakkı (gün)"
                      value={annualLeaveDays}
                      onChange={setAnnualLeaveDays}
                      type="number"
                      disabled={saving}
                      hint="⚠️ elle girilir — sistem kıdemden hesaplamaz"
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
                        setEditing(false);
                      }}
                    >
                      Vazgeç
                    </GhostButton>
                  </FormActions>
                </div>
              ) : (
                <dl className="mt-5 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
                  <Field label="Unvan" value={employee.jobTitle} />
                  <Field label="İş e-postası" value={employee.workEmail} />
                  <Field label="İş telefonu" value={employee.workPhone} />
                  <Field
                    label="İşe başlama"
                    value={employee.startedOn === null ? null : formatDay(employee.startedOn)}
                  />
                  {employee.endedOn === null ? null : (
                    <Field label="Ayrılma" value={formatDay(employee.endedOn)} />
                  )}
                  <Field label="Departman" value={employee.department} />
                  <Field
                    label="Çalışma şekli"
                    value={`${EMPLOYMENT_TYPE_LABELS[employee.employmentType]} · ${
                      WORK_MODE_LABELS[employee.workMode]
                    }`}
                  />
                  {/* ⚠️ KIDEM TÜRETİLİR — kolonda saklanmaz. */}
                  <Field label="Kıdem" value={tenureLabel(employee.startedOn, new Date())} />
                  {/* ⚠️ Patronun alarm kalemi. */}
                  <Field
                    label="Sözleşme bitişi"
                    value={
                      employee.contractEndsOn === null ? null : formatDay(employee.contractEndsOn)
                    }
                  />
                  {/* ⚠️ Hak ediş İK tarafından GİRİLİR; sistem hesaplamaz. */}
                  <Field
                    label="Yıllık izin hakkı"
                    value={`${String(employee.annualLeaveDays)} gün`}
                  />
                  <Field
                    label="Platform hesabı"
                    value={employee.platformUserId === null ? null : 'bağlı'}
                  />
                </dl>
              )}

              {/*
                ⚠️ SON DEĞİŞİKLİK DAMGASI — `platform.audit_log`tan okunur (§6).
                Yalnızca `audit:read` taşıyan (owner + admin) kullanıcı için
                mount edilir; diğerleri için istek HİÇ ATILMAZ.
              */}
              {showAudit ? <LastChange employeeId={employeeId} /> : null}

              {/*
                ⚠️ ÜCRET BÖLÜMÜ — koşullu MOUNT (§4.2 katman 2). İzinsiz
                kullanıcı için bu satır `null` üretir: DOM'da düğüm yok, ağda
                istek yok, kaynakta kelime yok.
              */}
              {showCompensation ? (
                <CompensationSection employeeId={employeeId} canWrite={showCompensation} />
              ) : null}

              {/*
                ⚠️ İZİN BÖLÜMÜ ÜCRETTEN FARKLI: `leave:read` DÖRT ROLE de açık
                (ADR-0044 §6), çünkü kendi izin bakiyesini görmek herkesin
                işidir. Ücretin aksine burada koşullu mount YOKTUR — gizlenecek
                bir şey yok.
              */}
              <LeaveSection
                employeeId={employeeId}
                canRequest={mayRequestLeave}
                canDecide={mayDecideLeave}
              />
            </>
          )}
        </div>
      </RoomScroll>
    </Room>
  );
}

function Field({ label, value }: { readonly label: string; readonly value: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[9px] font-semibold tracking-[0.19em] text-fg-3 uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-[13px] text-fg">{value ?? <span className="text-fg-3">—</span>}</dd>
    </div>
  );
}

/**
 * SON DEĞİŞİKLİK DAMGASI — "unvan · 24 Ağustos · Ayşe Yılmaz tarafından".
 *
 * ============================================================================
 * ⚠️ AKTÖRÜN ADI NEREDEN GELİYOR — VE NEDEN HER ZAMAN GELMİYOR
 * ============================================================================
 * `platform.audit_log` yalnızca `actor_user_id` tutar; PLATFORM HİÇBİR YERDE
 * BİR KULLANICININ ADINI VERMEZ (ADR-0043 §2.3 — `identity.public.ts` yalnızca
 * `emailVerified` açar, `GET /memberships` ad döndürmez).
 *
 * Adı çözebilen TEK yer İK'nın kendisidir: `employees.platformUserId` bağı.
 * Bu yüzden ekran çalışan listesini çekip `platformUserId → fullName` haritası
 * kurar.
 *
 * ⚠️ DÜRÜST SINIR — ve bilinen sınırlara yazıldı:
 *   - aktörün platform hesabı bir çalışana BAĞLI DEĞİLSE ad çözülmez,
 *   - liste ilk 100 kaydı kapsar; daha büyük bir ekipte çözülemeyebilir.
 * Bu durumda ad GÖSTERİLMEZ — uydurulmaz. "bir yönetici" yazmak bile bir
 * İDDİADIR (aktör owner mı admin mi bilinmiyor) ve doğrulanamaz.
 *
 * ⚠️ DEĞER GÖSTERİLMEZ, YALNIZCA ALAN ADI: denetim kaydında değer YOKTUR
 * (§6.5). Ekran "unvan değişti" der, "X'ten Y'ye değişti" DEMEZ — çünkü
 * söyleyecek verisi yok ve olmaması bilinçlidir.
 */
function LastChange({ employeeId }: { readonly employeeId: string }) {
  const [entry, setEntry] = useState<AuditEntry | null>(null);
  const [actorName, setActorName] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    listAuditEntries({ resourceType: 'hr.employee', resourceId: employeeId, limit: 1 })
      .then(async (response) => {
        const latest = response.items[0];
        if (latest === undefined) {
          return null;
        }

        if (latest.actorUserId === null) {
          return { latest, name: null };
        }

        // ⚠️ Adı çözebilen TEK yer İK'nın kendi `platformUserId` bağıdır
        // (yukarıdaki gerekçe). Platform ad vermez.
        const roster = await listEmployees({ limit: 100, offset: 0 });
        const actor = roster.items.find((row) => row.platformUserId === latest.actorUserId);

        return { latest, name: actor?.fullName ?? null };
      })
      // ⚠️ Durum TEK YERDE yazılır: iptal kontrolü de tek, `await`ten SONRA.
      .then((result) => {
        if (!active || result === null) {
          return;
        }
        setEntry(result.latest);
        setActorName(result.name);
      })
      .catch(() => {
        // Sessiz: damga bir KOLAYLIKTIR, kaydın kendisi değil. Denetim kaydı
        // okunamadıysa ekranın geri kalanı çalışmaya devam eder.
      });

    return () => {
      active = false;
    };
  }, [employeeId]);

  if (entry === null) {
    return null;
  }

  return (
    <section className="mt-8">
      <SectionLabel>Son değişiklik</SectionLabel>
      <p className="mt-2 text-[12.5px] leading-[1.6] text-fg-2">
        {entry.action === 'created'
          ? 'Kayıt oluşturuldu'
          : entry.fieldName === null
            ? 'Kayıt değişti'
            : `${fieldLabel(entry.fieldName)} değişti`}
        {' · '}
        <span className="text-fg-3">{formatInstant(entry.occurredAt)}</span>
        {actorName === null ? null : (
          <>
            {' · '}
            <span className="text-fg-3">{actorName} tarafından</span>
          </>
        )}
      </p>
    </section>
  );
}
