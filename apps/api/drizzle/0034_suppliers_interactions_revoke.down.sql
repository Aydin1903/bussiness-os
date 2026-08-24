-- 0034_suppliers_interactions_revoke — GERI ALMA
--
-- DEVELOPMENT_RULES 6: her migration geri alinabilir olur.
--
-- Yetkiyi `0030`daki haline dondurur (`GRANT SELECT, INSERT, UPDATE, DELETE`).
--
-- ⚠️ SIRA ONEMLI: once KOLON seviyesi yetki geri alinir, sonra TABLO seviyesi
-- yetki verilir. Ters sirada, tablo seviyesindeki `UPDATE` zaten tum kolonlari
-- kapsadigi icin kolon yetkisi anlamsiz bir ARTIK olarak `information_schema
-- .column_privileges`ta kalirdi — ileri/geri yon arasinda gorunmez bir fark.
--
-- ⚠️ Geri alindiginda ekleme-yalnizlik UYGULAMA seviyesinde devam eder
-- (`update` metodu ve `supplier_interaction:write` izni hala yok); bu migration
-- onlara hic dokunmadi.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'businessos_app') THEN
    REVOKE UPDATE (embedding) ON suppliers.interactions FROM businessos_app;
    GRANT  UPDATE, DELETE     ON suppliers.interactions TO   businessos_app;
  END IF;
END
$$;
