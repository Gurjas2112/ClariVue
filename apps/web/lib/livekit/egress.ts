// EgressClient wrapper — room-composite MP4 recording to Supabase Storage (S3).
import 'server-only'
import { EgressClient, EncodedFileOutput, EncodedFileType, S3Upload } from 'livekit-server-sdk'

let client: EgressClient | null = null

export function egressClient(): EgressClient {
  if (!client) {
    client = new EgressClient(
      process.env.LIVEKIT_URL!,
      process.env.LIVEKIT_API_KEY!,
      process.env.LIVEKIT_API_SECRET!,
    )
  }
  return client
}

// Build the S3 (Supabase Storage) output for a recording file.
export function buildFileOutput(filepath: string): EncodedFileOutput {
  return new EncodedFileOutput({
    fileType: EncodedFileType.MP4,
    filepath,
    output: {
      case: 's3',
      value: new S3Upload({
        accessKey: process.env.SUPABASE_S3_ACCESS_KEY,
        secret: process.env.SUPABASE_S3_SECRET_KEY,
        region: 'ap-southeast-1',
        endpoint: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/s3`,
        bucket: 'recordings',
        forcePathStyle: true,
      }),
    },
  })
}
