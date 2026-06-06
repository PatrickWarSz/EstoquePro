// Generic offline operation queue (IndexedDB).
// Distinct from idb-queue.ts (which is movement-specific and kept for
// backward compat). This queue handles orders, deliveries, items, etc.
//
// Each op may reference temporary IDs (prefixed "tmp_") created by earlier
// queued ops. When flushed online, the executor resolves tmp_ → real id via
// a map persisted in localStorage so dependent ops can be rewritten.

const DB_NAME = "stockkeeper_op_db";
const STORE = "pending_ops";
const VERSION = 1;
const TMP_MAP_KEY = "estoque_tmpid_map_v1";

export type OpType =
  | "order.add"
  | "order.update"
  | "order.remove"
  | "order.finalize"
  | "delivery.register"
  | "delivery.update"
  | "item.add"
  | "item.update"
  | "item.remove";

export interface QueuedOp {
  id: string;
  type: OpType;
  payload: any;
  workspaceId: string;
  ownerUserId?: string | null;
  createdAt: string;
  createsTempId?: string; // tmp_ id this op produces (if any)
  refFields?: string[];   // payload keys that may hold a tmp_ id
  attempts: number;
  lastError?: string;
}

export interface QueueScope {
  workspaceId?: string | null;
  ownerUserId?: string | null;
  includeLegacy?: boolean;
}

function matchesScope(op: QueuedOp, scope?: QueueScope): boolean {
  if (!scope) return true;
  if (scope.workspaceId && op.workspaceId !== scope.workspaceId) return false;
  if (scope.ownerUserId) {
    if (op.ownerUserId) return op.ownerUserId === scope.ownerUserId;
    return scope.includeLegacy === true;
  }
  return true;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function genId() {
  return Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
}

export function genTempId(prefix = "tmp"): string {
  return `tmp_${prefix}_${genId()}`;
}

export function isTempId(id: unknown): boolean {
  return typeof id === "string" && (
    id.startsWith("tmp_") ||
    id.startsWith("order_") ||
    id.startsWith("item_") ||
    id.startsWith("delivery_")
  );
}

function loadTmpMap(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(TMP_MAP_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveTmpMap(m: Record<string, string>) {
  try {
    localStorage.setItem(TMP_MAP_KEY, JSON.stringify(m));
  } catch {
    /* ignore */
  }
}

export function resolveTempId(id: string | undefined | null): string | null {
  if (!id) return null;
  if (!isTempId(id)) return id;
  const m = loadTmpMap();
  return m[id] || null;
}

export async function enqueueOp(
  op: Omit<QueuedOp, "id" | "createdAt" | "attempts">,
): Promise<string> {
  const full: QueuedOp = {
    ...op,
    id: genId(),
    createdAt: new Date().toISOString(),
    attempts: 0,
  };
  const db = await openDB();
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).add(full);
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  } finally {
    db.close();
  }
  return full.id;
}

export async function listOps(scope?: QueueScope): Promise<QueuedOp[]> {
  const db = await openDB();
  try {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    return await new Promise<QueuedOp[]>((res, rej) => {
      req.onsuccess = () => res(((req.result as QueuedOp[]) || []).filter((op) => matchesScope(op, scope)));
      req.onerror = () => rej(req.error);
    });
  } finally {
    db.close();
  }
}

export async function removeOp(id: string) {
  const db = await openDB();
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function updateOp(op: QueuedOp) {
  const db = await openDB();
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(op);
    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function countOps(scope?: QueueScope): Promise<number> {
  try {
    if (scope) return (await listOps(scope)).length;
    const db = await openDB();
    try {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).count();
      return await new Promise<number>((res, rej) => {
        req.onsuccess = () => res(req.result as number);
        req.onerror = () => rej(req.error);
      });
    } finally {
      db.close();
    }
  } catch {
    return 0;
  }
}

function rewriteRefs(payload: any, refFields: string[] | undefined): any {
  if (!refFields || refFields.length === 0) return payload;
  const map = loadTmpMap();
  const out = { ...payload };
  for (const field of refFields) {
    const val = out[field];
    if (typeof val === "string" && isTempId(val)) {
      const real = map[val];
      if (!real) {
        throw new Error(`tmp_id ${val} ainda não resolvido (${field})`);
      }
      out[field] = real;
    }
  }
  return out;
}

/**
 * Process the queue in order. Stops on first failure to preserve ordering.
 * Returns counts of succeeded / failed / remaining.
 */
export async function flushOps(
  executors: Record<
    OpType,
    (payload: any) => Promise<{ realId?: string } | void>
  >,
  scope?: QueueScope,
): Promise<{ ok: number; failed: number; remaining: number }> {
  const ops = (await listOps(scope)).sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt),
  );
  let ok = 0;
  let failed = 0;
  for (const op of ops) {
    try {
      const payload = rewriteRefs(op.payload, op.refFields);
      const result = await executors[op.type](payload);
      if (op.createsTempId && result && (result as any).realId) {
        const map = loadTmpMap();
        map[op.createsTempId] = (result as any).realId;
        saveTmpMap(map);
      }
      await removeOp(op.id);
      ok++;
    } catch (err: any) {
      failed++;
      const updated: QueuedOp = {
        ...op,
        attempts: (op.attempts || 0) + 1,
        lastError: err?.message || String(err),
      };
      await updateOp(updated);
      // Stop the loop on first error to preserve ordering.
      break;
    }
  }
  const remaining = await countOps(scope);
  return { ok, failed, remaining };
}

/** Prune tmp_id map entries older than N days to avoid unbounded growth. */
export function pruneTmpMap(maxEntries = 500) {
  const m = loadTmpMap();
  const keys = Object.keys(m);
  if (keys.length <= maxEntries) return;
  const trimmed: Record<string, string> = {};
  keys.slice(-maxEntries).forEach((k) => (trimmed[k] = m[k]));
  saveTmpMap(trimmed);
}