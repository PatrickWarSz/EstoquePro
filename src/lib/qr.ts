// QR payload format helpers
// item:    estoquepro:item:{categoryId}:{itemId}
// location: estoquepro:location:{locationId}

export type QrPayload =
  | { kind: 'item'; categoryId: string; itemId: string }
  | { kind: 'location'; locationId: string }

export function encodeItemQr(categoryId: string, itemId: string) {
  return `estoquepro:item:${categoryId}:${itemId}`
}

export function encodeLocationQr(locationId: string) {
  return `estoquepro:location:${locationId}`
}

export function parseQr(text: string): QrPayload | null {
  if (!text) return null
  const trimmed = text.trim()
  const parts = trimmed.split(':')
  if (parts[0] !== 'estoquepro') return null
  if (parts[1] === 'item' && parts[2] && parts[3]) {
    return { kind: 'item', categoryId: parts[2], itemId: parts.slice(3).join(':') }
  }
  if (parts[1] === 'location' && parts[2]) {
    return { kind: 'location', locationId: parts.slice(2).join(':') }
  }
  return null
}
