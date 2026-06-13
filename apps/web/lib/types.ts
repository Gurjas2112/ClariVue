// Shared domain types for ClariVue.

export type Role = 'agent' | 'customer' | 'admin'
export type SessionStatus = 'active' | 'ended'
export type RecordingStatus = 'in_progress' | 'processing' | 'ready' | 'failed'

export interface Session {
  id: string
  room_name: string
  invite_id: string
  agent_id: string | null
  title: string | null
  status: SessionStatus
  created_at: string
  ended_at: string | null
}

export interface SessionParticipant {
  id: string
  session_id: string
  identity: string
  display_name: string | null
  role: Role
  joined_at: string
  left_at: string | null
  disconnected_at: string | null
  reconnect_count: number
}

export interface SessionEvent {
  id: string
  session_id: string
  type: string
  identity: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export interface ChatMessage {
  id: string
  session_id: string
  sender_identity: string
  sender_role: Role
  body: string
  created_at: string
}

export interface SharedFile {
  id: string
  session_id: string
  sender_identity: string
  storage_path: string
  file_name: string
  mime_type: string | null
  size_bytes: number | null
  created_at: string
}

export interface Recording {
  id: string
  session_id: string
  egress_id: string | null
  status: RecordingStatus
  storage_path: string | null
  duration_seconds: number | null
  created_at: string
  ready_at: string | null
}

// Realtime chat payload sent over the LiveKit data channel.
export interface ChatWirePayload {
  kind: 'chat' | 'file'
  body: string
  senderName: string
  senderRole: Role
  // file-only fields
  fileName?: string
  fileUrl?: string
  mimeType?: string
  sizeBytes?: number
  ts: number
}
