-- =============================================================
-- SEGURANÇA, ETAPA 2 — PARTE 1: contas de verdade e permissão por pessoa
--
-- Hoje as sete tabelas da oficina têm uma política "ALL" para o papel `anon`
-- com `using (true)`. Como a chave anon vive no código do site, que é público,
-- qualquer pessoa com o endereço do sistema lê e escreve TUDO: nome e telefone
-- de cliente, placa, valor cobrado, quanto cada mecânico ganha de comissão. E
-- escreve também — dava para um mecânico abrir o console e passar a própria
-- comissão de 25% para 90%.
--
-- A correção é deixar de confiar na chave e passar a confiar em QUEM ESTÁ
-- LOGADO: cada pessoa recebe uma conta no Supabase Auth, e a política olha
-- auth.uid(). Este projeto já usa esse padrão em 18 políticas dos outros apps
-- do Vinicius (viagens, casamento, cofre), então não é caminho novo aqui.
--
-- POR QUE EM DUAS PARTES
-- Esta parte só ACRESCENTA: cria as contas, o mapa de quem é quem e as
-- políticas para quem está logado. As políticas antigas do `anon` continuam
-- valendo, então nada para de funcionar enquanto o app novo não estiver no ar
-- e testado. A parte 2 apaga as do `anon` e fecha de verdade. Se a ordem fosse
-- invertida, haveria uma janela com a oficina trancada para fora do sistema.
--
-- AS SENHAS NÃO MUDAM
-- `credenciais.senha_hash` e `auth.users.encrypted_password` são os dois
-- bcrypt de 60 caracteres com prefixo $2a$. O hash é copiado como está, e cada
-- um continua entrando com a senha que já usa. O custo do nosso hash é 06
-- contra os 10 do Supabase — mais fraco —, mas não dá para aumentar sem ter a
-- senha em texto puro. Sobe sozinho na primeira troca de senha pelo app.
-- =============================================================

-- -------------------------------------------------------------
-- 1. QUEM É QUEM
-- Liga a conta do Supabase Auth à linha de socios/mecanicos. É o que as
-- políticas consultam para decidir o que cada pessoa pode ver.
-- -------------------------------------------------------------
create table if not exists public.perfis_betao (
    auth_uid   uuid primary key references auth.users(id) on delete cascade,
    papel      text not null check (papel in ('socio', 'mecanico')),
    ref_id     text not null,                       -- socios.id ou mecanicos.id
    criado_em  timestamptz not null default now(),
    unique (papel, ref_id)
);

comment on table public.perfis_betao is
    'Liga a conta do Supabase Auth à pessoa em socios/mecanicos. Sem linha aqui, a conta não enxerga nada da oficina.';

alter table public.perfis_betao enable row level security;

-- Cada um lê só o próprio perfil. Ninguém escreve pelo app: quem cria conta é
-- o dono, pela tela de Equipe, através de função com permissão elevada.
drop policy if exists perfis_betao_leitura_propria on public.perfis_betao;
create policy perfis_betao_leitura_propria on public.perfis_betao
    for select to authenticated
    using (auth_uid = auth.uid());

-- -------------------------------------------------------------
-- 2. AS DUAS PERGUNTAS QUE TODA POLÍTICA FAZ
--
-- SECURITY DEFINER porque a própria política de perfis_betao impediria a
-- leitura durante a avaliação de outra política — e daria recursão.
-- `stable` deixa o Postgres chamar uma vez por consulta em vez de uma vez por
-- linha, o que importa quando a lista de OS crescer.
-- search_path fixo para a função não ser sequestrada por uma tabela plantada
-- num schema que venha antes no caminho de busca.
-- -------------------------------------------------------------
create or replace function public.betao_papel()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select papel from public.perfis_betao where auth_uid = auth.uid();
$$;

create or replace function public.betao_ref()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select ref_id from public.perfis_betao where auth_uid = auth.uid();
$$;

comment on function public.betao_papel() is
    'socio, mecanico, ou nulo para quem está logado mas não é da oficina (os outros apps deste mesmo projeto).';

revoke all on function public.betao_papel() from public;
revoke all on function public.betao_ref() from public;
grant execute on function public.betao_papel() to authenticated;
grant execute on function public.betao_ref() to authenticated;

-- Uma OS é "do mecânico" quando ele aparece em algum serviço dela.
-- `stable`, não `immutable`: ela depende de quem está logado, via betao_ref().
-- Marcada como immutable, o Postgres poderia guardar o resultado de uma pessoa
-- e reaproveitar para outra — um mecânico veria as OS do colega.
create or replace function public.betao_os_do_mecanico(p_servicos jsonb)
returns boolean
language sql
stable
as $$
    select exists (
        select 1
        from jsonb_array_elements(coalesce(p_servicos, '[]'::jsonb)) s
        where s->>'mecanicoId' = public.betao_ref()
    );
$$;

grant execute on function public.betao_os_do_mecanico(jsonb) to authenticated;

-- -------------------------------------------------------------
-- 3. AS CONTAS
--
-- O sócio e os três mecânicos ganham conta no Supabase Auth com o hash que já
-- existe. Mecânico não tem e-mail de trabalho e entra digitando o nome, como
-- sempre fez; o e-mail aqui é só o endereço interno que o Supabase exige, e o
-- app monta o mesmo endereço a partir do nome na hora de entrar.
-- -------------------------------------------------------------
do $$
declare
    r          record;
    v_uid      uuid;
    v_email    text;
    v_existente uuid;
begin
    for r in
        select 'socio' as papel, s.id as ref_id, s.nome, lower(trim(s.email)) as email, c.senha_hash
          from public.socios s
          join public.credenciais c on c.tipo = 'socio' and c.usuario_id = s.id
         where s.email is not null and trim(s.email) <> ''
        union all
        select 'mecanico', m.id, m.nome,
               -- mesmo endereço que o app monta: sem acento, sem espaço
               lower(regexp_replace(
                   translate(m.nome, 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
                                     'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'),
                   '[^A-Za-z0-9]', '', 'g')) || '@mecanico.betaoautocenter.com.br',
               c.senha_hash
          from public.mecanicos m
          join public.credenciais c on c.tipo = 'mecanico' and c.usuario_id = m.id
    loop
        v_email := r.email;
        select id into v_existente from auth.users where lower(email) = v_email;

        if v_existente is null then
            v_uid := gen_random_uuid();

            insert into auth.users (
                instance_id, id, aud, role, email, encrypted_password,
                email_confirmed_at, created_at, updated_at,
                raw_app_meta_data, raw_user_meta_data,
                is_sso_user, is_anonymous, email_change_confirm_status
            ) values (
                '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
                v_email, r.senha_hash,
                now(), now(), now(),
                jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
                jsonb_build_object('nome', r.nome, 'papel', r.papel),
                false, false, 0
            );

            -- Sem a linha em identities o signInWithPassword não acha a conta.
            insert into auth.identities (
                id, provider_id, user_id, identity_data, provider, created_at, updated_at
            ) values (
                gen_random_uuid(), v_uid, v_uid,
                jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true),
                'email', now(), now()
            );
        else
            v_uid := v_existente;
        end if;

        insert into public.perfis_betao (auth_uid, papel, ref_id)
        values (v_uid, r.papel, r.ref_id)
        on conflict (papel, ref_id) do update set auth_uid = excluded.auth_uid;
    end loop;
end $$;

-- -------------------------------------------------------------
-- 4. AS PERMISSÕES
--
-- Sócio faz tudo. Mecânico vê só o que é dele e não mexe em dinheiro dos
-- outros — nem na própria comissão, que era o furo mais direto.
--
--  tabela            sócio   mecânico
--  os                tudo    lê as OS em que ele trabalhou; cria orçamento
--  clientes          tudo    lê e cria (o formulário cria ao gravar)
--  veiculos          tudo    lê e cria
--  catalogo_*        tudo    só lê
--  mecanicos         tudo    só lê (precisa da lista; NÃO muda a comissão)
--  os_fotos          tudo    lê e envia foto das OS dele
--  socios            nada    nada
-- -------------------------------------------------------------

-- ---- OS ----
drop policy if exists betao_os_socio on public.os;
create policy betao_os_socio on public.os
    for all to authenticated
    using (public.betao_papel() = 'socio')
    with check (public.betao_papel() = 'socio');

drop policy if exists betao_os_mecanico_le on public.os;
create policy betao_os_mecanico_le on public.os
    for select to authenticated
    using (public.betao_papel() = 'mecanico' and public.betao_os_do_mecanico(servicos));

-- Pode abrir orçamento, mas só com ele mesmo no serviço: assim ninguém lança
-- trabalho no nome de outro, nem cria OS já finalizada e paga.
drop policy if exists betao_os_mecanico_cria on public.os;
create policy betao_os_mecanico_cria on public.os
    for insert to authenticated
    with check (
        public.betao_papel() = 'mecanico'
        and status in ('orcamento', 'aberta')
        and public.betao_os_do_mecanico(servicos)
    );

-- ---- CLIENTES e VEICULOS ----
drop policy if exists betao_clientes_socio on public.clientes;
create policy betao_clientes_socio on public.clientes
    for all to authenticated
    using (public.betao_papel() = 'socio')
    with check (public.betao_papel() = 'socio');

drop policy if exists betao_clientes_mecanico on public.clientes;
create policy betao_clientes_mecanico on public.clientes
    for select to authenticated using (public.betao_papel() = 'mecanico');

drop policy if exists betao_clientes_mecanico_cria on public.clientes;
create policy betao_clientes_mecanico_cria on public.clientes
    for insert to authenticated with check (public.betao_papel() = 'mecanico');

drop policy if exists betao_veiculos_socio on public.veiculos;
create policy betao_veiculos_socio on public.veiculos
    for all to authenticated
    using (public.betao_papel() = 'socio')
    with check (public.betao_papel() = 'socio');

drop policy if exists betao_veiculos_mecanico on public.veiculos;
create policy betao_veiculos_mecanico on public.veiculos
    for select to authenticated using (public.betao_papel() = 'mecanico');

drop policy if exists betao_veiculos_mecanico_cria on public.veiculos;
create policy betao_veiculos_mecanico_cria on public.veiculos
    for insert to authenticated with check (public.betao_papel() = 'mecanico');

-- ---- CATÁLOGOS ----
drop policy if exists betao_cat_pecas_socio on public.catalogo_pecas;
create policy betao_cat_pecas_socio on public.catalogo_pecas
    for all to authenticated
    using (public.betao_papel() = 'socio')
    with check (public.betao_papel() = 'socio');

drop policy if exists betao_cat_pecas_mecanico on public.catalogo_pecas;
create policy betao_cat_pecas_mecanico on public.catalogo_pecas
    for select to authenticated using (public.betao_papel() = 'mecanico');

drop policy if exists betao_cat_servicos_socio on public.catalogo_servicos;
create policy betao_cat_servicos_socio on public.catalogo_servicos
    for all to authenticated
    using (public.betao_papel() = 'socio')
    with check (public.betao_papel() = 'socio');

drop policy if exists betao_cat_servicos_mecanico on public.catalogo_servicos;
create policy betao_cat_servicos_mecanico on public.catalogo_servicos
    for select to authenticated using (public.betao_papel() = 'mecanico');

-- ---- MECÂNICOS ----
-- O mecânico LÊ a lista (o formulário precisa dela) mas não escreve. Era aqui
-- que estava o furo mais direto: com a chave anon dava para dar um PATCH e
-- subir a própria comissão.
drop policy if exists betao_mecanicos_socio on public.mecanicos;
create policy betao_mecanicos_socio on public.mecanicos
    for all to authenticated
    using (public.betao_papel() = 'socio')
    with check (public.betao_papel() = 'socio');

drop policy if exists betao_mecanicos_mecanico_le on public.mecanicos;
create policy betao_mecanicos_mecanico_le on public.mecanicos
    for select to authenticated using (public.betao_papel() = 'mecanico');

-- ---- FOTOS ----
drop policy if exists betao_fotos_socio on public.os_fotos;
create policy betao_fotos_socio on public.os_fotos
    for all to authenticated
    using (public.betao_papel() = 'socio')
    with check (public.betao_papel() = 'socio');

drop policy if exists betao_fotos_mecanico on public.os_fotos;
create policy betao_fotos_mecanico on public.os_fotos
    for select to authenticated
    using (
        public.betao_papel() = 'mecanico'
        and exists (select 1 from public.os o
                     where o.id = os_fotos.os_id and public.betao_os_do_mecanico(o.servicos))
    );

drop policy if exists betao_fotos_mecanico_envia on public.os_fotos;
create policy betao_fotos_mecanico_envia on public.os_fotos
    for insert to authenticated
    with check (
        public.betao_papel() = 'mecanico'
        and exists (select 1 from public.os o
                     where o.id = os_fotos.os_id and public.betao_os_do_mecanico(o.servicos))
    );
