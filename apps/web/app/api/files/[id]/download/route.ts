// Download a shared file from the session record (agent owner / admin). Redirects
// to a short-lived signed URL — files are never public.
import { NextResponse } from "next/server";
import { getAuthedUser } from "@/lib/auth";
import { getSessionById } from "@/lib/sessions";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const user = await getAuthedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = createAdminClient();
  const { data: file } = await admin.from("shared_files").select("*").eq("id", id).single();
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const session = await getSessionById(file.session_id);
  if (!session || (user.role !== "admin" && session.agent_id !== user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: signed } = await admin.storage
    .from("session-files")
    .createSignedUrl(file.storage_path, 120, { download: file.file_name });
  if (!signed) return NextResponse.json({ error: "Could not sign URL" }, { status: 500 });

  return NextResponse.redirect(signed.signedUrl);
}
