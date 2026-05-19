import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

async function getEnabledUser(supabase: Awaited<ReturnType<typeof createSupabaseServer>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  let { data: profile, error } = await supabase
    .from("profiles").select("orgs_enabled").eq("id", user.id).single();
  if (error || !profile) {
    const fb = await supabase.from("profiles").select("*").eq("id", user.id).single();
    profile = fb.data;
  }
  if (!profile?.orgs_enabled) return null;
  return user;
}

// POST /api/orgs/[id]/members — invite a member by email
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: orgId } = await params;
  const supabase = await createSupabaseServer();
  const user = await getEnabledUser(supabase);
  if (!user) return NextResponse.json({ error: "not available" }, { status: 403 });

  const { email, role = "member" } = await req.json();
  const inviteEmail = email?.trim()?.toLowerCase();
  if (!inviteEmail) return NextResponse.json({ error: "email required" }, { status: 400 });
  if (!["admin", "member"].includes(role)) return NextResponse.json({ error: "invalid role" }, { status: 400 });

  // Verify requester is owner/admin of this org
  const { data: requesterMember } = await supabase
    .from("organization_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .single();

  if (!requesterMember || !["owner", "admin"].includes(requesterMember.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Look up if the invited email already has an account
  const { data: existingProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("email", inviteEmail)
    .single();

  const { data, error } = await supabase
    .from("organization_members")
    .upsert(
      {
        org_id: orgId,
        invited_email: inviteEmail,
        role,
        user_id: existingProfile?.id ?? null,
        status: existingProfile ? "active" : "pending",
      },
      { onConflict: "org_id,invited_email", ignoreDuplicates: false }
    )
    .select("*, profile:profiles!user_id(nickname, email)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Grant org access to the invited user if they already have an account.
  // Without this, their page.tsx skips the org data block entirely.
  if (existingProfile?.id) {
    const admin = createSupabaseAdmin();
    await admin.from("profiles").update({ orgs_enabled: true }).eq("id", existingProfile.id);
  }

  return NextResponse.json({ member: data }, { status: 201 });
}

// DELETE /api/orgs/[id]/members?memberId=... — remove a member
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: orgId } = await params;
  const { searchParams } = new URL(req.url);
  const memberId = searchParams.get("memberId");
  if (!memberId) return NextResponse.json({ error: "memberId required" }, { status: 400 });

  const supabase = await createSupabaseServer();
  const user = await getEnabledUser(supabase);
  if (!user) return NextResponse.json({ error: "not available" }, { status: 403 });

  // Fetch the member to remove
  const { data: target } = await supabase
    .from("organization_members")
    .select("user_id, role")
    .eq("id", memberId)
    .eq("org_id", orgId)
    .single();

  if (!target) return NextResponse.json({ error: "member not found" }, { status: 404 });

  // Allow: removing yourself OR being the org owner
  const isSelf = target.user_id === user.id;
  const { data: requester } = await supabase
    .from("organization_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .single();

  const isOwnerOrAdmin = requester && ["owner", "admin"].includes(requester.role);

  if (!isSelf && !isOwnerOrAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Prevent removing the org owner
  if (target.role === "owner") {
    return NextResponse.json({ error: "cannot remove org owner" }, { status: 400 });
  }

  const { error } = await supabase
    .from("organization_members")
    .delete()
    .eq("id", memberId)
    .eq("org_id", orgId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
