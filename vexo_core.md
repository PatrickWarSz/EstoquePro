# VEXO Ecosystem - Global Architecture Rules

## 1. The Business Context
We are building a B2B SaaS Ecosystem. Our main product is a unified Workspace ("VEXO Hub"), but we also sell individual Micro-frontends (like "Stock Management").
Currently, we are developing the "Stock Management" application.
All our applications, present and future, will share a SINGLE central database in Supabase called "VEXO Core".

## 2. Multi-Tenant Architecture (CRUCIAL)
- Every application MUST run on a Multi-tenant architecture.
- The root identifier for an account is NEVER just the user's email. It is the Company's `CNPJ` (or CPF).
- The core database table is `workspaces` (which represents the company). The `cnpj_cpf` field must be UNIQUE.
- Users (employees) belong to a `workspace_id`.
- ALL database tables (products, stock movements, etc.) must include a `workspace_id` column.
- ALL database queries must implement Row Level Security (RLS) filtering by `workspace_id`. A company cannot under any circumstance see another company's data.

## 3. Tech Stack & Current Goal
- Frontend: React, TypeScript, Vite, Tailwind CSS, Shadcn UI.
- State Management: We are migrating FROM local state (Zustand/LocalStorage) TO a real Supabase Backend.
- Backend/Auth: Supabase.
- Current Goal: Analyze the existing local data structure and create the corresponding Supabase SQL schema to make this a functional, production-ready SaaS.