-- 0033_inventory_movements_revoke — GERI ALMA
--
-- DEVELOPMENT_RULES 6: her migration geri alinabilir olur.
--
-- Yetkiyi `0029`daki haline dondurur (`GRANT SELECT, INSERT, UPDATE, DELETE`).
--
-- ⚠️ Geri alindiginda ADR-0039'un DORDUNCU katmani kalkar; ilk uc katman
-- (update metodu yok · izin yok · FK RESTRICT) YERINDE KALIR, cunku bu
-- migration onlara hic dokunmadi. Yani geri alma defteri "degistirilebilir"
-- yapmaz — yalnizca korumayi uygulama seviyesine geri indirir.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    GRANT UPDATE, DELETE ON inventory.movements TO businessos_app;
  END IF;
END
$$;
