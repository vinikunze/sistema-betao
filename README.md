# Sistema Betão

Sistema web do Betão Auto Center.

## Hospedagem

O frontend é estático e está preparado para publicação no Netlify. A configuração de deploy e de cabeçalhos HTTP fica em `netlify.toml`.

## Banco de dados

O frontend usa Supabase. Credenciais administrativas nunca devem ser incluídas no repositório ou enviadas ao navegador; somente a chave pública do cliente pode ser usada no frontend.

## Desenvolvimento

Abra `index.html` por meio de um servidor HTTP local para testar o sistema. Alterações enviadas para a branch principal serão publicadas automaticamente depois que o repositório estiver vinculado ao projeto Netlify.
