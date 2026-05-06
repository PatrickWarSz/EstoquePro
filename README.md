# Estoque Pro

Sistema de controle de estoque de matéria-prima e gerenciamento de pedidos
de fornecedores. Parte do ecossistema **VEXO**.

## Stack
- React 18 + Vite + TypeScript
- Tailwind CSS + shadcn/ui
- Zustand (estado local) + Supabase (backend)
- html5-qrcode (scanner QR)

## Scripts
```bash
bun install          # instalar dependências
bun run dev          # ambiente de desenvolvimento
bun run build        # build de produção
bun run lint         # análise estática
bun run test         # testes (vitest)
```

## Estrutura
- `src/pages/`              — páginas roteadas
- `src/components/layout/`  — sidebar, topbar, painéis
- `src/components/stock/`   — UI específica de estoque
- `src/components/ui/`      — primitivos shadcn/ui
- `src/lib/`                — stores, tipos, util, cliente Supabase
