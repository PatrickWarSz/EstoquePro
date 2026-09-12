# Somatórios em branco no celular — diagnosticar e corrigir

## Situação
No notebook o somatório aparece; no celular a tela mostra "Nenhum somatório criado". A causa ainda não está confirmada: hoje, quando a leitura falha (permissão, sessão antiga, erro de rede), o app simplesmente mostra a lista vazia, sem nenhum aviso. Por isso não dá para saber, olhando a tela, se realmente não existe nada ou se a busca falhou.

Também existe a possibilidade de o celular estar com uma sessão/empresa antiga guardada, buscando os somatórios da conta errada.

## Passo 1 — Tornar a falha visível (feito primeiro)
- Na aba Somatórios, separar três estados: carregando, erro na busca, e realmente vazio.
- Quando a busca falhar, mostrar um aviso com o motivo e um botão "Tentar novamente" em vez da tela de "Nenhum somatório criado".
- Mostrar discretamente, só quando houver erro, a identificação da empresa que o aparelho está usando — assim conseguimos comparar celular x notebook.

## Passo 2 — Corrigir o que o Passo 1 revelar
Com o aviso na tela, o celular vai dizer qual é o problema. As correções previstas conforme o caso:
- **Empresa diferente no celular**: forçar a atualização dos dados da conta ao abrir o app e limpar a informação antiga guardada no aparelho.
- **Permissão negada na tabela**: ajustar a regra de acesso para que qualquer usuário da mesma empresa possa ler os somatórios (hoje pode estar restrita).
- **Falha de rede/caminho alternativo**: o app já tem um caminho reserva pelo servidor; garantir que ele seja usado e que o erro dele também apareça na tela.

## Passo 3 — Guardar para uso offline
Guardar os somatórios no próprio aparelho depois da primeira leitura bem-sucedida, como já é feito com o estoque, para que a tela nunca fique vazia por causa de uma falha momentânea de rede.

## Detalhes técnicos
- `src/lib/somatorios-store.ts`: adicionar campo `error` ao estado; hoje `load()` engole o erro após o fallback e deixa a lista vazia. Persistir o último resultado bem-sucedido (localStorage, por workspace).
- `src/pages/SomatoriosPage.tsx`: renderizar estados `loading` / `error` / `empty` distintos, com retry.
- `supabase/functions/workspace-data/index.ts`: já cobre `somatorios_list` com service_role; validar que está deployada e que o CORS aceita a origem usada no celular (PWA envia origin `https://estoque.vexodev.com.br`).
- Conferir no Supabase a policy de SELECT em `public.somatorios` e o `GRANT SELECT ... TO authenticated`.

## Verificação
- Abrir Somatórios no celular e confirmar: ou a lista aparece, ou surge uma mensagem clara de erro (nunca mais a tela vazia enganosa).
- Criar um somatório no notebook e conferir que aparece no celular após reabrir o app.
