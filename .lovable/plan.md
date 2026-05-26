# Rebrand visual: VEXO Enterprise Clean

Aplicar a identidade do manual VEXO sobre o app atual, **sem tocar em nenhuma lógica de negócio, fluxo Supabase, scanner ou rotas**. Mudança 100% visual (tokens de cor, tipografia, sidebar header/footer).

## 1. Paleta cromática (index.css)

Substituir o tema âmbar/laranja pelos tokens VEXO em HSL:

| Token | Cor VEXO | HEX | HSL |
|---|---|---|---|
| `--primary` | Azul Confiança | #2563EB | `221 83% 53%` |
| `--primary-foreground` | branco | #FFFFFF | `0 0% 100%` |
| `--foreground` | Slate Escuro | #0F172A | `222 47% 11%` |
| `--muted-foreground` | Slate Médio | #64748B | `215 16% 47%` |
| `--background` | branco puro | #FFFFFF | `0 0% 100%` |
| `--card` / popover | branco | #FFFFFF | `0 0% 100%` |
| `--muted` / sidebar-bg / secondary | Cinza Superfície | #F8FAFC | `210 40% 98%` |
| `--border` / `--input` | Borda Suave | #E2E8F0 | `214 32% 91%` |
| `--accent` | azul suave | — | `214 95% 96%` |
| `--accent-foreground` | primary | #2563EB | `221 83% 53%` |
| `--ring` | primary | — | `221 83% 53%` |
| `--sidebar-primary` / accent-foreground | primary | — | `221 83% 53%` |
| `--destructive` | manter vermelho | — | `0 75% 50%` |
| `--success` | manter verde | — | `145 55% 38%` |
| `--warning` | manter âmbar | — | `38 92% 50%` |

Dark mode: manter a variante mas recalibrar com slate (`--background: 222 47% 11%`, surfaces `217 33% 17%`, primary mais claro `217 91% 60%`) — preservando o caráter Enterprise Clean.

Removo `--primary-soft` antigo (laranja) e substituo por azul `214 95% 92%`.

## 2. Tipografia (index.css)

Trocar o `@import` Google Fonts por:
```
Space Grotesk (600,700) — display
Inter (400,500,600,700) — UI/texto (já existe)
JetBrains Mono (400) — operadores > <, SKUs, tagline
```
- `body` continua em Inter.
- Adicionar utilitários: `.font-display { font-family: 'Space Grotesk', sans-serif }` e `.font-mono-vexo { font-family: 'JetBrains Mono', monospace }`.
- Registrar `fontFamily` no `tailwind.config.ts` (`display`, `mono`).

## 3. AppSidebar — selo de marca VEXO

`src/components/layout/AppSidebar.tsx` (apenas o header + adicionar footer, **sem mexer na navegação/permissões**):

- **Header**: substituir o quadrado laranja com `Boxes` por:
  - Linha 1: `> V E X O <` em JetBrains Mono, peso 500, tracking expandido, cor `--foreground`; `>` e `<` em `--primary`.
  - Linha 2 (oculto quando collapsed): "StockKeeper Pro" em Space Grotesk 600.
  - Linha 3: tagline `software & solutions` em JetBrains Mono 10px, minúsculas, `--muted-foreground`.
- **Footer** (novo, dentro de `Sidebar`, `SidebarFooter`): `powered by > V E X O <` (mono, 10px, muted), só quando expandido.
- Ícone (versão collapsed): bloco quadrado `bg-primary` com `> <` em mono branco — substitui o ícone `Boxes`.

## 4. TopBar e meta

- Em `TopBar.tsx`, o título mobile "Estoque Pro" vira "StockKeeper Pro" em Space Grotesk.
- `index.html`: atualizar `<title>`, meta description, e `theme-color` para `#2563EB`.
- `vite.config.ts` (manifest PWA já existente): `theme_color: '#2563EB'`, `background_color: '#FFFFFF'`, `name: 'VEXO StockKeeper Pro'`, `short_name: 'StockKeeper'`.
- Regenerar `public/pwa-192.png` e `public/pwa-512.png`: fundo `#0F172A` (Slate Escuro) com `> V E X O <` branco centralizado (conforme avatar oficial do manual).

## 5. O que NÃO muda

- Nenhum arquivo em `src/lib/` (stock-store, auth-store, supabase, qr, idb-queue).
- Nenhuma página (`EstoquePage`, `ScannerPage`, `PedidosPage`, etc.).
- Nenhuma rota, permissão, ou componente de scanner.
- Dialogs/tabelas/cards continuam funcionando — só herdam a nova paleta via tokens.
- Botão "Instalar PWA" e service worker permanecem como configurados.

## Arquivos tocados

1. `src/index.css` — tokens HSL + fonts
2. `tailwind.config.ts` — fontFamily display/mono
3. `src/components/layout/AppSidebar.tsx` — header + footer com selo VEXO
4. `src/components/layout/TopBar.tsx` — label mobile
5. `index.html` — title, theme-color, meta
6. `vite.config.ts` — manifest PWA (cor/nome)
7. `public/pwa-192.png` + `public/pwa-512.png` — regenerar

Total: 7 arquivos, zero mudança de lógica.
