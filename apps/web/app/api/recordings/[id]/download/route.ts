// Download a finished recording (R16) — agent owner / admin. Signed URL redirect.
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
  const { data: rec } = await admin.from("recordings").select("*").eq("id", id).single();
  if (!rec || !rec.storage_path) return NextResponse.json({ error: "Not ready" }, { status: 404 });

  const session = await getSessionById(rec.session_id);
  if (!session || (user.role !== "admin" && session.agent_id !== user.id)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const fileName = `clarivue-${rec.session_id.slice(0, 8)}.mp4`;
  const { data: signed } = await admin.storage
    .from("recordings")
    .createSignedUrl(rec.storage_path, 120, { download: fileName });
  if (!signed) return NextResponse.json({ error: "Could not sign URL" }, { status: 500 });

  return NextResponse.redirect(signed.signedUrl);
}
