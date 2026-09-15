-- Pagamento é um eixo INDEPENDENTE do status do serviço: uma OS pode estar
-- entregue e não paga (a venda na carteira). Por isso colunas próprias, e não
-- mais valores empilhados dentro de status.
alter table public.os
    add column if not exists pagamento       text    not null default 'nao_pago',
    add column if not exists forma_pagamento text    not null default '',
    add column if not exists valor_pago      numeric not null default 0;

-- Só barra o que é claramente lixo; não engessa valores futuros de status,
-- que o frontend controla.
alter table public.os drop constraint if exists os_pagamento_valido;
alter table public.os add constraint os_pagamento_valido
    check (pagamento in ('nao_pago', 'parcial', 'pago'));

alter table public.os drop constraint if exists os_valor_pago_nao_negativo;
alter table public.os add constraint os_valor_pago_nao_negativo
    check (valor_pago >= 0);

-- "Quanto ainda tenho para receber" é a pergunta que essas colunas existem
-- para responder, então o índice acompanha o filtro que a tela usa.
create index if not exists os_pagamento_idx on public.os (pagamento);
