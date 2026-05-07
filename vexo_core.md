# VEXO Ecosystem - Core Architecture Rules

## 1. Business Context
- **Company:** `> V E X O < | software & solutions` (SaaS B2B).
- **Current Product:** Stock Management App (Frontend on React/Vite, Backend on Supabase).
- **Vision:** A unified workspace where clients log in once and access the modules they paid for.

## 2. Multi-Tenant Architecture & Auth
- **Database:** A single Supabase project ("VEXO Core") with 10 tables: `workspaces`, `usuarios`, `categorias`, `produtos`, `movimentacoes`, `fornecedores`, `locais_estoque`, `pedidos`, `entregas_pedido`, `aliases_qr`.
- **Primary Key:** `workspace_id` (Linked to the company's CNPJ/CPF).
- **Auth Strategy:** We use `src/lib/auth-store.ts` connecting to Supabase tables. `setupAdmin` creates the `workspace` and the owner in `usuarios`. `login` validates the password hash from the `usuarios` table and fetches the `workspace_id`.
- **Security:** RLS is active on ALL tables.

## 3. Tech Stack & State
- React, TypeScript, Zustand, Tailwind, Shadcn UI.
- **Data Flow:** The app reads/writes directly to Supabase. Zustand is only used for local reactive UI state. The `initialize()` function in `stock-store.ts` fetches all 8 tables simultaneously on load.