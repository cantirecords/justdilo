import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

const ADMIN_EMAIL = "yorohn@duck.com";

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data, error } = await supabase.rpc("get_user_activity_summary");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? {});
}
