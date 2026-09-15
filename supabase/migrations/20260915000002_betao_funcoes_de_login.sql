-- O app manda usuário e senha; o banco responde apenas "é você, e este é o seu
-- nome". O hash nunca sai daqui.
-- search_path fixo: SECURITY DEFINER sem isso é porta aberta para sequestro de
-- resolução de nomes.

create or replace function public.login_socio(p_user text, p_senha text)
returns table (id text, nome text)
language sql
security definer
set search_path = public, extensions
as $$
    select s.id, s.nome
    from public.socios s
    join public.credenciais c on c.tipo = 'socio' and c.usuario_id = s.id
    where (lower(s.email) = lower(btrim(p_user)) or lower(s.nome) = lower(btrim(p_user)))
      and c.senha_hash = crypt(p_senha, c.senha_hash)
    limit 1;
$$;

create or replace function public.login_mecanico(p_nome text, p_senha text)
returns table (id text, nome text, comissao numeric)
language sql
security definer
set search_path = public, extensions
as $$
    select m.id, m.nome, m.comissao
    from public.mecanicos m
    join public.credenciais c on c.tipo = 'mecanico' and c.usuario_id = m.id
    where lower(m.nome) = lower(btrim(p_nome))
      and c.senha_hash = crypt(p_senha, c.senha_hash)
    limit 1;
$$;

-- O código da empresa é conferido aqui dentro, não no navegador.
create or replace function public.registrar_socio(p_nome text, p_email text, p_senha text, p_codigo text)
returns table (id text, nome text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
    v_codigo text;
    v_id     text;
begin
    select valor into v_codigo from public.config_app where chave = 'codigo_socios';
    if v_codigo is null or btrim(p_codigo) <> v_codigo then
        raise exception 'Código da empresa inválido' using errcode = 'P0001';
    end if;
    if btrim(coalesce(p_nome, '')) = '' or btrim(coalesce(p_email, '')) = '' then
        raise exception 'Preencha nome e e-mail' using errcode = 'P0001';
    end if;
    if length(coalesce(p_senha, '')) < 4 then
        raise exception 'A senha precisa ter ao menos 4 caracteres' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.socios where lower(email) = lower(btrim(p_email))) then
        raise exception 'Já existe um sócio com esse e-mail' using errcode = 'P0001';
    end if;

    v_id := (extract(epoch from clock_timestamp()) * 1000)::bigint::text;
    insert into public.socios (id, nome, email) values (v_id, upper(btrim(p_nome)), btrim(p_email));
    insert into public.credenciais (tipo, usuario_id, senha_hash)
    values ('socio', v_id, crypt(p_senha, gen_salt('bf')));

    return query select v_id, upper(btrim(p_nome));
end $$;

-- Cadastro/edição de mecânico. Senha em branco na edição mantém a atual —
-- ninguém consegue mais LER a senha para redigitá-la, então tem que ser assim.
create or replace function public.salvar_mecanico(p_id text, p_nome text, p_comissao numeric, p_senha text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_id text;
begin
    if btrim(coalesce(p_nome, '')) = '' then
        raise exception 'Informe o nome do mecânico' using errcode = 'P0001';
    end if;

    v_id := coalesce(nullif(btrim(coalesce(p_id, '')), ''),
                     (extract(epoch from clock_timestamp()) * 1000)::bigint::text);

    insert into public.mecanicos (id, nome, comissao)
    values (v_id, upper(btrim(p_nome)), coalesce(p_comissao, 0))
    on conflict (id) do update set nome = excluded.nome, comissao = excluded.comissao;

    if coalesce(p_senha, '') <> '' then
        insert into public.credenciais (tipo, usuario_id, senha_hash)
        values ('mecanico', v_id, crypt(p_senha, gen_salt('bf')))
        on conflict (tipo, usuario_id) do update set senha_hash = excluded.senha_hash;
    elsif not exists (select 1 from public.credenciais where tipo = 'mecanico' and usuario_id = v_id) then
        raise exception 'Defina uma senha para o novo mecânico' using errcode = 'P0001';
    end if;

    return v_id;
end $$;

create or replace function public.deletar_mecanico(p_id text)
returns void
language sql
security definer
set search_path = public, extensions
as $$
    delete from public.credenciais where tipo = 'mecanico' and usuario_id = p_id;
    delete from public.mecanicos where id = p_id;
$$;

-- Só estas funções ficam ao alcance da chave pública.
revoke all on function public.login_socio(text, text)                      from public, anon, authenticated;
revoke all on function public.login_mecanico(text, text)                   from public, anon, authenticated;
revoke all on function public.registrar_socio(text, text, text, text)      from public, anon, authenticated;
revoke all on function public.salvar_mecanico(text, text, numeric, text)   from public, anon, authenticated;
revoke all on function public.deletar_mecanico(text)                       from public, anon, authenticated;

grant execute on function public.login_socio(text, text)                    to anon, authenticated;
grant execute on function public.login_mecanico(text, text)                 to anon, authenticated;
grant execute on function public.registrar_socio(text, text, text, text)    to anon, authenticated;
grant execute on function public.salvar_mecanico(text, text, numeric, text) to anon, authenticated;
grant execute on function public.deletar_mecanico(text)                     to anon, authenticated;
