// QR payload format helpers
// v1 (current):
//   estoquepro:v1:item:{categoryId}:{itemId}:{checksum}
//   estoquepro:v1:location:{locationId}:{checksum}
// legacy (still accepted):
//   estoquepro:item:{categoryId}:{itemId}
//   estoquepro:location:{locationId}

export type QrPayload =
  | { kind: 'item'; categoryId: string; itemId: string }
  | { kind: 'location'; locationId: string }

// Tiny FNV-1a → base36 (4 chars). Detects accidental tampering / partial reads.
function checksum(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0
  }
  return h.toString(36).padStart(7, '0').slice(-4)
}

export function encodeItemQr(categoryId: string, itemId: string) {
  const body = `item:${categoryId}:${itemId}`
  return `estoquepro:v1:${body}:${checksum(body)}`
}

export function encodeLocationQr(locationId: string) {
  const body = `location:${locationId}`
  return `estoquepro:v1:${body}:${checksum(body)}`
}

/** Stable key for alias lookups — independent of version/checksum. */
export function qrKey(p: QrPayload): string {
  return p.kind === 'item'
    ? `item:${p.categoryId}:${p.itemId}`
    : `location:${p.locationId}`
}

export function parseQr(text: string): QrPayload | null {
  if (!text) return null
  const parts = text.trim().split(':')
  if (parts[0] !== 'estoquepro') return null

  // v1 with checksum
  if (parts[1] === 'v1') {
    const kind = parts[2]
    const sum = parts[parts.length - 1]
    const body = parts.slice(2, -1).join(':')
    if (checksum(body) !== sum) return null
    if (kind === 'item' && parts[3] && parts[4]) {
      return { kind: 'item', categoryId: parts[3], itemId: parts.slice(4, -1).join(':') }
    }
    if (kind === 'location' && parts[3]) {
      return { kind: 'location', locationId: parts.slice(3, -1).join(':') }
    }
    return null
  }

  // legacy (no version, no checksum) — still accepted
  if (parts[1] === 'item' && parts[2] && parts[3]) {
    return { kind: 'item', categoryId: parts[2], itemId: parts.slice(3).join(':') }
  }
  if (parts[1] === 'location' && parts[2]) {
    return { kind: 'location', locationId: parts.slice(2).join(':') }
  }
  return null
}
