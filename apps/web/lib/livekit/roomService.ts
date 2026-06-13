// RoomServiceClient wrapper — server-routed control plane for rooms.
import 'server-only'
import { RoomServiceClient } from 'livekit-server-sdk'

let client: RoomServiceClient | null = null

export function roomService(): RoomServiceClient {
  if (!client) {
    client = new RoomServiceClient(
      process.env.LIVEKIT_URL!, // http(s) host for the server SDK
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!,
    )
  }
  return client
}

// Close a room and all its connections cleanly. Idempotent: a missing room is fine.
export async function closeRoom(roomName: string): Promise<void> {
  try {
    await roomService().deleteRoom(roomName)
  } catch (err) {
    // Room may already be gone (everyone left). Not an error for our purposes.
    console.warn(`[livekit] deleteRoom(${roomName}) failed (likely already closed):`, err)
  }
}
