-- =============================================================
-- SEGURANÇA, ETAPA 2 — as funções que criam gente
--
-- Cadastrar sócio e cadastrar mecânico gravavam em socios/mecanicos e
-- credenciais, e paravam aí. Sob o modelo novo quem abre as tabelas é a sessão
-- do Supabase Auth, então alguém cadastrado assim nasceria sem conseguir
-- entrar em lugar nenhum. As três funções abaixo passam a criar também a conta
-- de acesso.
--
-- E, tão importante quanto: salvar_mecanico e deletar_mecanico eram SECURITY
-- DEFINER sem perguntar QUEM estava chamando. Com a chave anon pública, dava
-- para qualquer um criar mecânico, apagar mecânico ou mexer na comissão dos
-- existentes — sem senha nenhuma. Agora elas exigem que quem chama seja sócio.
--
-- (Este arquivo documenta o que já foi aplicado em produção; o conteúdo é o
--  mesmo das migrações betao_registrar_socio_cria_conta_de_acesso e
--  betao_salvar_mecanico_cria_conta_e_exige_socio.)
-- =============================================================

-- -------------------------------------------------------------
-- NOVO SÓCIO
-- O código da empresa continua sendo a tranca, conferido no banco.
-- -------------------------------------------------------------
create or replace function public.registrar_socio(p_nome text, p_email text, p_senha text, p_codigo text)
returns table(id text, nome text)
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $fn$
declare
    v_codigo text; v_id text; v_email text; v_uid uuid; v_hash text;
begin
    select valor into v_codigo from public.config_app where chave = 'codigo_socios';
    if v_codigo is null or btrim(p_codigo) <> v_codigo then
        raise exception 'Código da empresa inválido' using errcode = 'P0001';
    end if;
    if btrim(coalesce(p_nome, '')) = '' or btrim(coalesce(p_email, '')) = '' then
        raise exception 'Preencha nome e e-mail' using errcode = 'P0001';
    end if;
    -- 4 caracteres não seguram nada. 8 é o mínimo honesto para uma conta que
    -- enxerga o faturamento inteiro da oficina.
    if length(coalesce(p_senha, '')) < 8 then
        raise exception 'A senha precisa ter ao menos 8 caracteres' using errcode = 'P0001';
    end if;

    v_email := lower(btrim(p_email));
    if exists (select 1 from public.socios where lower(email) = v_email) then
        raise exception 'Já existe um sócio com esse e-mail' using errcode = 'P0001';
    end if;
    if exists (select 1 from auth.users where lower(email) = v_email) then
        raise exception 'Esse e-mail já tem conta neste sistema' using errcode = 'P0001';
    end if;

    v_id   := (extract(epoch from clock_timestamp()) * 1000)::bigint::text;
    v_hash := crypt(p_senha, gen_salt('bf', 10));
    v_uid  := gen_random_uuid();

    insert into public.socios (id, nome, email) values (v_id, upper(btrim(p_nome)), btrim(p_email));
    insert into public.credenciais (tipo, usuario_id, senha_hash) values ('socio', v_id, v_hash);

    insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data,
        is_sso_user, is_anonymous, email_change_confirm_status
    ) values (
        '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
        v_email, v_hash, now(), now(), now(),
        jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
        jsonb_build_object('nome', upper(btrim(p_nome)), 'papel', 'socio'),
        false, false, 0
    );
    insert into auth.identities (id, provider_id, user_id, identity_data, provider, created_at, updated_at)
    values (gen_random_uuid(), v_uid, v_uid,
            jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true),
            'email', now(), now());

    insert into public.perfis_betao (auth_uid, papel, ref_id) values (v_uid, 'socio', v_id);

    return query select v_id, upper(btrim(p_nome));
end $fn$;

-- -------------------------------------------------------------
-- EQUIPE — só o sócio mexe
-- -------------------------------------------------------------
create or replace function public.salvar_mecanico(p_id text, p_nome text, p_comissao numeric, p_senha text)
returns text
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $fn$
declare
    v_id text; v_nome text; v_email text; v_hash text; v_uid uuid; v_email_antigo text;
begin
    if public.betao_papel() is distinct from 'socio' then
        raise exception 'Só o proprietário pode mexer na equipe' using errcode = 'P0001';
    end if;

    v_nome := upper(btrim(coalesce(p_nome, '')));
    if v_nome = '' then raise exception 'Informe o nome' using errcode = 'P0001'; end if;

    -- Mesma regra do app: sem acento, sem espaço, minúsculo.
    v_email := lower(regexp_replace(
        translate(v_nome, 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
                          'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'),
        '[^A-Za-z0-9]', '', 'g')) || '@mecanico.betaoautocenter.com.br';

    if coalesce(btrim(p_id), '') = '' then
        if length(coalesce(p_senha, '')) < 4 then
            raise exception 'Defina uma senha para o novo mecânico' using errcode = 'P0001';
        end if;
        if exists (select 1 from auth.users where lower(email) = v_email) then
            raise exception 'Já existe um mecânico com esse nome' using errcode = 'P0001';
        end if;

        v_id   := (extract(epoch from clock_timestamp()) * 1000)::bigint::text;
        v_hash := crypt(p_senha, gen_salt('bf', 10));
        v_uid  := gen_random_uuid();

        insert into public.mecanicos (id, nome, comissao) values (v_id, v_nome, coalesce(p_comissao, 0));
        insert into public.credenciais (tipo, usuario_id, senha_hash) values ('mecanico', v_id, v_hash);

        insert into auth.users (
            instance_id, id, aud, role, email, encrypted_password,
            email_confirmed_at, created_at, updated_at,
            raw_app_meta_data, raw_user_meta_data,
            is_sso_user, is_anonymous, email_change_confirm_status
        ) values (
            '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
            v_email, v_hash, now(), now(), now(),
            jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
            jsonb_build_object('nome', v_nome, 'papel', 'mecanico'),
            false, false, 0
        );
        insert into auth.identities (id, provider_id, user_id, identity_data, provider, created_at, updated_at)
        values (gen_random_uuid(), v_uid, v_uid,
                jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true),
                'email', now(), now());

        insert into public.perfis_betao (auth_uid, papel, ref_id) values (v_uid, 'mecanico', v_id);
    else
        v_id := btrim(p_id);
        if not exists (select 1 from public.mecanicos where id = v_id) then
            raise exception 'Mecânico não encontrado' using errcode = 'P0001';
        end if;

        select u.email into v_email_antigo
          from public.perfis_betao pb join auth.users u on u.id = pb.auth_uid
         where pb.papel = 'mecanico' and pb.ref_id = v_id;

        -- O e-mail nasce do nome. Se o nome muda, o endereço de entrada muda
        -- junto: senão ele digitaria o nome novo e a conta não seria achada.
        if v_email_antigo is not null and lower(v_email_antigo) <> v_email then
            if exists (select 1 from auth.users where lower(email) = v_email) then
                raise exception 'Já existe um mecânico com esse nome' using errcode = 'P0001';
            end if;
            update auth.users set email = v_email, updated_at = now() where lower(email) = lower(v_email_antigo);
            update auth.identities
               set identity_data = jsonb_set(identity_data, '{email}', to_jsonb(v_email)), updated_at = now()
             where provider = 'email' and identity_data->>'email' = v_email_antigo;
        end if;

        update public.mecanicos set nome = v_nome, comissao = coalesce(p_comissao, 0) where id = v_id;

        -- Senha em branco mantém a atual; preenchida, troca nos dois lugares.
        if coalesce(btrim(p_senha), '') <> '' then
            v_hash := crypt(p_senha, gen_salt('bf', 10));
            update public.credenciais set senha_hash = v_hash where tipo = 'mecanico' and usuario_id = v_id;
            if not found then
                insert into public.credenciais (tipo, usuario_id, senha_hash) values ('mecanico', v_id, v_hash);
            end if;
            update auth.users set encrypted_password = v_hash, updated_at = now() where lower(email) = v_email;
        end if;
    end if;

    return v_id;
end $fn$;

revoke all on function public.salvar_mecanico(text, text, numeric, text) from public;
grant execute on function public.salvar_mecanico(text, text, numeric, text) to authenticated;

create or replace function public.deletar_mecanico(p_id text)
returns void
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $fn$
declare v_uid uuid;
begin
    if public.betao_papel() is distinct from 'socio' then
        raise exception 'Só o proprietário pode mexer na equipe' using errcode = 'P0001';
    end if;

    select auth_uid into v_uid from public.perfis_betao where papel = 'mecanico' and ref_id = p_id;

    delete from public.credenciais where tipo = 'mecanico' and usuario_id = p_id;
    delete from public.mecanicos where id = p_id;

    -- perfis_betao cai junto por ON DELETE CASCADE.
    if v_uid is not null then
        delete from auth.identities where user_id = v_uid;
        delete from auth.users where id = v_uid;
    end if;
end $fn$;

revoke all on function public.deletar_mecanico(text) from public;
grant execute on function public.deletar_mecanico(text) to authenticated;
