import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ templates: [] });

  const { data, error } = await supabase
    .from("meeting_templates")
    .select("id, user_id, name, slug, description, sections, is_builtin, created_at")
    .or(`is_builtin.eq.true,user_id.eq.${user.id}`)
    .order("is_builtin", { ascending: false })
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[templates/list]", error.message);
    return NextResponse.json({ templates: [] });
  }
  return NextResponse.json({ templates: data ?? [] });
}

type CreateBody = {
  name?: string;
  description?: string | null;
  sections?: { key: string; label: string; description?: string }[];
};

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "custom";
}

export async function POST(req: Request) {
  const supabase = await createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: CreateBody;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid body" }, { status: 400 }); }

  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });

  const sections = (body.sections ?? [])
    .filter((s) => s.key?.trim() && s.label?.trim())
    .map((s) => ({
      key: slugify(s.key),
      label: s.label.trim(),
      description: s.description?.trim() || undefined,
    }));

  if (!sections.length) {
    return NextResponse.json({ error: "Add at least one section" }, { status: 400 });
  }

  // Always include action_items as the last section so tasks still get extracted
  if (!sections.some((s) => s.key === "action_items")) {
    sections.push({ key: "action_items", label: "Action items", description: "Tasks assigned to specific people" });
  }

  // Make slug unique per user
  const baseSlug = slugify(name);
  let slug = baseSlug;
  let n = 2;
  while (true) {
    const { data: clash } = await supabase
      .from("meeting_templates")
      .select("id")
      .eq("user_id", user.id)
      .eq("slug", slug)
      .maybeSingle();
    if (!clash) break;
    slug = `${baseSlug}_${n++}`;
  }

  const { data, error } = await supabase
    .from("meeting_templates")
    .insert({
      user_id: user.id,
      name,
      slug,
      description: body.description?.trim() || null,
      sections,
      is_builtin: false,
    })
    .select()
    .single();

  if (error) {
    console.error("[templates/create]", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data);
}
