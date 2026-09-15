-- As senhas eram guardadas em texto puro e a tela de login baixava a tabela
-- inteira para comparar no navegador. Qualquer pessoa com o endereço do site
-- lia a senha do dono antes mesmo de digitar qualquer coisa.
-- Agora: hash bcrypt, guardado numa tabela que a API não expõe, e a conferência
-- acontece DENTRO do banco.

create extension if not exists pgcrypto with schema extensions;

-- Sem nenhuma policy: inalcançável pela chave pública. Só as funções
-- SECURITY DEFINER conseguem ler.
create table if not exists public.credenciais (
    tipo       text not null check (tipo in ('socio', 'mecanico')),
    usuario_id text not null,
    senha_hash text not null,
    criado_em  timestamptz not null default now(),
    primary key (tipo, usuario_id)
);
alter table public.credenciais enable row level security;

create table if not exists public.config_app (
    chave text primary key,
    valor text not null
);
alter table public.config_app enable row level security;

-- O código da empresa estava dentro do script.js, à vista de qualquer um que
-- abrisse o código-fonte da página. Sai do navegador e vem para cá.
insert into public.config_app (chave, valor)
values ('codigo_socios', 'B17021103')
on conflict (chave) do nothing;

insert into public.credenciais (tipo, usuario_id, senha_hash)
select 'socio', id, extensions.crypt(senha, extensions.gen_salt('bf'))
from public.socios where senha is not null and senha <> ''
on conflict (tipo, usuario_id) do nothing;

insert into public.credenciais (tipo, usuario_id, senha_hash)
select 'mecanico', id, extensions.crypt(senha, extensions.gen_salt('bf'))
from public.mecanicos where senha is not null and senha <> ''
on conflict (tipo, usuario_id) do nothing;

-- Some com o texto puro. Deixar a coluna seria manter o problema de pé.
alter table public.socios    drop column if exists senha;
alter table public.mecanicos drop column if exists senha;

-- socios deixa de ser legível pela chave pública: o app não precisa mais dela.
drop policy if exists betao_public_socios on public.socios;
