## Objetivo
Notificações push (celular/PWA) para todos os usuários ativos de cada workspace quando um item **cruza o mínimo** ou **zera**. Cada usuário só recebe eventos do próprio workspace.

## Como vai funcionar (visão do usuário)

1. Na primeira vez que abrir o app após a atualização, aparece um aviso pedindo permissão de notificação. Pode aceitar ou dispensar (fica um botão em Configurações para ativar depois).
2. Pode registrar vários aparelhos (celular + PC). Cada aparelho vira uma "inscrição" ligada ao usuário/workspace.
3. Quando qualquer movimentação faz um item **cair para ≤ mínimo** vindo de acima, dispara: *"⚠️ Estoque baixo — Elástico Preto 40mm (8 rolos, mínimo 10)"*.
4. Quando um item **zera**, dispara: *"🔴 Estoque zerado — Elástico Preto 40mm"*.
5. Só dispara **uma vez por evento** (não repete enquanto o item ficar abaixo). Se voltar a subir acima do mínimo e cair de novo, notifica novamente.
6. Tocar na notificação abre o app direto na aba Estoque, filtrado no item.

## Arquitetura técnica

**Padrão:** Web Push nativo com VAPID (sem OneSignal / Firebase / serviço pago). Funciona em Android/Chrome/Edge/Firefox e no iOS a partir do 16.4 quando o PWA está instalado na tela de início — que é exatamente o cenário atual do app.

**Componentes novos:**

1. `public/push-sw.js` — service worker dedicado só para push. Fica fora do SW de app-shell existente para não conflitar com o fluxo offline.
2. Chaves VAPID: geradas uma vez, `VAPID_PUBLIC_KEY` vai como env pública, `VAPID_PRIVATE_KEY` e `VAPID_SUBJECT` viram secrets no Supabase.
3. Tabela `push_subscriptions` no Supabase (você roda o SQL manualmente, como fez com `somatorios`):
   ```
   id uuid pk, workspace_id uuid, user_id uuid,
   endpoint text unique, p256dh text, auth text,
   user_agent text, created_at, last_seen_at
   ```
   RLS: usuário só vê/apaga as próprias; edge function usa service_role para ler as do workspace.
4. Tabela `stock_alert_state` — guarda para cada item o último estado notificado (`ok` / `baixo` / `zerado`), para garantir "uma vez por evento":
   ```
   workspace_id uuid, item_id uuid, last_state text, last_notified_at timestamptz,
   pk (workspace_id, item_id)
   ```
5. Edge function `push-subscribe` — recebe a subscription do navegador, valida sessão, upsert na tabela.
6. Edge function `push-notify` — recebe `{ workspaceId, itemId, event, payload }`, busca subscriptions do workspace, envia via `web-push` (biblioteca Deno). Remove endpoints que retornarem 404/410.
7. Hook de disparo no cliente: em `stock-store.ts`, depois de cada movimentação/entrega bem-sucedida, comparar `quantidade_antes` × `quantidade_depois` × `min_quantity` do item. Se cruzou o limiar, chamar `push-notify`. Fazer o disparo pelo cliente (não por trigger de banco) evita mexer no Postgres agora e reaproveita a lógica já centralizada no store — o edge function ainda revalida o estado no banco para não notificar duas vezes se dois aparelhos dispararem junto.

**UI nova:**

- Componente `NotificationsPrompt` — banner discreto no topo quando `Notification.permission === 'default'`.
- Seção "Notificações" em `ConfiguracoesPage` com: status atual (ativa neste aparelho / desativada), botão "Ativar neste aparelho", botão "Desativar", lista de aparelhos registrados com data.

## Escopo por workspace (o ponto crítico do seu pedido)

- A subscription é gravada com `workspace_id` do usuário no momento da inscrição.
- Ao fazer logout ou trocar de conta, o app **apaga a subscription local** e chama `push-unsubscribe` antes de sair — impede o problema que aconteceu com a fila de sync.
- O `push-notify` filtra `WHERE workspace_id = $1` no envio. Nenhum device recebe eventos de outro workspace.
- Se o usuário for desativado (`ativo=false`), o edge function ignora a subscription dele.

## Passos de implementação (na ordem)

1. Criar as duas tabelas + RLS + grants (te entrego o SQL para rodar).
2. Gerar VAPID e cadastrar 3 secrets no Supabase.
3. Criar `push-sw.js` e helpers em `src/lib/push.ts` (subscribe/unsubscribe/permission).
4. Criar edge functions `push-subscribe` e `push-notify`.
5. Ligar o disparo em `stock-store.ts` nas funções que alteram quantidade (`registerMovement`, `registerDelivery`, edição manual).
6. Ligar limpeza no `logout` e no `switch workspace`.
7. Adicionar prompt na primeira visita + painel em Configurações.

## O que não entra agora (posso fazer depois se pedir)

- E-mail, WhatsApp, resumo diário, notificação por somatório (a lógica ficará pronta para estender depois).
- Silenciar por item ou por horário.
- Histórico de notificações dentro do sino do app.

Confirma que posso seguir? Se sim, começo pela infra (SQL + VAPID + service worker) e te aviso onde precisa da sua ação manual no Supabase.