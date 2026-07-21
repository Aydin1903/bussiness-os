-- Business OS — schema iskeleti ve varsayilan yetkiler
--
-- ARCHITECTURE 6.1: her modul kendi PostgreSQL schema'sina sahiptir.
-- Faz 1'de yalnizca platform schema'si acilir; icinde TABLO YOKTUR.
-- Modul schema'lari (tenant, identity, authorization, audit) Faz 2'den itibaren
-- kendi migration'lari ile eklenir.

CREATE SCHEMA IF NOT EXISTS platform AUTHORIZATION businessos_owner;

-- Uygulama rolu schema'yi gorebilir ama icinde nesne olusturamaz.
GRANT USAGE ON SCHEMA platform TO businessos_app;

-- Bundan sonra owner'in platform schema'sinda olusturacagi her tablo icin
-- uygulama rolune otomatik DML yetkisi verilir. DDL yetkisi ASLA verilmez.
ALTER DEFAULT PRIVILEGES FOR ROLE businessos_owner IN SCHEMA platform
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO businessos_app;

ALTER DEFAULT PRIVILEGES FOR ROLE businessos_owner IN SCHEMA platform
  GRANT USAGE, SELECT ON SEQUENCES TO businessos_app;

-- public schema kilitlenir: hicbir modul oraya tablo birakmaz.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
