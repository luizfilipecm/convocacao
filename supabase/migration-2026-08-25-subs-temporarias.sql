-- Migração: substituições temporárias (voltam aos times originais após a partida).
-- Rode APENAS se você já tinha executado uma versão anterior do schema.sql
-- (o schema.sql atual já inclui essa coluna).
alter table substitutions add column if not exists temporary boolean not null default false;
