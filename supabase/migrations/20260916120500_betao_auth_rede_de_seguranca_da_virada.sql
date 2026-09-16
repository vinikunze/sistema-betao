-- =============================================================
-- SEGURANÇA, ETAPA 2 — rede de segurança da virada (com prazo de validade)
--
-- O hash antigo foi copiado para auth.users e a matemática do bcrypt confere
-- (mesmo formato $2a$, 60 caracteres; só muda o custo, 6 contra 10). Mas quem
-- valida de verdade é o serviço de login do Supabase, e do contêiner de
-- desenvolvimento não dá para chamá-lo. Se ele recusasse o hash copiado, a
-- oficina ficaria sem entrar no sistema no dia da virada.
--
-- Esta função fecha esse buraco: se a pessoa acertar a senha que JÁ está em
-- credenciais, o banco regrava essa mesma senha no formato do Supabase e o app
-- tenta entrar de novo. Só age depois de a senha certa ser provada, então não
-- abre nada novo — e de quebra reforça o hash de custo 6 para 10.
--
-- É FERRAMENTA DE MIGRAÇÃO: a parte 2 apaga esta função junto com o acesso
-- anônimo. Até lá ela vive, com a mesma exposição que login_socio e
-- login_mecanico já tinham.
-- =============================================================
create or replace function public.betao_reparar_senha(p_login text, p_senha text)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $fn$
declare
    v_id text; v_email text; v_hash text;
begin
    if p_login is null or p_senha is null or length(p_senha) = 0 then
        return false;
    end if;

    select s.id, lower(trim(s.email)), c.senha_hash
      into v_id, v_email, v_hash
      from public.socios s
      join public.credenciais c on c.tipo = 'socio' and c.usuario_id = s.id
     where lower(trim(s.email)) = lower(trim(p_login))
     limit 1;

    if v_id is null then
        select m.id,
               lower(regexp_replace(
                   translate(m.nome, 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
                                     'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'),
                   '[^A-Za-z0-9]', '', 'g')) || '@mecanico.betaoautocenter.com.br',
               c.senha_hash
          into v_id, v_email, v_hash
          from public.mecanicos m
          join public.credenciais c on c.tipo = 'mecanico' and c.usuario_id = m.id
         where upper(trim(m.nome)) = upper(trim(p_login))
         limit 1;
    end if;

    if v_id is null or v_hash is null then
        return false;
    end if;

    -- Senha errada: não mexe em nada e não conta por quê.
    if v_hash <> crypt(p_senha, v_hash) then
        return false;
    end if;

    update auth.users
       set encrypted_password = crypt(p_senha, gen_salt('bf', 10)),
           updated_at = now()
     where lower(email) = v_email;

    return found;
end $fn$;

revoke all on function public.betao_reparar_senha(text, text) from public;
grant execute on function public.betao_reparar_senha(text, text) to anon, authenticated;
