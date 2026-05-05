import { createSupabaseAdmin } from "@/lib/supabase/admin";
import type { Correction } from "@/lib/ai";

// 5-min in-memory cache — survives across Fluid Compute request reuse
let _cache: { data: Correction[]; at: number } | null = null;
const TTL = 5 * 60 * 1000;

export async function getCorrections(): Promise<Correction[]> {
  if (_cache && Date.now() - _cache.at < TTL) return _cache.data;
  try {
    const admin = createSupabaseAdmin();
    const { data, error } = await admin
      .from("prompt_corrections")
      .select("original_transcript, correct_intent, correct_tasks, issue_type")
      .order("created_at", { ascending: false })
      .limit(15);
    if (error) return _cache?.data ?? [];
    _cache = { data: (data ?? []) as Correction[], at: Date.now() };
    return _cache.data;
  } catch {
    return _cache?.data ?? [];
  }
}

export function invalidateCorrectionsCache() {
  _cache = null;
}
