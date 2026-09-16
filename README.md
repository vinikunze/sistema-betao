# Sistema Betão

Sistema web do Betão Auto Center.

## Hospedagem

O frontend é estático e está publicado na **Vercel**, no endereço **https://sistemabetao.vercel.app**.

O repositório está ligado ao projeto na Vercel: **todo merge na `main` publica sozinho, em produção**. Não há passo manual.

Os cabeçalhos HTTP ficam em `vercel.json`. O `Cache-Control` com `must-revalidate` vale para todos os arquivos porque os nomes são fixos, sem hash — cada publicação precisa aparecer na hora.

O `netlify.toml` continua no repositório para o caso de o Netlify ser religado algum dia, mas **o site do Netlify não está ligado a este repositório** e serve uma versão antiga e quebrada. Foi o que causou horas de depuração: correções eram mescladas e nunca chegavam ao navegador.

## Banco de dados

O frontend usa Supabase. O projeto é o **"lua de mel"** (`ccvlaywiyvrixduvbccj`, região `sa-east-1`), compartilhado com os outros sistemas pessoais — as tabelas do Betão têm nomes próprios e não colidem com as demais.

Tabelas usadas: `socios`, `mecanicos`, `clientes`, `veiculos`, `os`, `catalogo_pecas`, `catalogo_servicos`, mais `credenciais` e `config_app` (essas duas sem acesso pela API). Orçamentos e ordens de serviço ficam juntos em `os`, separados pela coluna `status`.

**Clientes e veículos** são cadastros de verdade, criados sozinhos quando uma OS é gravada com placa. A placa é a identidade do veículo: normalizada (só letras e números, maiúscula) por um trigger no banco e única, para o mesmo carro nunca virar dois cadastros. A OS guarda tanto o vínculo (`cliente_id`, `veiculo_id`), que cruza o histórico, quanto o texto do cliente e do veículo, que é o que foi impresso na época — se o carro for vendido, a OS antiga continua mostrando o dono de então.

O schema está versionado em `supabase/migrations/`. Para recriar tudo do zero em outro projeto, basta aplicar os arquivos em ordem.

A chave usada no frontend é a **chave anon clássica (JWT)**, não a `sb_publishable_...`. Com a chave publicável o app falhava no celular e no tablet com erro genérico de rede. Credenciais administrativas nunca devem entrar no repositório nem ser enviadas ao navegador.

### Quem entra, e o que cada um enxerga

Cada pessoa da oficina tem uma **conta no Supabase Auth**, e é o crachá dessa
sessão que o banco confere em cada consulta. A chave anon que está no código do
site, sozinha, não lê nem escreve uma linha.

O sócio entra pelo e-mail. O mecânico continua digitando **só o nome** — o
endereço que o Supabase exige (`patrik@mecanico.betaoautocenter.com.br`) é
montado a partir do nome, pelo app e pelo banco, com a mesma regra. Se as duas
pontas discordarem, ele não entra; por isso a regra vive num lugar só de cada
lado (`emailDoMecanico` no `script.js`, e o mesmo `translate/regexp_replace`
nas funções SQL).

`perfis_betao` liga a conta ao cadastro em `socios`/`mecanicos` e diz o papel.
Quem está logado no projeto mas não tem linha ali (os outros sistemas pessoais
que dividem este mesmo Supabase) não enxerga nada da oficina.

| tabela | sócio | mecânico |
|---|---|---|
| `os` | tudo | lê só as OS em que trabalhou; cria orçamento |
| `clientes`, `veiculos` | tudo | lê e cria |
| `catalogo_pecas`, `catalogo_servicos` | tudo | só lê |
| `mecanicos` | tudo | só lê — **não** muda a própria comissão |
| `os_fotos` | tudo | fotos das OS dele |
| `socios`, `credenciais`, `config_app` | nada pela API | nada |

As senhas continuam com **hash bcrypt**, agora em dois lugares que andam
juntos: `credenciais` (inalcançável pela API) e `auth.users`. Cadastrar sócio
ou mecânico passa por função `SECURITY DEFINER` que cria os dois de uma vez —
`registrar_socio`, `salvar_mecanico`, `deletar_mecanico` —, e as duas últimas
agora exigem que quem chama seja sócio. Antes não perguntavam: com a chave
pública, qualquer um criava mecânico ou mexia na comissão dos existentes.

O papel vem do banco a cada abertura, não do `localStorage`. Antes bastava
trocar `"mecanico"` por `"socio"` no navegador para ver o faturamento inteiro.

**Histórico.** Antes de tudo isso as senhas eram texto puro e a tela de login
baixava a tabela de sócios inteira para comparar no navegador. Depois vieram o
hash e as funções de login, que protegeram as senhas — mas não os dados: as
sete tabelas da oficina seguiam com uma política `ALL to anon using (true)`, e
quem tivesse o endereço do site lia e escrevia tudo sem senha nenhuma. É isso
que a etapa acima fechou.

Uma armadilha que só apareceu no teste, e que vale lembrar: aquelas políticas
antigas valiam para `{anon, authenticated}`. Como as políticas do Postgres se
somam — basta UMA liberar —, enquanto elas existiam as novas ficavam
mascaradas, e um mecânico logado ainda conseguia subir a própria comissão. A
migração da parte 2 é a que realmente fecha.

## Diagnóstico

A tela de login tem um botão **"Não está entrando? Testar conexão"** (`diagnostico.js`). Ele faz duas chamadas ao Supabase — uma normal e uma `no-cors` — e cruza os resultados para distinguir falha de rede, chave recusada e filtro de rede, que de outra forma produzem a mesma mensagem genérica no navegador.

O painel também mostra `APP_VERSION`, útil para saber na hora se o aparelho está com o código atual ou com uma cópia velha em cache.

## Desenvolvimento

Abra `index.html` por meio de um servidor HTTP local para testar o sistema:

```
npx http-server -p 8099 .
```
