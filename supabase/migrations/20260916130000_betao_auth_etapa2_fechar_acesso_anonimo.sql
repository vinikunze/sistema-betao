-- =============================================================
-- SEGURANÇA, ETAPA 2 — PARTE 2: fechar o acesso anônimo
--
-- ⚠️  NÃO APLICAR ANTES DE:
--     1. o app novo estar no ar, e
--     2. o Vinicius ter entrado com a conta dele E com a de um mecânico.
--
-- A parte 1 só acrescentou: criou as contas, o mapa de quem é quem e as
-- políticas de quem está logado. Ela NÃO fechou nada — e não fecha mesmo, por
-- um detalhe que só apareceu quando testei: as políticas antigas eram
--
--     for ALL to {anon, authenticated} using (true)
--
-- ou seja, valiam também para quem está logado. Como as políticas do Postgres
-- se somam (basta UMA liberar), a antiga mascarava as novas: no teste, o
-- PATRIK conseguiu subir a própria comissão para 90% mesmo com a regra nova no
-- lugar. Enquanto estas sete linhas existirem, o sistema continua aberto.
--
-- Depois desta migração:
--   · a chave anon sozinha não lê nem escreve uma linha da oficina;
--   · cada consulta vale pelo crachá de quem está logado;
--   · mecânico vê só as OS em que trabalhou e não mexe na própria comissão.
--
-- COMO VOLTAR ATRÁS, se algo der errado no dia:
--   create policy betao_public_os on public.os for all to anon, authenticated
--       using (true) with check (true);
--   (e igual para clientes, veiculos, mecanicos, catalogo_pecas,
--    catalogo_servicos, os_fotos)
-- Isso reabre tudo — é o estado de hoje, inseguro, mas funcionando.
-- =============================================================

drop policy if exists betao_public_os              on public.os;
drop policy if exists betao_public_clientes        on public.clientes;
drop policy if exists betao_public_veiculos        on public.veiculos;
drop policy if exists betao_public_mecanicos       on public.mecanicos;
drop policy if exists betao_public_catalogo_pecas  on public.catalogo_pecas;
drop policy if exists betao_public_catalogo_servicos on public.catalogo_servicos;
drop policy if exists betao_public_os_fotos        on public.os_fotos;

-- -------------------------------------------------------------
-- As portas de entrada antigas
--
-- login_socio e login_mecanico conferiam a senha e devolviam id e nome. Quem
-- abria as tabelas, porém, era a chave anon — não elas. Sem acesso anônimo
-- elas não servem para mais nada, e cada uma que fica de pé é uma porta a
-- menos de senha para tentar no chute.
--
-- betao_reparar_senha era a rede de segurança da virada: regravava a senha no
-- formato do Supabase para quem acertasse a senha antiga. Cumprido o papel,
-- sai junto.
-- -------------------------------------------------------------
drop function if exists public.login_socio(text, text);
drop function if exists public.login_mecanico(text, text);
drop function if exists public.betao_reparar_senha(text, text);

-- registrar_socio continua, mas só faz sentido pelo código da empresa, que o
-- banco confere. Ela precisa ser chamável por quem ainda não entrou.
grant execute on function public.registrar_socio(text, text, text, text) to anon, authenticated;
