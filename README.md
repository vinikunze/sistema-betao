# Sistema Betão

Sistema web do Betão Auto Center.

## Hospedagem

O frontend é estático e está preparado para publicação no Netlify. A configuração de deploy e de cabeçalhos HTTP fica em `netlify.toml`.

## Banco de dados

O frontend usa Supabase. O projeto é o **"lua de mel"** (`ccvlaywiyvrixduvbccj`, região `sa-east-1`), compartilhado com os outros sistemas pessoais — as tabelas do Betão têm nomes próprios e não colidem com as demais.

Tabelas usadas: `socios`, `mecanicos`, `os`, `catalogo_pecas` e `catalogo_servicos`. Orçamentos e ordens de serviço ficam juntos em `os`, separados pela coluna `status`.

O schema está versionado em `supabase/migrations/`. Para recriar tudo do zero em outro projeto, basta aplicar os arquivos em ordem.

Credenciais administrativas nunca devem ser incluídas no repositório ou enviadas ao navegador; somente a chave pública (`sb_publishable_...`) pode ser usada no frontend — ela fica em `script.js`.

### Acesso aos dados

Como o app não usa Supabase Auth, as cinco tabelas acima ficam liberadas para leitura e escrita por qualquer pessoa que tenha a URL do site, e as senhas de sócios e mecânicos são guardadas em texto puro. Isso é aceitável para uso interno, mas se o sistema passar a ser usado por terceiros, vale migrar o login para o Supabase Auth e restringir as políticas de RLS.

## Desenvolvimento

Abra `index.html` por meio de um servidor HTTP local para testar o sistema:

```
npx http-server -p 8099 .
```

Alterações enviadas para a branch principal serão publicadas automaticamente depois que o repositório estiver vinculado ao projeto Netlify.
