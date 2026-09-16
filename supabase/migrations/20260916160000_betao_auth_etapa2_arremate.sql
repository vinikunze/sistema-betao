-- =============================================================
-- SEGURANÇA, ETAPA 2 — ARREMATE
--
-- Com o acesso anônimo fechado, rodei o auditor do Supabase para ver o que
-- tinha ficado. Duas coisas apareceram, as duas de defesa em profundidade:
-- nenhuma das duas é um buraco aberto hoje, e é justamente por isso que sai
-- barato consertar agora.
-- =============================================================

-- -------------------------------------------------------------
-- 1. Mexer na equipe não é assunto de quem não entrou
--
-- salvar_mecanico e deletar_mecanico são SECURITY DEFINER — rodam com poder de
-- dono do banco — e o EXECUTE delas estava aberto para `anon`, a chave pública
-- que vai no código do site.
--
-- O estrago está barrado: as duas começam conferindo
--
--     if public.betao_papel() is distinct from 'socio' then raise ...
--
-- e `betao_papel()` só responde para quem tem sessão. Quem chamasse sem entrar
-- levaria "Só o proprietário pode mexer na equipe".
--
-- Mesmo assim o EXECUTE sai: a conferência mora DENTRO da função, e uma
-- reescrita futura que esqueça essa primeira linha volta a expor apagar
-- mecânico e trocar senha de mecânico para a internet inteira. Duas travas na
-- mesma porta custam uma linha de SQL.
--
-- registrar_socio continua aberta a `anon` de propósito: é a tela de cadastro,
-- usada por quem ainda não tem conta. Lá quem barra é o código da empresa, que
-- a própria função confere.
-- -------------------------------------------------------------
revoke execute on function public.salvar_mecanico(text, text, numeric, text) from anon;
revoke execute on function public.deletar_mecanico(text) from anon;

-- -------------------------------------------------------------
-- 2. betao_os_do_mecanico com o caminho de busca preso
--
-- É a função que decide quais OS um mecânico enxerga — ela roda dentro das
-- políticas de `os` e de `os_fotos`. Diferente das outras, é SECURITY INVOKER:
-- roda com o crachá de quem chamou.
--
-- Sem `search_path` fixo, ela procura `jsonb_array_elements` na lista de
-- esquemas que o chamador estiver usando. Quem conseguisse criar um esquema
-- antes de `pg_catalog` nessa lista poderia plantar uma função com esse nome e
-- mandar na resposta — ou seja, escolher quais OS aparecem para ele. É uma
-- brecha estreita (hoje o PostgREST fixa o caminho), mas é a função mais
-- sensível do conjunto, e prender o caminho é uma linha.
--
-- `stable`, não `immutable`: ela lê perfis_betao através de betao_ref(). Já
-- errei isso uma vez nesta migração — declarada immutable, o Postgres pode
-- guardar o resultado do primeiro mecânico e reaproveitar para o seguinte, e
-- aí um mecânico enxerga as OS do outro.
-- -------------------------------------------------------------
create or replace function public.betao_os_do_mecanico(p_servicos jsonb)
returns boolean
language sql
stable
set search_path to 'public', 'pg_catalog', 'pg_temp'
as $$
    select exists (
        select 1 from jsonb_array_elements(coalesce(p_servicos, '[]'::jsonb)) s
        where s->>'mecanicoId' = public.betao_ref()
    );
$$;
