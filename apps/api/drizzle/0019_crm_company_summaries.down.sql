-- 0019_crm_company_summaries — GERI ALMA
--
-- Tek tablo, bagimli nesne yok: ne yeni rol, ne `SECURITY DEFINER` fonksiyon,
-- ne `GRANT EXECUTE`. `0012`'nin geri almasi bunlari tek tek sokmek zorundaydi;
-- burada tek `DROP` yetiyor. Bu, "worker yok" kararinin geri alma tarafindaki
-- karsiligidir.
--
-- ⚠️ Kayip TELAFI EDILEBILIR: bu tablo bir ONBELLEKTIR. Kaynak veri
-- (gorusmeler, firsatlar, kisiler) yerinde kalir; ozetler `POST
-- /crm/companies/:id/summary` ile yeniden uretilebilir. `0018`'in geri
-- almasindan farki tam olarak budur — orada kaynak verinin kendisi giderdi.
--
-- Bedeli para: her yeniden uretim bir LLM cagrisidir.

DROP TABLE IF EXISTS crm.company_summaries;
