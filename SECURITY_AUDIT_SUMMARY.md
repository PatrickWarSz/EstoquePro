# Security Audit Summary - Stock Keeper Pro
## Executive Summary Table

| # | Vulnerabilidade | Severidade | Localização | Status |
|---|-----------------|-----------|-------------|--------|
| 1 | CORS aberto a todas as origens | 🔴 CRÍTICO | asaas-*.ts | ⚠️ |
| 2 | Falta de autorização - asaas-customer | 🔴 CRÍTICO | asaas-customer/index.ts | ⚠️ |
| 3 | Falta de autorização - asaas-checkout | 🔴 CRÍTICO | asaas-checkout/index.ts | ⚠️ |
| 4 | Falta de autorização - asaas-upgrade-sub | 🔴 CRÍTICO | asaas-upgrade-sub/index.ts | ⚠️ |
| 5 | Falta de autorização - asaas-cancel-sub | 🔴 CRÍTICO | asaas-cancel-sub/index.ts | ⚠️ |
| 6 | Dados sensíveis em console.log | 🔴 CRÍTICO | asaas-checkout.ts, asaas-customer.ts, auth-store.ts | ⚠️ |
| 7 | Falta de validação de workspace | 🟠 ALTO | auth-store.ts:207-236 | ⚠️ |
| 8 | updateEmployee sem autorização | 🟠 ALTO | auth-store.ts:225-230 | ⚠️ |
| 9 | removeEmployee sem autorização | 🟠 ALTO | auth-store.ts:233-236 | ⚠️ |
| 10 | Email construído inseguro | 🟠 ALTO | auth-store.ts:205-208 | ⚠️ |
| 11 | Falta de sanitização do phone | 🟠 ALTO | asaas-customer.ts:45 | ⚠️ |
| 12 | Falta de validação de input | 🟠 ALTO | auth-store.ts:59-80 | ⚠️ |
| 13 | Webhook sem rate limiting | 🟠 ALTO | asaas-webhook/index.ts | ⚠️ |
| 14 | Console.error expõe stack trace | 🟠 ALTO | múltiplos arquivos | ⚠️ |
| 15 | Senha muito fraca (4 caracteres) | 🟡 MÉDIO | LoginPage.tsx:121 | ⚠️ |
| 16 | Falta de timeout nas requisições | 🟡 MÉDIO | asaas-*.ts | ⚠️ |
| 17 | Validação inadequada de resposta API | 🟡 MÉDIO | asaas-customer.ts:47-52 | ⚠️ |
| 18 | Race condition no login | 🟡 MÉDIO | auth-store.ts:134-170 | ⚠️ |
| 19 | Falta de validação de body vazio | 🟡 MÉDIO | asaas-upgrade-sub.ts:15 | ⚠️ |
| 20 | Error logging não estruturado | 🟢 BAIXO | asaas-*.ts | ℹ️ |
| 21 | Sem CSRF protection | 🟢 BAIXO | LoginPage.tsx, SubscriptionPanel.tsx | ℹ️ |
| 22 | Anon key exposta (esperado) | 🟢 BAIXO | supabase.ts | ℹ️ |
| 23 | Sem CSP headers | 🟢 BAIXO | vite.config.ts | ℹ️ |

## Quick Fix Priority

### 🔴 CRÍTICO - Corrigir Imediatamente (24h)

```
1. CORS: Restringir Access-Control-Allow-Origin
2. Billing Functions: Adicionar autenticação e validação de workspace
3. Logs: Remover console.log e dados sensíveis
```

### 🟠 ALTO - Corrigir em 1 semana

```
1. Autorização em updateEmployee/removeEmployee
2. Validação de workspace em todas as operações
3. Sanitização de inputs (phone, name, etc)
4. Rate limiting no webhook
```

### 🟡 MÉDIO - Corrigir em 2 semanas

```
1. Senha mínima: 4 → 12 caracteres
2. Timeout nas requisições HTTP
3. Refactoring de race condition
4. Validação robusta de resposta API
```

### 🟢 BAIXO - Backlog

```
1. Structured logging
2. CSP headers
3. CSRF tokens
4. Error handling melhorado
```

## Files Requiring Changes

| File | Issues | Priority |
|------|--------|----------|
| supabase/functions/asaas-customer/index.ts | 1,2,5,6,11,12,17,20 | 🔴🔴🔴 |
| supabase/functions/asaas-checkout/index.ts | 1,2,6,14,20 | 🔴🔴🔴 |
| supabase/functions/asaas-upgrade-sub/index.ts | 1,3,14,19,20 | 🔴🔴🔴 |
| supabase/functions/asaas-cancel-sub/index.ts | 1,4,14,20 | 🔴🔴🔴 |
| supabase/functions/asaas-webhook/index.ts | 13,14,20 | 🟠🟠 |
| src/lib/auth-store.ts | 6,7,8,9,10,12,18 | 🔴🟠 |
| src/pages/LoginPage.tsx | 15 | 🟡 |
| src/lib/supabase.ts | 22 | 🟢 |
| vite.config.ts | 23 | 🟢 |

## Recommended Tools for Remediation

1. **ZOD** - Já instalado, usar para validação de inputs
2. **jose** - Para JWT handling seguro
3. **helmet** - Para headers de segurança
4. **rate-limiter-flexible** - Para rate limiting
5. **winston** - Para structured logging

## Testing Recommendations

```bash
# 1. Testar CORS com curl
curl -H "Origin: http://malicious.com" \
  -H "Access-Control-Request-Method: POST" \
  https://supabase.../asaas-customer

# 2. Testar autorização - usar outro workspaceId
curl -X POST \
  -H "Authorization: Bearer TOKEN" \
  -d '{"workspaceId": "OTHER_ID"}' \
  https://supabase.../asaas-customer

# 3. Testar força de senha
# Tentar login com senha de 4 caracteres
```

