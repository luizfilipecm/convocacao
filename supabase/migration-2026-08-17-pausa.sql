-- Migração: pausa do cronômetro de partida.
-- Rode APENAS se você já tinha executado uma versão anterior do schema.sql
-- (o schema.sql atual já inclui essas colunas).
alter table matches add column if not exists paused_at timestamptz;
alter table matches add column if not exists paused_total_seg int not null default 0;
