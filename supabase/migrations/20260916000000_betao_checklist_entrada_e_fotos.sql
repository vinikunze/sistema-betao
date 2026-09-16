-- CHECKLIST DE ENTRADA
-- Registra a condição do carro na chegada. O problema que resolve é concreto:
-- o cliente volta dizendo que o amassado foi a oficina. Com registro e foto
-- datados da entrada, a conversa acaba ali.

alter table public.os
    add column if not exists checklist jsonb not null default '{}'::jsonb;

-- FOTOS EM TABELA SEPARADA, NÃO EM COLUNA DA OS.
-- O app carrega todas as OS de uma vez com select('*'). Se a foto morasse na
-- linha da OS, cada abertura do sistema baixaria todas as fotos de todos os
-- serviços já feitos — o tablet ficaria inutilizável em poucos meses.
-- Aqui elas só são buscadas quando alguém abre aquela OS.
create table if not exists public.os_fotos (
    id         text primary key,
    os_id      text not null,
    caminho    text not null,          -- caminho dentro do bucket do Storage
    momento    text not null default 'entrada' check (momento in ('entrada', 'saida')),
    created_at timestamptz not null default now()
);

create index if not exists os_fotos_os_idx on public.os_fotos (os_id);

alter table public.os_fotos enable row level security;
drop policy if exists betao_public_os_fotos on public.os_fotos;
create policy betao_public_os_fotos on public.os_fotos
    for all to anon, authenticated using (true) with check (true);

-- O arquivo em si vai para o Storage, não para o banco: imagem em base64 numa
-- coluna infla cada linha e estoura a cota do projeto rápido.
-- Bucket PRIVADO: as fotos são abertas por URL assinada, com validade curta.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('os-fotos', 'os-fotos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
    set public = false,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists betao_os_fotos_leitura on storage.objects;
create policy betao_os_fotos_leitura on storage.objects
    for select to anon, authenticated using (bucket_id = 'os-fotos');

drop policy if exists betao_os_fotos_envio on storage.objects;
create policy betao_os_fotos_envio on storage.objects
    for insert to anon, authenticated with check (bucket_id = 'os-fotos');

drop policy if exists betao_os_fotos_remocao on storage.objects;
create policy betao_os_fotos_remocao on storage.objects
    for delete to anon, authenticated using (bucket_id = 'os-fotos');
