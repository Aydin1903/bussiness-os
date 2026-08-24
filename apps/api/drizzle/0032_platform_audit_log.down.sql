-- 0032_platform_audit_log — GERI ALMA
--
-- DEVELOPMENT_RULES 6: her migration geri alinabilir olur.
--
-- ⚠️ DENETIM KAYITLARI GERI GELMEZ. Bu, digerlerinden farkli bir kayiptir:
-- bir sayac (`0014`) ya da bir onbellek geri gelmedigi zaman hicbir sey
-- kaybolmaz, ama silinen bir denetim kaydi HESAP VEREBILIRLIGIN kendisidir.
-- Bu down dosyasi yalnizca "migration henuz uretime cikmadi" durumu icindir.
--
-- ⚠️ SIRA ONEMLI VE `DROP TABLE` YETMEZ: `DROP TABLE` trigger'i goturur ama
-- FONKSIYONU GOTURMEZ — semada yetim bir nesne kalirdi. ADR-0041'in `0031`
-- dersi (`DROP TABLE` bir plpgsql fonksiyonunu goturmez) burada TEK MIGRATION
-- ICINDE gecerlidir; ikisi de acikca dusuruluyor.
--
-- ⚠️ Fonksiyon TABLODAN SONRA dusurulur: once fonksiyonu dusurmek, tabloya
-- bagli trigger yuzunden bagimlilik hatasi verirdi.

DROP TABLE IF EXISTS platform.audit_log;
--> statement-breakpoint

DROP FUNCTION IF EXISTS platform.audit_log_append_only();
