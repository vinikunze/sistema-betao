-- =============================================================
-- TROCAR A PRÓPRIA SENHA, pelo sistema
--
-- Até aqui não havia como trocar a senha sem mexer no banco à mão.
--
-- POR QUE NÃO `auth.updateUser({password})` DIRETO DO NAVEGADOR
-- A senha vive em DOIS lugares: `credenciais.senha_hash` (que o app usa desde
-- antes do Supabase Auth) e `auth.users.encrypted_password`. Trocando só no
-- Supabase, a rede de segurança da virada (`betao_reparar_senha`) veria a
-- senha antiga em `credenciais` e, na primeira tentativa de login que
-- falhasse, REGRAVARIA a velha por cima da nova — a troca desfeita sozinha,
-- sem ninguém entender por quê.
--
-- Então a troca passa por aqui, que mexe nos dois de uma vez.
--
-- PEDE A SENHA ATUAL DE PROPÓSITO
-- Num tablet que fica aberto na bancada, sem isso qualquer um que passasse
-- pela tela trancaria o dono para fora do próprio sistema.
--
-- E o hash novo sai em custo 10: as senhas migradas em custo 6 ganham força
-- justamente aqui.
-- =============================================================
create or replace function public.betao_trocar_minha_senha(p_senha_atual text, p_senha_nova text)
returns text
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $fn$
declare
    v_papel text; v_ref text; v_hash text; v_email text; v_novo text;
begin
    v_papel := public.betao_papel();
    v_ref   := public.betao_ref();
    if v_papel is null then
        raise exception 'Entre no sistema antes de trocar a senha' using errcode = 'P0001';
    end if;

    if length(coalesce(p_senha_nova, '')) < 8 then
        raise exception 'A senha nova precisa ter ao menos 8 caracteres' using errcode = 'P0001';
    end if;
    if coalesce(p_senha_atual, '') = coalesce(p_senha_nova, '') then
        raise exception 'A senha nova tem que ser diferente da atual' using errcode = 'P0001';
    end if;

    select c.senha_hash into v_hash
      from public.credenciais c
     where c.tipo = v_papel and c.usuario_id = v_ref;

    if v_hash is null or v_hash <> crypt(coalesce(p_senha_atual, ''), v_hash) then
        raise exception 'A senha atual não confere' using errcode = 'P0001';
    end if;

    select u.email into v_email
      from public.perfis_betao pb
      join auth.users u on u.id = pb.auth_uid
     where pb.auth_uid = auth.uid();

    if v_email is null then
        raise exception 'Conta de acesso não encontrada' using errcode = 'P0001';
    end if;

    v_novo := crypt(p_senha_nova, gen_salt('bf', 10));

    update public.credenciais set senha_hash = v_novo
     where tipo = v_papel and usuario_id = v_ref;

    update auth.users
       set encrypted_password = v_novo, updated_at = now()
     where lower(email) = lower(v_email);

    return 'ok';
end $fn$;

revoke all on function public.betao_trocar_minha_senha(text, text) from public;
grant execute on function public.betao_trocar_minha_senha(text, text) to authenticated;
