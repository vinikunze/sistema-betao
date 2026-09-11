-- Sistema Betão Auto Center — tabelas do frontend estático
-- Aplicado no projeto Supabase "lua de mel" (ccvlaywiyvrixduvbccj), onde
-- convive com as tabelas de viagem / casamento / financeiro já existentes.

create table if not exists public.socios (
    id          text primary key,
    nome        text not null,
    email       text,
    senha       text,
    created_at  timestamptz not null default now()
);

create table if not exists public.mecanicos (
    id          text primary key,
    nome        text not null,
    comissao    numeric not null default 0,
    senha       text,
    created_at  timestamptz not null default now()
);

create table if not exists public.catalogo_pecas (
    id          text primary key,
    nome        text not null,
    created_at  timestamptz not null default now()
);

create table if not exists public.catalogo_servicos (
    id          text primary key,
    nome        text not null,
    created_at  timestamptz not null default now()
);

-- Ordens de serviço e orçamentos vivem na mesma tabela, separados por status
-- ('orcamento' | 'aberta' | 'andamento' | 'finalizada').
-- As colunas em camelCase são citadas porque o frontend envia exatamente esses nomes.
create table if not exists public.os (
    id             text primary key,
    cliente        text,
    veiculo        text,
    modelo         text,
    placa          text,
    km             text,
    motor          text,
    status         text not null default 'orcamento',
    servicos       jsonb not null default '[]'::jsonb,
    pecas          jsonb not null default '[]'::jsonb,
    "maoObra"      numeric not null default 0,
    "custoPecas"   numeric not null default 0,
    "receitaPecas" numeric not null default 0,
    total          numeric not null default 0,
    lucro          numeric not null default 0,
    comissao       numeric not null default 0,
    data           text,
    "dataISO"      text,
    created_at     timestamptz not null default now()
);

create index if not exists os_status_idx on public.os (status);
create index if not exists os_data_iso_idx on public.os ("dataISO");

alter table public.socios            enable row level security;
alter table public.mecanicos         enable row level security;
alter table public.catalogo_pecas    enable row level security;
alter table public.catalogo_servicos enable row level security;
alter table public.os                enable row level security;

-- O app é estático e não usa Supabase Auth: faz tudo com a chave pública.
-- As políticas abaixo liberam só estas cinco tabelas; o resto do projeto
-- continua protegido pelas políticas próprias.
do $$
declare
    t text;
begin
    foreach t in array array['socios', 'mecanicos', 'catalogo_pecas', 'catalogo_servicos', 'os']
    loop
        execute format('drop policy if exists %I on public.%I', 'betao_public_' || t, t);
        execute format(
            'create policy %I on public.%I for all to anon, authenticated using (true) with check (true)',
            'betao_public_' || t, t
        );
    end loop;
end $$;
