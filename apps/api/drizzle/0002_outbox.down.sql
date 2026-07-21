-- 0002_outbox — GERI ALMA
--
-- DEVELOPMENT_RULES 6: her migration geri alinabilir olur.
--
-- CASCADE KULLANILMAZ: baska bir nesne outbox'a bagimli hale gelmisse geri
-- alma HATA VERMELIDIR. Politikalar ve index'ler tabloyla birlikte duser.
--
-- DIKKAT: bu islem YAYINLANMAMIS event'leri de siler. Outbox'ta bekleyen
-- satir varsa, geri almadan once onlarin islenmesi beklenmelidir — aksi halde
-- gerceklesmis is degisikliklerinin event'leri sessizce kaybolur.

DROP TABLE IF EXISTS platform.outbox;
