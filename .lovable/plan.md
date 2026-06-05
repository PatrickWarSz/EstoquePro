# Operação Offline Completa

## Objetivo

Garantir que o operador consiga: bipar itens, dar entrada/saída, criar pedidos, registrar entregas, editar itens e consultar histórico **sem internet**. Quando a conexão voltar, tudo sincroniza automaticamente.

Cadastros administrativos (funcionário, fornecedor, categoria nova) continuam exigindo internet — são raros e tendem a ser feitos no escritório.

## Princípios

1. **Local-first**: a UI lê SEMPRE do IndexedDB. A internet só serve para sincronizar.
2. **Fila confiável**: toda escrita vira um "comando" enfileirado com ID temporário. Reconcilia com o ID real quando subir.
3. **Sessão longa**: Supabase já guarda refresh token. Vou estender o tempo e tratar o caso "token expirado offline" mantendo o cache visível.
4. **Feedback claro**: badge no topo mostra "Offline — N pendentes". Cada item/pedido criado offline mostra ícone de "aguardando sync".

## Etapas

### Etapa 1 — Cache local completo (leitura offline)
- Estender `stock-store.ts` para persistir em IndexedDB (já tem snapshot parcial em localStorage; migrar para IDB com schema versionado).
- Tabelas a cachear: `categorias`, `itens`, `pedidos`, `entregas_pedido`, `movimentacoes` (últimos 90 dias), `fornecedores`, `funcionarios`.
- Hidratar a store a partir do IDB no boot **antes** de tentar buscar do Supabase. Tela nunca mais fica em branco.
- Refresh em background quando online.

### Etapa 2 — Generalizar a fila de escrita
- Renomear `idb-queue` para `op-queue` com tipos: `movement`, `item.create`, `item.update`, `order.create`, `delivery.register`, `delivery.update`, `order.complete`, etc.
- Cada operação grava primeiro no cache local (resposta otimista) e enfileira o comando.
- Worker de sincronização processa em ordem, com retry exponencial. Falha permanente vai pra "caixa de erros" visível pro usuário.

### Etapa 3 — Reconciliação de IDs
- Operações offline geram `tempId` (`tmp_<uuid>`). Ao subir, o servidor devolve o ID real e a store reescreve referências (ex: entregas que apontam pro pedido criado offline).

### Etapa 4 — UX de status
- Badge no `TopBar`: "● Online" / "● Offline — 3 pendentes" / "⚠ 1 erro de sync".
- Painel acessível listando pendentes e erros, com botão "tentar novamente" e "descartar".
- Em cada card de item/pedido criado offline, pequeno selo "aguardando sync".

### Etapa 5 — Sessão de 30 dias e boot resiliente
- Confirmar config do Supabase Auth (`autoRefreshToken: true`, `persistSession: true`) e validar tempo de refresh token no projeto Cloud.
- No boot: se `getSession()` falhar/expirar e estiver offline → renderiza app a partir do cache local em "modo somente-leitura-de-rede" (escritas continuam indo pra fila). Quando voltar internet, refresha sessão e sobe a fila.
- Bloqueio só aparece se o usuário ficar 30+ dias offline.

### Etapa 6 — Service Worker para assets
- Garantir que JS/CSS/imagens ficam em `CacheFirst` (Workbox já faz). Validar que rota navegacional sempre tem fallback pra `index.html` em cache.

### Etapa 7 — Testes manuais guiados
- Roteiro: desligar Wi-Fi → bipar item → dar saída → criar pedido → registrar entrega → ligar Wi-Fi → confirmar que tudo subiu e aparece no histórico do outro celular.

## Trade-offs que você precisa saber

- **Conflito**: se duas pessoas mexem no mesmo item offline, vence quem sincronizar por último (estratégia "last-write-wins"). Para movimentações (entrada/saída) **não há conflito** porque são deltas somados, não substituição.
- **Estoque "desatualizado" offline**: o operador vê o saldo da última sincronização. Se alguém online já deu saída, ele pode achar que tem mais do que tem. Vou mostrar a hora do último sync no canto.
- **Pedidos criados offline** não aparecem pra outros usuários até subir.
- **Primeira abertura precisa de internet** (pra baixar o cache inicial). Depois roda offline.

## Entrega faseada

Sugiro fazer em 2 PRs pra você validar entre eles:
- **Fase A** (etapas 1, 5, 6): cache local + boot resiliente + sessão longa. Já resolve o problema da "tela em branco" e leitura offline.
- **Fase B** (etapas 2, 3, 4, 7): fila generalizada de escrita + UX de pendentes + reconciliação.

## Arquivos principais que vou tocar

- `src/lib/stock-store.ts` (hidratação IDB, escritas otimistas)
- `src/lib/idb-queue.ts` → `src/lib/op-queue.ts` (generalização)
- `src/lib/idb-cache.ts` (novo — schema do cache)
- `src/lib/sync-worker.ts` (novo — processa fila)
- `src/lib/supabase.ts` (config de sessão)
- `src/components/layout/TopBar.tsx` (badge online/offline)
- `src/components/layout/SyncStatusPanel.tsx` (novo)
- `src/pages/AppLayout.tsx` (boot resiliente)
- `vite.config.ts` (ajustes finos no Workbox se preciso)

Confirma se faz sentido começar pela **Fase A**? Ou prefere que eu faça tudo de uma vez?
