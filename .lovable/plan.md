# Ativar Realtime das tabelas do estoque

## Contexto
O app já escuta eventos de realtime (canal no AppLayout), mas as tabelas ainda não estão publicadas no Supabase. Sem isso, as telas só atualizam ao recarregar/voltar ao app — foi por isso que o produto novo não apareceu no celular.

## Opção 1 — Painel (manual)
1. Supabase Dashboard → barra lateral → **Database → Publications**
2. Abrir **supabase_realtime**
3. Em "Tables", adicionar:
   - produtos
   - categorias
   - pedidos
   - entregas_pedido
   - movimentacoes
   - aliases_qr
   - locais_estoque

## Opção 2 — SQL Editor (copiar e rodar)
```sql
alter publication supabase_realtime add table public.produtos;
alter publication supabase_realtime add table public.categorias;
alter publication supabase_realtime add table public.pedidos;
alter publication supabase_realtime add table public.entregas_pedido;
alter publication supabase_realtime add table public.movimentacoes;
alter publication supabase_realtime add table public.aliases_qr;
alter publication supabase_realtime add table public.locais_estoque;
```

## Verificação
- Após rodar, confirmar em Database → Publications → supabase_realtime que as 7 tabelas aparecem na lista.
- Teste: criar um produto no notebook e confirmar que aparece no celular sem dar F5.

## Observação
Nenhuma mudança de código é necessária no app — apenas configuração no Supabase. Este plano é só para registrar a orientação; a execução é manual por você.
