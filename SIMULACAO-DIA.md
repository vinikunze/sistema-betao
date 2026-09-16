# Um dia inteiro de oficina, simulado no sistema

**Data da simulação:** 16/09/2026
**Como foi feito:** pelo navegador, na tela real do sistema, no tamanho do
tablet da oficina (1024×768) e no celular do mecânico (390×844). Nada foi
gravado no banco de verdade — a simulação roda contra um banco de mentira que
copia as regras do de produção (número de OS que não repete, placa única e
normalizada, senha só por função, storage). Assim o teste não deixou 5 carros
falsos para você apagar antes de começar a usar.

O dia teve um histórico plantado de propósito: uma OS de 20 dias atrás, do Onix
do Roberto, com pastilha de freio trocada — para o carro poder voltar hoje em
garantia.

---

## O dia que foi simulado

| Hora | Carro | O que aconteceu | Total | Pagamento |
|---|---|---|---|---|
| 07:30 | Uno / ABC-1D23 / João da Silva | Óleo + filtro de óleo | R$ 325,00 | Pago no Pix |
| 08:15 | Gol / DEF-2G34 / Maria Souza | Orçamento de freio (pastilha + disco) | R$ 900,00 | — |
| 09:40 | Ka / GHI-3J45 / Carlos Lima | Revisão + alinhamento + balanceamento | R$ 570,00 | Não pagou |
| 13:20 | Corolla / JKL-4M56 / Ana Pereira | Embreagem + óleo de câmbio | R$ 2.300,00 | Pagou R$ 800 |
| 15:00 | Onix / PQR-5S67 / Roberto Alves | **Voltou em garantia** — freio chiando | R$ 0,00 | — |
| 16:10 | Gol da Maria | Aprovou o orçamento → virou OS | | |
| 17:30 | Gol da Maria | Pronto e entregue | R$ 900,00 | Pago no crédito |
| 17:45 | Ka do Carlos | Finalizado, cliente não buscou | | Continua em aberto |
| 18:00 | Corolla da Ana | Passou e pagou mais R$ 500 | | Total pago: R$ 1.300 |

**Fechamento do caixa conferido na tela:**

- Faturamento do dia: **R$ 4.095,00**
- Lucro: **R$ 2.321,50**
- Comissões: **R$ 351,50** (Patrik R$ 254,00 · Junior R$ 97,50)
- A receber: **R$ 1.570,00** (Ka do Carlos R$ 570 + Corolla da Ana R$ 1.000)
- Já entrou no caixa: **R$ 2.945,00**
- Taxa de retorno: **20%** — 1 retorno em 5 OS

---

## O que deu errado (e já está corrigido)

### 1. A tela de Fechamento não abria. Nenhuma OS podia ser fechada.

**Gravidade: travava o sistema inteiro.**

Faltava um `</div>` no HTML. Por causa disso a etapa 4 (pagamento, status e
total) ficou *dentro* da etapa 3 (peças). Quando o sistema escondia a etapa de
peças para mostrar a de fechamento, escondia a de fechamento junto — ela nunca
aparecia. Na prática: dava para lançar o carro, o serviço e a peça, e aí o
sistema parava. Sem marcar pago, sem marcar entregue, sem gravar.

Foi o primeiro erro da simulação, no primeiro carro, às 07:30.

Pior: os 26 testes que eu já tinha escrito para essa tela **passavam**. Eles
olhavam só o estilo do elemento, que estava certo; não olhavam se o elemento
estava dentro de algo escondido. Corrigi os testes também — agora eles reprovam
o HTML quebrado.

### 2. Preço com vírgula saía cem vezes mais caro.

**Gravidade: cobraria errado do cliente.**

Digitando `89,90` no valor de um serviço, o sistema entendia **8990**. Um
alinhamento de R$ 89,90 viraria R$ 8.990,00. E `1.250,00` também não funcionava.

Agora os campos de dinheiro aceitam do jeito que a gente escreve:

| Você digita | O sistema entende |
|---|---|
| `89,90` | R$ 89,90 |
| `1.250,00` | R$ 1.250,00 |
| `1.250` | R$ 1.250,00 |
| `1250.50` | R$ 1.250,50 |
| `300` | R$ 300,00 |

Vale para valor de serviço, custo e venda de peça, e valor pago. No celular
continua abrindo o teclado numérico.

### 3. "Pagos" escondia o dinheiro de quem pagou uma parte.

**Gravidade: fechava o caixa errado.**

Na tela de Cobranças, o filtro "Pagos" só contava as OS quitadas. Os R$ 1.300
que a Ana pagou não entravam em lugar nenhum — o sistema dizia que tinham
entrado R$ 1.645 quando na verdade entraram R$ 2.945.

E o filtro "Todos", que dizia "Total concluído", mostrava o mesmo número de "A
receber", com outro nome.

Agora cada filtro responde uma pergunta diferente:

| Botão | Responde | No dia simulado |
|---|---|---|
| A receber | Quanto ainda tenho para cobrar | R$ 1.570,00 |
| Falta acertar | Quem pagou só uma parte | R$ 1.000,00 |
| **Já recebido** | Quanto dinheiro entrou | R$ 2.945,00 |
| Todos | Quanto foi produzido | R$ 4.515,00 |

### 4. O mecânico via a comissão somada desde sempre.

**Gravidade: daria discussão no dia do acerto.**

O painel do Patrik abria mostrando R$ 290,00. O correto no mês era R$ 254,00 —
os R$ 36 a mais eram de um serviço do mês passado. O painel não tinha período
nenhum: somava tudo desde a primeira OS.

Agora abre no mês corrente, igual ao seu painel, e diz qual mês está mostrando.
O filtro de data continua funcionando para ver outro período.

### 5. O cartão dizia "Comissão Recebida" para dinheiro que não entrou.

**Gravidade: o mecânico cobraria um acerto que a oficina ainda não recebeu.**

Dos R$ 254,00 do Patrik, R$ 230,00 estão em OS que o cliente **ainda não
pagou** (a revisão do Ka e a embreagem do Corolla). O painel chamava tudo de
"recebida".

Agora o cartão diz "Minha comissão em setembro" e, logo abaixo, avisa:
*"R$ 230,00 em OS que o cliente ainda não pagou"*. Na lista de serviços, cada
linha de OS não paga aparece marcada.

---

## Atrito que sobrou (não é erro, mas atrapalha)

### No tablet, trocar de tela custa 2 toques

Em 1024px de largura — o tamanho do tablet da oficina deitado — o menu vira
gaveta: é preciso abrir o menu e só então escolher a tela. Em pé na oficina,
com a mão suja, isso incomoda. Do jeito que está, dá para viver; se você sentir
que atrapalha no dia a dia, dá para trazer os atalhos mais usados (Nova OS,
Cobranças) para fora da gaveta.

---

## Pendente, esperando você

### ~~Os dados da oficina no papel da OS~~ — feito

CNPJ 55.460.553/0001-19, Avenida Senador Jonas Pinheiro, 1491 — Jardim das
Oliveiras, Sinop-MT, (66) 99636-9065.

### ~~Comissão em retorno de garantia~~ — decidido: não paga

Palavra do Vinicius: *"garantia não tem comissão, pois se é garantia nós
cobrimos os custos."* Marcar a caixa de retorno zera a comissão de todos os
serviços da OS, e o formulário avisa disso na hora em que a caixa é marcada —
não no dia do acerto.

A mão de obra continua registrada: o serviço foi feito, só não é pago. Assim o
relatório de produção do mecânico não perde o trabalho, e a taxa de retorno
continua contando o retrabalho.

### A senha `Podre123.`

Ela ficou legível por qualquer um que tivesse o endereço do sistema, antes da
correção de segurança. Precisa ser trocada.

### Segurança, etapa 2

As tabelas de OS, mecânicos e catálogo ainda podem ser lidas por quem tiver o
endereço do sistema. A correção é usar o login do próprio Supabase com
permissão por usuário. Está documentado no README como pendente.

---

## O que o teste cobre agora

129 casos automáticos, todos passando, em 11 baterias: busca, mais usados,
colisão de número de OS, pagamentos, cobranças, login, veículos, garantia,
etapas do formulário, PDF e **valores em reais** (bateria nova, criada por
causa dos erros 2, 4 e 5 deste relatório).
