// QR Code Offline Cache - IndexedDB para resolver QR codes sem internet

const DB_NAME = 'stockkeeper_qr_cache'
const STORE = 'qr_metadata'
const VERSION = 1

function openQrDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('workspaceId', 'workspaceId', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

interface QrMetadata {
  id: string // unique identifier
  workspaceId: string
  type: 'item' | 'location'
  categoryId?: string
  categoryName?: string
  itemId?: string
  itemName?: string
  itemUnit?: string
  itemMinQty?: number
  locationId?: string
  locationName?: string
  locationItems?: string[] // refs to items
  timestamp: string // last update
}

export async function cacheQrMetadata(
  workspaceId: string,
  items: Array<{ id: string; name: string; categoryId: string; categoryName: string; unit: string; minQuantity: number }>,
  locations: Array<{ id: string; name: string; itemRefs: string[] }>
) {
  try {
    const db = await openQrDB()
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)

    // Clear old workspace data
    const range = IDBKeyRange.only(workspaceId)
    const getReq = store.index('workspaceId').getAll(range)
    
    await new Promise<void>((resolve, reject) => {
      getReq.onsuccess = async () => {
        const oldKeys = getReq.result.map((r: any) => r.id)
        for (const key of oldKeys) {
          store.delete(key)
        }
        
        // Add new items
        for (const item of items) {
          const meta: QrMetadata = {
            id: `item-${item.id}`,
            workspaceId,
            type: 'item',
            itemId: item.id,
            itemName: item.name,
            categoryId: item.categoryId,
            categoryName: item.categoryName,
            itemUnit: item.unit,
            itemMinQty: item.minQuantity,
            timestamp: new Date().toISOString()
          }
          store.put(meta)
        }

        // Add new locations
        for (const loc of locations) {
          const meta: QrMetadata = {
            id: `location-${loc.id}`,
            workspaceId,
            type: 'location',
            locationId: loc.id,
            locationName: loc.name,
            locationItems: loc.itemRefs,
            timestamp: new Date().toISOString()
          }
          store.put(meta)
        }

        resolve()
      }
      getReq.onerror = () => reject(getReq.error)
    })

    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
    
    console.log(`[qr-cache] Cached ${items.length} items + ${locations.length} locations for workspace ${workspaceId}`)
  } catch (err) {
    console.warn('[qr-cache] Cache error:', err)
  }
}

export async function resolveQrFromCache(
  workspaceId: string,
  itemId?: string,
  locationId?: string
): Promise<QrMetadata | null> {
  try {
    const db = await openQrDB()
    const tx = db.transaction(STORE, 'readonly')
    const store = tx.objectStore(STORE)

    const id = itemId ? `item-${itemId}` : locationId ? `location-${locationId}` : null
    if (!id) return null

    return new Promise((resolve, reject) => {
      const req = store.get(id)
      req.onsuccess = () => {
        const result = req.result
        if (result && result.workspaceId === workspaceId) {
          resolve(result)
        } else {
          resolve(null)
        }
      }
      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    console.warn('[qr-cache] Resolve error:', err)
    return null
  }
}

export async function clearQrCache(workspaceId: string) {
  try {
    const db = await openQrDB()
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const range = IDBKeyRange.only(workspaceId)
    
    store.index('workspaceId').getAll(range).onsuccess = (e: any) => {
      e.target.result.forEach((item: any) => {
        store.delete(item.id)
      })
    }

    await new Promise<void>((res, rej) => {
      tx.oncomplete = () => res()
      tx.onerror = () => rej(tx.error)
    })
  } catch (err) {
    console.warn('[qr-cache] Clear error:', err)
  }
}
