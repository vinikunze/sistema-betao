-- Até aqui, cliente e veículo eram texto digitado do zero em cada OS. Duas OS
-- do mesmo carro não tinham como se reconhecer, "JOÃO DA SILVA" e "JOAO SILVA"
-- viravam pessoas diferentes, e não havia como responder "o que já fizemos
-- nesse carro?". Agora são cadastros de verdade.

create table if not exists public.clientes (
    id          text primary key,
    nome        text not null,
    telefone    text not null default '',
    documento   text not null default '',
    observacoes text not null default '',
    created_at  timestamptz not null default now()
);

create table if not exists public.veiculos (
    id         text primary key,
    -- A placa é a identidade do carro: normalizada (só letras e números,
    -- maiúscula) e única, para o mesmo carro nunca virar dois cadastros.
    placa      text not null unique,
    cliente_id text references public.clientes(id) on delete set null,
    marca      text not null default '',
    modelo     text not null default '',
    ano        text not null default '',
    motor      text not null default '',
    km_atual   text not null default '',
    created_at timestamptz not null default now()
);

create index if not exists veiculos_cliente_idx on public.veiculos (cliente_id);

-- A OS guarda os dois: o vínculo, para cruzar histórico, e o texto, que é o
-- que foi impresso e combinado na época. Se o carro for vendido, a OS antiga
-- continua mostrando o dono de então.
alter table public.os
    add column if not exists cliente_id text references public.clientes(id) on delete set null,
    add column if not exists veiculo_id text references public.veiculos(id) on delete set null;

create index if not exists os_veiculo_idx on public.os (veiculo_id);
create index if not exists os_cliente_idx on public.os (cliente_id);

alter table public.clientes enable row level security;
alter table public.veiculos enable row level security;

do $$
declare t text;
begin
    foreach t in array array['clientes', 'veiculos']
    loop
        execute format('drop policy if exists %I on public.%I', 'betao_public_' || t, t);
        execute format(
            'create policy %I on public.%I for all to anon, authenticated using (true) with check (true)',
            'betao_public_' || t, t);
    end loop;
end $$;

-- Normaliza a placa sempre, venha de onde vier: o app, uma correção manual ou
-- uma importação futura. Sem isso, "ABC-1D23" e "abc1d23" seriam dois carros.
create or replace function public.normalizar_placa()
returns trigger
language plpgsql
set search_path = public
as $$
begin
    new.placa := upper(regexp_replace(coalesce(new.placa, ''), '[^A-Za-z0-9]', '', 'g'));
    if new.placa = '' then
        raise exception 'A placa não pode ficar vazia' using errcode = 'P0001';
    end if;
    return new;
end $$;

drop trigger if exists veiculos_normaliza_placa on public.veiculos;
create trigger veiculos_normaliza_placa
    before insert or update on public.veiculos
    for each row execute function public.normalizar_placa();
