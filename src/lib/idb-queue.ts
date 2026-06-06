// Minimal IndexedDB queue helper for pending movements
const DB_NAME = 'stockkeeper_db'
const STORE = 'pending_movements'
const VERSION = 1

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function enqueuePendingMovement(item: any) {
  const db = await openDB()
  try {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    store.add(item)
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); })
  } finally { db.close() }
}

export async function getAllPendingMovements(): Promise<any[]> {
  const db = await openDB()
  try {
    const tx = db.transaction(STORE, 'readonly')
    const store = tx.objectStore(STORE)
    const req = store.getAll()
    return await new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result as any[])
      req.onerror = () => reject(req.error)
    })
  } finally { db.close() }
}

export async function getPendingMovements(scope?: { workspaceId?: string | null; ownerUserId?: string | null; includeLegacy?: boolean }): Promise<any[]> {
  const all = await getAllPendingMovements()
  if (!scope) return all
  return all.filter((item) => {
    if (scope.workspaceId && item.workspaceId !== scope.workspaceId) return false
    if (scope.ownerUserId) {
      if (item.ownerUserId) return item.ownerUserId === scope.ownerUserId
      return scope.includeLegacy === true
    }
    return true
  })
}

export async function clearPendingMovements() {
  const db = await openDB()
  try {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).clear()
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); })
  } finally { db.close() }
}

export async function clearPendingMovementsFor(scope?: { workspaceId?: string | null; ownerUserId?: string | null; includeLegacy?: boolean }) {
  if (!scope) return clearPendingMovements()
  const items = await getPendingMovements(scope)
  await Promise.all(items.map((item) => removePendingMovement(item.id)))
}

export async function removePendingMovement(id: string) {
  const db = await openDB()
  try {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = () => rej(tx.error); })
  } finally { db.close() }
}

export async function countPendingMovements(): Promise<number> {
  const db = await openDB()
  try {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).count()
    return await new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result as number); req.onerror = () => reject(req.error); })
  } finally { db.close() }
}

export async function countPendingMovementsFor(scope?: { workspaceId?: string | null; ownerUserId?: string | null; includeLegacy?: boolean }): Promise<number> {
  if (!scope) return countPendingMovements()
  return (await getPendingMovements(scope)).length
}

// Migrate existing localStorage queue (one-time). Removes localStorage key after migrating.
export async function migrateFromLocalStorage() {
  try {
    const key = 'estoque_pro_pending_movements'
    const raw = localStorage.getItem(key)
    if (!raw) return
    let arr = []
    try { arr = JSON.parse(raw || '[]') } catch { arr = [] }
    if (!arr || arr.length === 0) { localStorage.removeItem(key); return }
    console.log(`[idb-queue] Migrando ${arr.length} movimentações de localStorage para IndexedDB...`);
    for (const it of arr) {
      try { await enqueuePendingMovement(it) } catch (e) { console.warn('[idb-queue] Falha ao migrar item:', it.id, e) }
    }
    localStorage.removeItem(key)
    console.log('[idb-queue] Migração concluída');
  } catch (err) {
    console.warn('[idb-queue] migrateFromLocalStorage failed', err)
  }
}

// Retry helper for transient failures
export async function enqueuePendingMovementWithRetry(item: any, maxRetries: number = 3): Promise<boolean> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      await enqueuePendingMovement(item)
      return true
    } catch (e) {
      if (attempt === maxRetries - 1) {
        console.error(`[idb-queue] Falha ao enfileirar após ${maxRetries} tentativas:`, item.id, e)
        return false
      }
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 100)); // exponential backoff
    }
  }
  return false
}
