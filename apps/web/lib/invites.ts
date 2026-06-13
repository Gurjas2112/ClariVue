// Opaque, unguessable invite + room identifiers.
import 'server-only'
import { randomBytes } from 'crypto'

// URL-safe base62-ish id from random bytes.
function randomId(bytes: number): string {
  return randomBytes(bytes).toString('base64url')
}

// ~22 chars of entropy — not enumerable.
export function newInviteId(): string {
  return randomId(16)
}

// Distinct, namespaced LiveKit room name per session.
export function newRoomName(): string {
  return `clarivue-${randomId(8)}`
}
