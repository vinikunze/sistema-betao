# Sistema Betão

Sistema web do Betão Auto Center.

## Hospedagem

O frontend é estático e está publicado na **Vercel**, no endereço **https://sistemabetao.vercel.app**.

O repositório está ligado ao projeto na Vercel: **todo merge na `main` publica sozinho, em produção**. Não há passo manual.

Os cabeçalhos HTTP ficam em `vercel.json`. O `Cache-Control` com `must-revalidate` vale para todos os arquivos porque os nomes são fixos, sem hash — cada publicação precisa aparecer na hora.

O `netlify.toml` continua no repositório para o caso de o Netlify ser religado algum dia, mas **o site do Netlify não está ligado a este repositório** e serve uma versão antiga e quebrada. Foi o que causou horas de depuração: correções eram mescladas e nunca chegavam ao navegador.

## Banco de dados

O frontend usa Supabase. O projeto é o **"lua de mel"** (`ccvlaywiyvrixduvbccj`, região `sa-east-1`), compartilhado com os outros sistemas pessoais — as tabelas do Betão têm nomes próprios e não colidem com as demais.

Tabelas usadas: `socios`, `mecanicos`, `os`, `catalogo_pecas` e `catalogo_servicos`. Orçamentos e ordens de serviço ficam juntos em `os`, separados pela coluna `status`.

O schema está versionado em `supabase/migrations/`. Para recriar tudo do zero em outro projeto, basta aplicar os arquivos em ordem.

A chave usada no frontend é a **chave anon clássica (JWT)**, não a `sb_publishable_...`. Com a chave publicável o app falhava no celular e no tablet com erro genérico de rede. Credenciais administrativas nunca devem entrar no repositório nem ser enviadas ao navegador.

### Acesso aos dados

Como o app não usa Supabase Auth, as cinco tabelas acima ficam liberadas para leitura e escrita por qualquer pessoa que tenha a URL do site, e as senhas de sócios e mecânicos são guardadas em texto puro. Isso é aceitável para uso interno, mas se os mecânicos passarem a acessar de fora, vale migrar o login para o Supabase Auth e restringir as políticas de RLS.

## Diagnóstico

A tela de login tem um botão **"Não está entrando? Testar conexão"** (`diagnostico.js`). Ele faz duas chamadas ao Supabase — uma normal e uma `no-cors` — e cruza os resultados para distinguir falha de rede, chave recusada e filtro de rede, que de outra forma produzem a mesma mensagem genérica no navegador.

O painel também mostra `APP_VERSION`, útil para saber na hora se o aparelho está com o código atual ou com uma cópia velha em cache.

## Desenvolvimento

Abra `index.html` por meio de um servidor HTTP local para testar o sistema:

```
npx http-server -p 8099 .
```
