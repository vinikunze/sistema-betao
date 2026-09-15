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

### Senhas e acesso

As senhas ficam com **hash bcrypt** na tabela `credenciais`, que não tem nenhuma policy de RLS e portanto é inalcançável pela chave pública. O login acontece dentro do banco, por funções `SECURITY DEFINER` (`login_socio`, `login_mecanico`): o app manda usuário e senha e recebe de volta só o id e o nome.

Antes, as senhas eram texto puro e a tela de login baixava a tabela de sócios inteira para comparar no navegador — qualquer pessoa com o endereço do site lia a senha do dono antes de digitar qualquer coisa. A tabela `socios` deixou de ser legível pela chave pública, e o código da empresa saiu do `script.js` para a tabela `config_app`.

Cadastro de sócio e de mecânico também passam por funções (`registrar_socio`, `salvar_mecanico`, `deletar_mecanico`), que validam o código da empresa e geram o hash no servidor.

**O que ainda falta.** As tabelas `os`, `mecanicos` e os catálogos continuam liberados para leitura e escrita por quem tiver a URL do site, porque o app ainda usa a chave pública sem Supabase Auth. Ou seja: as senhas estão protegidas, mas os dados não. Fechar isso exige migrar para Supabase Auth e escrever políticas de RLS baseadas em `auth.uid()`, de forma que o mecânico enxergue apenas as OS dele.

## Diagnóstico

A tela de login tem um botão **"Não está entrando? Testar conexão"** (`diagnostico.js`). Ele faz duas chamadas ao Supabase — uma normal e uma `no-cors` — e cruza os resultados para distinguir falha de rede, chave recusada e filtro de rede, que de outra forma produzem a mesma mensagem genérica no navegador.

O painel também mostra `APP_VERSION`, útil para saber na hora se o aparelho está com o código atual ou com uma cópia velha em cache.

## Desenvolvimento

Abra `index.html` por meio de um servidor HTTP local para testar o sistema:

```
npx http-server -p 8099 .
```
