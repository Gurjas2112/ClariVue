// Validates LiveKit webhook signatures. Rejects anything not signed with our key.
import 'server-only'
import { WebhookReceiver } from 'livekit-server-sdk'

let receiver: WebhookReceiver | null = null

export function webhookReceiver(): WebhookReceiver {
  if (!receiver) {
    receiver = new WebhookReceiver(
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!,
    )
  }
  return receiver
}
