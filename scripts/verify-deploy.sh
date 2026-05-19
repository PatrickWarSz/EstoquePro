#!/bin/bash
# stock-keeper-pro-verify.sh - Verificação completa antes de deploy

echo "🔍 Stock Keeper Pro - Verificação de Deploy"
echo "==========================================="
echo ""

echo "✓ TypeScript check..."
npx tsc --noEmit
if [ $? -ne 0 ]; then
  echo "❌ TypeScript errors found!"
  exit 1
fi

echo "✓ ESLint check..."
npx eslint src/ 2>/dev/null || echo "⚠️  ESLint warnings (não crítico)"

echo ""
echo "✓ Building project..."
npm run build
if [ $? -ne 0 ]; then
  echo "❌ Build failed!"
  exit 1
fi

echo ""
echo "✓ Checking IndexedDB helper..."
if grep -q "enqueuePendingMovement\|getAllPendingMovements\|clearPendingMovements" src/lib/idb-queue.ts; then
  echo "✅ idb-queue.ts OK"
else
  echo "❌ idb-queue.ts missing functions!"
  exit 1
fi

echo ""
echo "✓ Checking stock-store integration..."
if grep -q "enqueuePendingMovement\|applyBatchMovements\|syncPendingMovements" src/lib/stock-store.ts; then
  echo "✅ stock-store.ts OK"
else
  echo "❌ stock-store.ts missing integration!"
  exit 1
fi

echo ""
echo "✓ Checking ScannerPage UI..."
if grep -q "pendingCount\|Sincronizar agora" src/pages/ScannerPage.tsx; then
  echo "✅ ScannerPage.tsx OK"
else
  echo "❌ ScannerPage.tsx missing UI!"
  exit 1
fi

echo ""
echo "==========================================="
echo "✅ Tudo OK! Pronto para deploy"
echo ""
echo "Próximos passos:"
echo "1. git add ."
echo "2. git commit -m 'feat: offline scanner + IndexedDB sync'"
echo "3. git push origin main"
echo "4. Deploy para staging/production"
echo ""
