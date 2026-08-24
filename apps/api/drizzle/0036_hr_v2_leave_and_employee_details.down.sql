-- 0036_hr_v2_leave_and_employee_details — GERI ALMA
--
-- DEVELOPMENT_RULES 6: her migration geri alinabilir olur.
--
-- ⚠️ SIRA TERSTIR ve ONEMLIDIR: once izin tablosu duser, sonra kolonlar,
-- EN SON tekillik kisiti geri gelir.
--
-- ⚠️ TEKILLIK KISITI GERI GELIRKEN PATLAYABILIR — ve bu DOGRUDUR: ileri
-- yonde ayni yururluk tarihine ikinci bir kayit (bir DUZELTME) yazilmis
-- olabilir. Kisit o veriyle celisir ve geri alma HATA VERIR.
--
-- Sessizce cozmek (duplikeleri silmek) BIR DUZELTMEYI YOK ETMEK olurdu ve
-- ADR-0043 §6.2'nin denetim cevabini bozardi. Geri almak isteyen kisi once
-- hangi kaydin kalacagina KENDISI karar vermelidir.
--
-- ⚠️ IZIN KAYITLARI GERI GELMEZ.

DROP TABLE IF EXISTS hr.leave_requests;
--> statement-breakpoint

DROP INDEX IF EXISTS hr.employees_contract_ends_idx;
--> statement-breakpoint

DROP INDEX IF EXISTS hr.employees_department_idx;
--> statement-breakpoint

ALTER TABLE hr.employees
  DROP CONSTRAINT IF EXISTS employees_manager_not_self,
  DROP CONSTRAINT IF EXISTS employees_leave_days_range,
  DROP CONSTRAINT IF EXISTS employees_work_mode_valid,
  DROP CONSTRAINT IF EXISTS employees_employment_type_valid;
--> statement-breakpoint

ALTER TABLE hr.employees
  DROP COLUMN IF EXISTS manager_employee_id,
  DROP COLUMN IF EXISTS annual_leave_days,
  DROP COLUMN IF EXISTS contract_ends_on,
  DROP COLUMN IF EXISTS work_mode,
  DROP COLUMN IF EXISTS employment_type,
  DROP COLUMN IF EXISTS department;
--> statement-breakpoint

DROP INDEX IF EXISTS hr.compensation_supersede_idx;
--> statement-breakpoint

-- ⚠️ Bkz. yukaridaki uyari: duzeltme kaydi varsa BU SATIR PATLAR.
ALTER TABLE hr.compensation_records
  ADD CONSTRAINT compensation_effective_unique UNIQUE (employee_id, effective_from);
