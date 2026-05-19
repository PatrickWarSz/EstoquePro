# 📱 Stock Keeper Pro - Scanner Offline & Sincronização

## O que foi implementado

✅ **Scanner funcionando offline** - Movimentações ficam enfileiradas localmente (IndexedDB)  
✅ **Sincronização automática** - Quando voltar online, sincroniza automaticamente  
✅ **Sincronização manual** - Botão "🔄 Sincronizar agora" na tela do scanner  
✅ **Contador de pendentes** - Mostra quantos movimentos aguardam sincronização  
✅ **Backup automático** - Dados exportáveis em Configurações  
✅ **Retries com backoff** - Falhas transitórias são automaticamente retentadas  
✅ **Logs detalhados** - Console com rastreabilidade de cada operação  

---

## 🚀 Como usar no galpão

### Pré-requisitos
1. Celular ou tablet com navegador moderno (Chrome, Firefox, Safari)
2. Acesso à internet (mesmo que Wi-Fi fraco)
3. Aplicativo já aberto em: `https://seu-dominio.com` (ou IP local)

### Fluxo normal (online)
1. Abra o **Scanner** na navegação
2. Leia QR de um **item** ou **prateleira**
3. Insira **quantidade** e escolha **Entrada** ou **Saída**
4. Revise e **confirme**
5. ✅ Movimentação é **registrada instantaneamente** no banco

### Fluxo offline (sem internet)
1. Leia QR, insira quantidade, confirme ✓
2. A UI mostra **✓ registrado localmente**
3. Contador **"Pendentes: N"** aumenta no topo
4. Celular guarda os dados **em cache (IndexedDB)**
5. Quando voltar online → **sincroniza automaticamente**

### Se a sincronização automática não acontecer
1. Clique em **"🔄 Sincronizar agora"** (aparece quando há pendentes)
2. Aguarde ⏳
3. Se der erro, tente novamente em alguns segundos

---

## ⚙️ Detalhes técnicos para admins

### Onde os dados ficam?
- **Online**: Banco PostgreSQL (Supabase)
- **Offline/pendentes**: IndexedDB do navegador (~50MB por dispositivo)
- **Backup**: Storage Supabase (JSON comprimido)

### Como ver logs?
Abra o **DevTools** (F12 ou Cmd+Option+I):
- Aba **Console**: Mensagens com `[syncPendingMovements]`, `[idb-queue]`, etc.
- Procure por: `✓ N movimentação(ões) sincronizada(s)`

### Fila pendente não sincroniza?
**Checklist:**
1. ✅ Volte ao modo **online** (internet restaurada)
2. ✅ Recarregue a página (Cmd/Ctrl + R)
3. ✅ Clique em **"🔄 Sincronizar agora"**
4. ✅ Se ainda falhar: contate suporte com **logs do Console**

---

## 🔄 Migração automática
Se havia fila antiga em `localStorage`, será migrada para IndexedDB automaticamente na primeira carga após update.

## 📊 Monitoramento
- **Contador de pendentes**: Você sempre vê quantos aguardam sync
- **Status visual**: Botão com ⏳ enquanto sincroniza
- **Toast notifications**: Mensagens de sucesso/erro em tempo real

---

## 🛡️ Backup & Recover
Vá em **Configurações → Backups** para:
- 📥 Realizar backup manual agora
- ✨ Ver lista de backups anteriores
- ↩️ Restaurar de um backup (em caso de perda de dados)

---

## ❓ Dúvidas frequentes

**P: Perdi conexão no meio de um lote. Os dados foram guardados?**  
R: Sim! A página registra localmente antes de sincronizar. Voltou a internet? Sincroniza automaticamente.

**P: Posso usar em 2 celulares ao mesmo tempo?**  
R: Sim, cada um tem sua fila local. Sincronizam independentemente.

**P: Quanto tempo demora a sincronização?**  
R: ~1-2s por movimento. Um lote de 50 itens: ~5-10s (depende da internet).

**P: E se falhar a internet durante o sync?**  
R: Retries automáticos com backoff exponencial. Se falhar, fica enfileirado e tenta novamente quando voltar online.

**P: Como limpo a fila local se der problema?**  
R: Abra DevTools → Console → Cole:  
```javascript
const idb = indexedDB.open('stockkeeper_db');
idb.onsuccess = db => {
  db.result.transaction('pending_movements', 'readwrite').objectStore('pending_movements').clear();
};
```
Depois: recarregue e tente sincronizar novamente.

---

## 🚨 Suporte
Se algo não funcionar:
1. Abra DevTools (F12) → Console
2. Tente sincronizar novamente
3. Copie os logs que aparecerem
4. Envie para o admin com: **dispositivo, horário, ação que fez**

---

**Versão:** Stock Keeper Pro v1.2 (Maio 2026)  
**Última atualização:** 2026-05-19  
**Status:** ✅ Pronto para produção
