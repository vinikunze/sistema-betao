-- =============================================================
-- CONTAS CRIADAS POR SQL NÃO CONSEGUIAM ENTRAR
--
-- O sintoma: senha certa, mensagem de "usuário ou senha incorretos".
--
-- A causa: o serviço de login do Supabase (GoTrue) lê `confirmation_token`,
-- `recovery_token`, `email_change` e `email_change_token_new` como TEXTO, não
-- como texto-que-pode-ser-nulo. Ao inserir em `auth.users` direto por SQL essas
-- colunas nascem NULL — elas não têm DEFAULT —, a leitura quebra ANTES de
-- conferir a senha, e o que chega no navegador é indistinguível de senha
-- errada.
--
-- Como ficou claro que o hash migrado estava certo o tempo todo:
-- `betao_reparar_senha` rodou e regravou a senha em custo 10, o que só
-- acontece depois de a senha CERTA ser conferida contra `credenciais` — e
-- mesmo assim o login seguiu recusando. Comparando lado a lado a linha da
-- conta antiga do Vinicius (criada pelo próprio Supabase, e que entra normal)
-- com a que eu criei, as quatro colunas apareceram: '' numa, NULL na outra.
--
-- Este arquivo tem as duas partes: consertar quem já existe, e impedir que
-- aconteça de novo.
-- =============================================================

-- -------------------------------------------------------------
-- 1. As contas que já existem
-- O coalesce cobre todas as contas do projeto, inclusive as dos outros apps,
-- e não toca em nenhuma que já esteja correta.
-- -------------------------------------------------------------
update auth.users
   set confirmation_token         = coalesce(confirmation_token, ''),
       recovery_token             = coalesce(recovery_token, ''),
       email_change               = coalesce(email_change, ''),
       email_change_token_new     = coalesce(email_change_token_new, ''),
       email_change_token_current = coalesce(email_change_token_current, ''),
       reauthentication_token     = coalesce(reauthentication_token, ''),
       phone_change               = coalesce(phone_change, ''),
       phone_change_token         = coalesce(phone_change_token, '')
 where confirmation_token is null
    or recovery_token is null
    or email_change is null
    or email_change_token_new is null
    or email_change_token_current is null
    or reauthentication_token is null
    or phone_change is null
    or phone_change_token is null;

-- -------------------------------------------------------------
-- 2. A causa raiz, num lugar só
--
-- `registrar_socio` e `salvar_mecanico` montavam o INSERT cada uma por conta
-- própria. Em vez de repetir a lista de colunas nas duas (e esquecer numa
-- terceira daqui a seis meses), criar conta passa a ser uma função só.
-- -------------------------------------------------------------
create or replace function public.betao_criar_conta_auth(p_email text, p_hash text, p_nome text, p_papel text)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $fn$
declare
    v_uid uuid := gen_random_uuid();
    v_email text := lower(btrim(p_email));
begin
    insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password,
        email_confirmed_at, created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data,
        is_sso_user, is_anonymous, email_change_confirm_status,
        -- TEXTO VAZIO, nunca NULL. É isto que faz a conta conseguir entrar.
        confirmation_token, recovery_token, email_change,
        email_change_token_new, email_change_token_current,
        reauthentication_token, phone_change, phone_change_token
    ) values (
        '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
        v_email, p_hash, now(), now(), now(),
        jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
        jsonb_build_object('nome', p_nome, 'papel', p_papel),
        false, false, 0,
        '', '', '', '', '', '', '', ''
    );

    -- Sem a linha em identities o signInWithPassword não acha a conta.
    insert into auth.identities (id, provider_id, user_id, identity_data, provider, created_at, updated_at)
    values (gen_random_uuid(), v_uid::text, v_uid,
            jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true),
            'email', now(), now());

    return v_uid;
end $fn$;

revoke all on function public.betao_criar_conta_auth(text, text, text, text) from public;

-- `registrar_socio` e `salvar_mecanico` passam a chamar o helper em vez de
-- montar o INSERT cada uma. O corpo completo das duas está aplicado em
-- produção na migração de mesmo nome; aqui fica o que mudou.
