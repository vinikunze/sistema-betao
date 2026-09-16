-- GARANTIA E RETORNO
-- Retrabalho custa peça, mão de obra e comissão — e não havia como medir nem
-- como ser avisado. Isso só é possível agora porque o sistema reconhece que
-- duas OS são do mesmo carro (cadastro de veículos).

-- Prazo por tipo de serviço: alinhamento não tem a mesma garantia que motor.
alter table public.catalogo_servicos
    add column if not exists garantia_dias integer not null default 90;

alter table public.os
    -- Aponta para a OS que está sendo refeita. Guardar a origem, e não só um
    -- "sim/não", é o que permite achar depois o serviço que deu problema.
    add column if not exists retorno_de_os text,
    add column if not exists retorno_motivo text not null default '';

create index if not exists os_retorno_idx on public.os (retorno_de_os);

update public.catalogo_servicos set garantia_dias = 30
 where nome in ('ALINHAMENTO', 'BALANCEAMENTO', 'CAMBAGEM', 'RODÍZIO DE PNEUS',
                'HIGIENIZAÇÃO DO AR CONDICIONADO', 'LIMPEZA DE BICOS INJETORES',
                'LIMPEZA DO CORPO DE BORBOLETA', 'DIAGNÓSTICO ELETRÔNICO (SCANNER)');

update public.catalogo_servicos set garantia_dias = 180
 where nome in ('TROCA DE EMBREAGEM', 'TROCA DE CORREIA DENTADA', 'TROCA DE BOMBA D''ÁGUA',
                'TROCA DE AMORTECEDOR', 'TROCA DE HOMOCINÉTICA');

update public.catalogo_servicos set garantia_dias = 0
 where nome = 'MÃO DE OBRA AVULSA';
