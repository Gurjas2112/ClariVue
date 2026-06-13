// Mints LiveKit access tokens. The grant is the single place room permissions are
// set: agents get roomAdmin/roomCreate, customers get join + publish/subscribe only.
import 'server-only'
import { AccessToken } from 'livekit-server-sdk'

export interface MintTokenArgs {
  room: string
  identity: string
  name: string
  isAgent: boolean
}

export async function mintToken({ room, identity, name, isAgent }: MintTokenArgs): Promise<string> {
  const at = new AccessToken(
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!,
    { identity, name, ttl: '4h' },
  )

  at.addGrant({
    room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
    // Privileged grants only for agents — enforced server-side, not in the UI.
    roomAdmin: isAgent,
    roomCreate: isAgent,
  })

  return at.toJwt() // async in livekit-server-sdk v2
}
