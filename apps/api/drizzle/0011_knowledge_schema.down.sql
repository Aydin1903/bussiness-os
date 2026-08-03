-- 0011_knowledge_schema — GERI ALMA
--
-- DEVELOPMENT_RULES 6: her migration geri alinabilir olur. Ileri yonun TERSI
-- sirayla: once FK ile bagimli tablolar (chunks, messages), sonra sahipleri
-- (notes, conversations), en son sema.
--
-- `DROP TABLE` politikalari ve index'leri BIRLIKTE dusurur; ayrica
-- `DROP POLICY` gerekmez.
--
-- DIKKAT: bu geri alma TUM knowledge verisini siler — notlar, embedding'ler ve
-- konusma gecmisi dahil. Outbox'in geri almasindan farkli olarak burada
-- kaybedilen sey KULLANICI VERISIDIR.
--
-- `DROP EXTENSION vector` YAPILMAZ: eklenti veritabani genelindedir ve baska
-- bir sema onu kullaniyor olabilir. Ayrica eklentiyi dusurmek, ona bagli TUM
-- kolonlari CASCADE ile goturur. Kullanilmayan bir eklenti zararsizdir.

DROP TABLE IF EXISTS knowledge.messages;
--> statement-breakpoint

DROP TABLE IF EXISTS knowledge.note_chunks;
--> statement-breakpoint

DROP TABLE IF EXISTS knowledge.conversations;
--> statement-breakpoint

DROP TABLE IF EXISTS knowledge.notes;
--> statement-breakpoint

-- `CASCADE` YOK: sema bosalmadiysa (0012 geri alinmadiysa) gurultuyle
-- basarisiz olsun. Sessizce baska tablolari goturmek, geri almayi ongorulemez
-- kilardi.
DROP SCHEMA IF EXISTS knowledge;
