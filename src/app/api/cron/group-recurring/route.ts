import { NextResponse, type NextRequest } from "next/server";

import { cronAuthError } from "@/lib/cron";
import { syncGroupBudgets } from "@/lib/groups/bridge";
import { postRecurringOccurrence, RECURRING_COLUMNS, type GroupRecurring } from "@/lib/groups/recurring";
import { GROUP_COLUMNS, MEMBER_COLUMNS } from "@/lib/groups/server";
import type { GroupMember, SplitGroup } from "@/lib/groups/types";
import { createServiceClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/** Posts every group recurring expense that's due (catching up missed occurrences). */
export async function GET(request: NextRequest) {
  const authError = cronAuthError(request);
  if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status });

  const admin = createServiceClient();
  const today = new Date().toISOString().slice(0, 10);
  const { data: due, error } = await admin
    .from("scheduled_transactions")
    .select(RECURRING_COLUMNS)
    .not("group_id", "is", null)
    .eq("is_active", true)
    .lte("next_date", today);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const touched = new Set<string>();
  let posted = 0;
  for (const row of (due ?? []) as GroupRecurring[]) {
    let current: GroupRecurring | null = row;
    for (let guard = 0; current && current.is_active && current.next_date <= today && guard < 60; guard++) {
      if (current.end_date && current.next_date > current.end_date) break;
      if (!(await postRecurringOccurrence(admin, current))) break;
      posted++;
      touched.add(current.group_id);
      const { data: refreshed } = await admin
        .from("scheduled_transactions")
        .select(RECURRING_COLUMNS)
        .eq("id", current.id)
        .maybeSingle();
      current = refreshed as GroupRecurring | null;
    }
  }

  for (const groupId of touched) {
    const [{ data: group }, { data: members }] = await Promise.all([
      admin.from("split_groups").select(GROUP_COLUMNS).eq("id", groupId).maybeSingle(),
      admin.from("group_members").select(MEMBER_COLUMNS).eq("group_id", groupId),
    ]);
    if (group) await syncGroupBudgets(admin, group as SplitGroup, (members ?? []) as GroupMember[]);
  }

  return NextResponse.json({ posted, groups: touched.size });
}
