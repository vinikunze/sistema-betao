-- =============================================================
-- SEGURANÇA, ETAPA 2 — PARTE 2: fechar o acesso anônimo
--
-- Os dois pré-requisitos foram cumpridos antes de aplicar:
--     1. o app novo no ar (deploy ae71639), e
--     2. entrada confirmada com as duas contas — o sócio às 17:37 e o PATRIK
--        às 19:09 de 16/09, as duas registradas em auth.users.last_sign_in_at.
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
-- Isso reabre as tabelas — é o estado de antes, inseguro, mas funcionando. As
-- fotos voltam trocando `to authenticated` por `to anon, authenticated` e
-- tirando o `and public.betao_papel() is not null` das três políticas de
-- storage lá embaixo.
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

-- -------------------------------------------------------------
-- O sócio precisa enxergar a própria linha em `socios`
--
-- Isto só apareceu ao simular a etapa 2 numa transação desfeita: `socios` tem
-- RLS ligada e ZERO políticas, ou seja, ninguém lê. Enquanto a política
-- anônima existia ela nem era consultada; sem ela, `carregarPerfil()` no
-- navegador leria zero linhas e o cabeçalho passaria a dizer "Usuário" no
-- lugar do nome — sem erro nenhum na tela, só o nome errado.
--
-- A própria linha, e só ela. O e-mail e o hash continuam fora do alcance
-- porque moram em `credenciais`, que segue sem política nenhuma: quem lê
-- senha é função SECURITY DEFINER, nunca o navegador.
-- -------------------------------------------------------------
drop policy if exists betao_socios_le_a_si on public.socios;
create policy betao_socios_le_a_si on public.socios
    for select to authenticated
    using (betao_papel() = 'socio' and id = betao_ref());

-- -------------------------------------------------------------
-- Mecânico não vê a comissão dos colegas
--
-- `betao_mecanicos_mecanico_le` liberava a tabela inteira para qualquer
-- mecânico logado — e a tabela tem a coluna `comissao`. Na oficina isso é o
-- tipo de coisa que vira discussão na hora do acerto: hoje o ANDERSON está em
-- 50% e o PATRIK em 25%.
--
-- Fica a própria linha. O painel do mecânico não perde nada: ele soma pelo
-- `comissaoVal` já gravado em cada serviço da OS, não pela porcentagem da
-- tabela. E o seletor de mecânico do formulário passa a ter só ele mesmo —
-- que é o certo: mecânico não lança serviço no nome do colega.
-- -------------------------------------------------------------
drop policy if exists betao_mecanicos_mecanico_le on public.mecanicos;
create policy betao_mecanicos_mecanico_le on public.mecanicos
    for select to authenticated
    using (betao_papel() = 'mecanico' and id = betao_ref());

-- -------------------------------------------------------------
-- As fotos dos carros
--
-- O balde `os-fotos` é privado, mas as três políticas de storage valiam para
-- `anon` — quem tivesse o endereço do sistema listava, baixava e APAGAVA a
-- foto de qualquer carro que passou pela oficina. Fechar as tabelas e deixar
-- isto aberto seria trancar a porta e esquecer a janela.
--
-- Agora vale o mesmo crachá do resto: precisa estar logado E ser gente da
-- oficina (`betao_papel()` só responde para quem tem linha em perfis_betao).
-- Qual foto é de qual OS continua sendo decidido na tabela `os_fotos`, que
-- tem a regra por OS; aqui é só a porta do balde.
-- -------------------------------------------------------------
drop policy if exists betao_os_fotos_leitura on storage.objects;
drop policy if exists betao_os_fotos_envio   on storage.objects;
drop policy if exists betao_os_fotos_remocao on storage.objects;

create policy betao_os_fotos_leitura on storage.objects
    for select to authenticated
    using (bucket_id = 'os-fotos' and public.betao_papel() is not null);

create policy betao_os_fotos_envio on storage.objects
    for insert to authenticated
    with check (bucket_id = 'os-fotos' and public.betao_papel() is not null);

create policy betao_os_fotos_remocao on storage.objects
    for delete to authenticated
    using (bucket_id = 'os-fotos' and public.betao_papel() is not null);

-- -------------------------------------------------------------
-- Apagar a foto errada, sem deixar lixo
--
-- `removerFoto` apaga o arquivo no storage E a linha em `os_fotos`. O mecânico
-- tinha permissão só para a primeira metade: o arquivo sumia, a linha ficava,
-- e a OS passava a apontar para uma foto que não existe mais. O erro era
-- engolido por um `catch` — ninguém via nada.
--
-- Mesmo recorte das outras regras dele: só nas OS em que ele trabalhou.
-- -------------------------------------------------------------
drop policy if exists betao_fotos_mecanico_apaga on public.os_fotos;
create policy betao_fotos_mecanico_apaga on public.os_fotos
    for delete to authenticated
    using (
        betao_papel() = 'mecanico'
        and exists (
            select 1 from public.os o
            where o.id = os_fotos.os_id and betao_os_do_mecanico(o.servicos)
        )
    );
