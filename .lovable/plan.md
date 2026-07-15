## Objetivo

Gerar o par de chaves VAPID pra você e configurar os 3 secrets necessários pra ativar as notificações push, sem você precisar mexer em site ou terminal.

## O que vai acontecer

### 1. Gerar as chaves VAPID
Criar uma edge function temporária `generate-vapid` que usa a biblioteca `web-push` pra gerar um par novo (pública + privada). Ao rodar, ela vai me devolver as duas chaves **uma única vez**.

### 2. Configurar os 3 secrets no Supabase
Depois que a função rodar, eu vou salvar automaticamente:

- `VAPID_PUBLIC_KEY` → a chave pública gerada
- `VAPID_PRIVATE_KEY` → a chave privada gerada
- `VAPID_SUBJECT` → `mailto:contato@vexodev.com.br` (valor fixo, não precisa ser email real que você lê — é só um contato técnico exigido pelo padrão)

### 3. Atualizar o código do app
Colar a **chave pública** também no `src/lib/push.ts` (ela precisa estar nos dois lugares: no navegador do funcionário e no servidor — e ser idêntica).

### 4. Deletar a função temporária
Depois de tudo salvo, remover a `generate-vapid` pra ninguém conseguir gerar chave nova acidentalmente.

### 5. Instruções finais
Te passar exatamente 2 comandos pra você rodar (ou eu confirmo que já rodou por aqui):

```bash
supabase functions deploy push-subscribe --no-verify-jwt
supabase functions deploy push-notify --no-verify-jwt
```

E aí é testar clicando no sininho no topo do app.

## Sobre o que você colou

Só reforçando: aquele `eyJhbGci...` que você achou que era a private key **é a chave anon do Supabase** — não usa ela pra nada de VAPID, ela já está no lugar certo do sistema. E o `BDU8KtY2...` parece uma pública VAPID válida, mas como você não tem a privada correspondente, ela é inútil sozinha — vamos descartar e gerar um par novo.

## Detalhes técnicos

- A função `generate-vapid` usa `import webpush from "npm:web-push@3"` e chama `webpush.generateVAPIDKeys()`.
- Retorna `{ publicKey, privateKey }` em JSON — só invocável durante essa sessão.
- Após salvar os secrets via `secrets--set_secret`, edito `src/lib/push.ts` substituindo o valor de `VAPID_PUBLIC_KEY` pela nova pública.
- Removo `supabase/functions/generate-vapid/` no final.
