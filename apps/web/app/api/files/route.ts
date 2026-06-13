// File sharing in chat (R17). Anonymous customers can't write to Storage directly,
// so uploads pass through here: validate access → mime/size checks → store under a
// per-session path with the service key → record metadata → return a signed URL.
import { NextResponse } from "next/server";
import { canAccessSession } from "@/lib/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB
const ALLOWED = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "file";
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }

  const file = form.get("file");
  const sessionId = String(form.get("sessionId") ?? "");
  const inviteId = (form.get("inviteId") as string) || undefined;
  const senderIdentity = String(form.get("senderIdentity") ?? "unknown");

  if (!(file instanceof File) || !sessionId) {
    return NextResponse.json({ error: "Missing file or session" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File exceeds 25 MB limit" }, { status: 413 });
  }
  if (file.type && !ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 415 });
  }

  const access = await canAccessSession({ sessionId, inviteId });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const admin = createAdminClient();
  const path = `${sessionId}/${randomBytes(8).toString("hex")}-${safeName(file.name)}`;
  const bytes = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await admin.storage
    .from("session-files")
    .upload(path, bytes, { contentType: file.type || "application/octet-stream", upsert: false });
  if (upErr) return NextResponse.json({ error: "Upload failed" }, { status: 500 });

  const { data: row, error: insErr } = await admin
    .from("shared_files")
    .insert({
      session_id: sessionId,
      sender_identity: senderIdentity.slice(0, 80),
      storage_path: path,
      file_name: file.name.slice(0, 200),
      mime_type: file.type || null,
      size_bytes: file.size,
    })
    .select("*")
    .single();
  if (insErr) return NextResponse.json({ error: "Could not record file" }, { status: 500 });

  // Short-lived signed URL so the peer can open it immediately during the call.
  const { data: signed } = await admin.storage.from("session-files").createSignedUrl(path, 3600);

  return NextResponse.json(
    { file: row, url: signed?.signedUrl ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}
