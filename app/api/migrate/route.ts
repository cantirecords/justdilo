import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// One-time migration runner — add new columns safely via DB function
export async function POST() {
  const supabase = createSupabaseAdmin();

  // Check if category column already exists
  const { data: probe, error: probeErr } = await supabase
    .from("tasks")
    .select("category")
    .limit(1);

  if (!probeErr) {
    return NextResponse.json({ ok: true, message: "category column already exists" });
  }

  if (!probeErr.message.includes("schema cache")) {
    return NextResponse.json({ error: probeErr.message }, { status: 500 });
  }

  // Column missing — run via Supabase Management API
  const projectRef = process.env.NEXT_PUBLIC_SUPABASE_URL!
    .replace("https://", "")
    .split(".")[0];

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const sql = `
    alter table tasks
      add column if not exists category text
        check (category in ('personal','business','health','finance','social','home','travel','shopping'));
  `;

  const res = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ query: sql }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    return NextResponse.json({ error: `Management API error: ${body}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: "category column added successfully" });
}
