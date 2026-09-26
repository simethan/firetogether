"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { parseNumber, parseString } from "@/lib/actions";
import { getAuthUserId } from "@/lib/auth";
import { scheduleGroupSync } from "@/lib/groups/bridge";
import {
  generateGroupCode,
  groupAccessCookieName,
  groupAccessToken,
  hashGroupPassword,
  normalizeGroupCode,
  verifyGroupPassword,
} from "@/lib/groups/security";
import {
  getGroupContext,
  groupPath,
  logActivity,
  requireGroupMember,
  withError,
  withNotice,
} from "@/lib/groups/server";
import { SUPPORTED_CURRENCIES } from "@/lib/groups/types";
import { createServiceClient } from "@/lib/supabase/admin";

function parseCurrency(value: FormDataEntryValue | null, fallback = "SGD") {
  const code = typeof value === "string" ? value.trim().toUpperCase() : "";
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(code) ? code : fallback;
}

async function requireSignedIn(next: string) {
  const authUserId = await getAuthUserId();
  if (!authUserId) redirect(`/login?next=${encodeURIComponent(next)}`);
  const admin = createServiceClient();
  const { data: user } = await admin.from("users").select("id, name").eq("id", authUserId).maybeSingle();
  if (!user) redirect("/onboarding");
  return { admin, user: user as { id: string; name: string } };
}

export async function createGroupAction(formData: FormData) {
  const { admin, user } = await requireSignedIn("/groups");
  const name = parseString(formData.get("name"));
  const description = parseString(formData.get("description"));
  const password = parseString(formData.get("password"));
  const baseCurrency = parseCurrency(formData.get("base_currency"));

  if (!name) redirect(withError("/groups", "Give the group a name."));

  let group: { id: string; code: string } | null = null;
  for (let attempt = 0; attempt < 5 && !group; attempt++) {
    const { data, error } = await admin
      .from("split_groups")
      .insert({
        code: generateGroupCode(),
        name,
        description,
        base_currency: baseCurrency,
        password_hash: password ? hashGroupPassword(password) : null,
        created_by: user.id,
      })
      .select("id, code")
      .single();
    if (data) group = data;
    else if (error && !error.message.includes("duplicate")) redirect(withError("/groups", error.message));
  }
  if (!group) redirect(withError("/groups", "Could not create the group. Try again."));

  const { data: member, error: memberError } = await admin
    .from("group_members")
    .insert({ group_id: group.id, user_id: user.id, nickname: user.name, role: "admin" })
    .select("id, group_id, user_id, nickname, role, banned, removed_at, sync_to_budget, created_at")
    .single();
  if (memberError) redirect(withError("/groups", memberError.message));

  await logActivity(admin, group.id, member, "GROUP_CREATED", { name });
  redirect(groupPath(group.code));
}

export async function goToGroupAction(formData: FormData) {
  const code = normalizeGroupCode(String(formData.get("code") ?? ""));
  if (!code) redirect(withError("/groups", "Enter a group code."));
  redirect(groupPath(code));
}

export async function verifyGroupPasswordAction(formData: FormData) {
  const code = normalizeGroupCode(String(formData.get("code") ?? ""));
  const password = String(formData.get("password") ?? "");
  const context = await getGroupContext(code);
  if (!context) redirect(withError("/groups", "Group not found."));
  const { group } = context;

  if (!group.password_hash || !verifyGroupPassword(password, group.password_hash)) {
    redirect(withError(groupPath(group.code), "Incorrect password."));
  }

  (await cookies()).set(groupAccessCookieName(group.code), groupAccessToken(group.code, group.password_hash), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  redirect(groupPath(group.code));
}

export async function joinGroupAction(formData: FormData) {
  const code = normalizeGroupCode(String(formData.get("code") ?? ""));
  const joinPath = groupPath(code, "/join");
  const { admin, user } = await requireSignedIn(joinPath);
  const context = await getGroupContext(code);
  if (!context) redirect(withError("/groups", "Group not found."));
  const { group, me, isBanned, canView } = context;

  if (me) redirect(groupPath(group.code));
  if (isBanned) redirect(withError(joinPath, "You've been removed from this group."));
  if (!canView) redirect(withError(groupPath(group.code), "Enter the group password first."));
  if (group.status === "archived") redirect(withError(groupPath(group.code), "This group is archived."));

  const nickname = parseString(formData.get("nickname")) ?? user.name;
  const existing = context.allMembers.find((m) => m.user_id === user.id);

  const { data: member, error } = existing
    ? await admin
        .from("group_members")
        .update({ removed_at: null, nickname })
        .eq("id", existing.id)
        .select("id, group_id, user_id, nickname, role, banned, removed_at, sync_to_budget, created_at")
        .single()
    : await admin
        .from("group_members")
        .insert({ group_id: group.id, user_id: user.id, nickname })
        .select("id, group_id, user_id, nickname, role, banned, removed_at, sync_to_budget, created_at")
        .single();
  if (error) redirect(withError(joinPath, error.message));

  await logActivity(admin, group.id, member, "MEMBER_JOINED", { via: "code", nickname });
  scheduleGroupSync(admin, group.id);
  redirect(withNotice(groupPath(group.code), `Welcome to ${group.name}!`));
}

export async function claimMemberAction(formData: FormData) {
  const code = normalizeGroupCode(String(formData.get("code") ?? ""));
  const memberId = parseString(formData.get("member_id"));
  const joinPath = groupPath(code, "/join");
  const { admin, user } = await requireSignedIn(joinPath);
  const context = await getGroupContext(code);
  if (!context) redirect(withError("/groups", "Group not found."));
  const { group, me, isBanned, canView } = context;

  if (me) redirect(withError(groupPath(group.code), `You're already in this group as ${me.nickname}.`));
  if (isBanned) redirect(withError(joinPath, "You've been removed from this group."));
  if (!canView) redirect(withError(groupPath(group.code), "Enter the group password first."));

  const target = context.members.find((m) => m.id === memberId);
  if (!target || target.user_id) redirect(withError(joinPath, "That name has already been claimed."));

  const leftover = context.allMembers.find((m) => m.user_id === user.id);
  if (leftover) {
    await admin.from("group_members").update({ user_id: null }).eq("id", leftover.id);
  }

  const { error } = await admin
    .from("group_members")
    .update({ user_id: user.id })
    .eq("id", target.id)
    .is("user_id", null);
  if (error) redirect(withError(joinPath, error.message));

  await logActivity(admin, group.id, { ...target, user_id: user.id }, "MEMBER_CLAIMED", {
    claimedName: target.nickname,
  });
  scheduleGroupSync(admin, group.id);
  redirect(withNotice(groupPath(group.code), `You're ${target.nickname} in ${group.name}.`));
}

export async function addPersonAction(formData: FormData) {
  const code = String(formData.get("code") ?? "");
  const returnTo = parseString(formData.get("return_to"));
  const { admin, group, me, members } = await requireGroupMember(code);
  const nickname = parseString(formData.get("nickname"));
  const back = returnTo?.startsWith("/groups/") ? returnTo : groupPath(group.code, "?tab=settings");

  if (!nickname) redirect(withError(back, "Enter a name."));
  if (members.some((m) => m.nickname.toLowerCase() === nickname.toLowerCase())) {
    redirect(withError(back, `${nickname} is already in the group.`));
  }

  const { error } = await admin.from("group_members").insert({ group_id: group.id, nickname });
  if (error) redirect(withError(back, error.message));

  await logActivity(admin, group.id, me, "MEMBER_ADDED", { addedName: nickname, tagged: false });
  redirect(back);
}

export async function renameMemberAction(formData: FormData) {
  const code = String(formData.get("code") ?? "");
  const { admin, group, me, isAdmin, members } = await requireGroupMember(code);
  const memberId = parseString(formData.get("member_id"));
  const nickname = parseString(formData.get("nickname"));
  const back = groupPath(group.code, "?tab=settings");
  const target = members.find((m) => m.id === memberId);

  if (!target || !nickname) redirect(withError(back, "Enter a name."));
  if (target.id !== me.id && !isAdmin) redirect(withError(back, "Only admins can rename other people."));

  await admin.from("group_members").update({ nickname }).eq("id", target.id);
  await logActivity(
    admin,
    group.id,
    me,
    target.id === me.id ? "MEMBER_RENAMED" : "MEMBER_RENAMED_BY_ADMIN",
    { memberId: target.id, nickname, previousNickname: target.nickname },
  );
  scheduleGroupSync(admin, group.id);
  redirect(back);
}

function adminCount(members: { role: string; id: string }[], excluding?: string) {
  return members.filter((m) => m.role === "admin" && m.id !== excluding).length;
}

export async function removeMemberAction(formData: FormData) {
  const code = String(formData.get("code") ?? "");
  const { admin, group, me, members } = await requireGroupMember(code, { admin: true });
  const memberId = parseString(formData.get("member_id"));
  const ban = formData.get("ban") === "true";
  const back = groupPath(group.code, "?tab=settings");
  const target = members.find((m) => m.id === memberId);

  if (!target) redirect(withError(back, "Member not found."));
  if (target.role === "admin" && adminCount(members, target.id) === 0) {
    redirect(withError(back, "Promote another admin first."));
  }

  // History stays attached to the member row; only the account link is dropped.
  const update = ban
    ? { banned: true, removed_at: new Date().toISOString(), role: "member" }
    : { user_id: null, removed_at: new Date().toISOString(), role: "member", nickname: `Former member (${target.nickname})` };
  await admin.from("group_members").update(update).eq("id", target.id);

  await logActivity(admin, group.id, me, ban ? "MEMBER_BANNED" : "MEMBER_REMOVED", {
    memberId: target.id,
    nickname: target.nickname,
  });
  scheduleGroupSync(admin, group.id);
  redirect(back);
}

export async function setMemberRoleAction(formData: FormData) {
  const code = String(formData.get("code") ?? "");
  const { admin, group, me, members } = await requireGroupMember(code, { admin: true });
  const memberId = parseString(formData.get("member_id"));
  const role = formData.get("role") === "admin" ? "admin" : "member";
  const back = groupPath(group.code, "?tab=settings");
  const target = members.find((m) => m.id === memberId);

  if (!target) redirect(withError(back, "Member not found."));
  if (role === "admin" && !target.user_id) redirect(withError(back, "Only people with an account can be admins."));
  if (role === "member" && adminCount(members, target.id) === 0) {
    redirect(withError(back, "A group needs at least one admin."));
  }

  await admin.from("group_members").update({ role }).eq("id", target.id);
  await logActivity(admin, group.id, me, "MEMBER_ROLE_CHANGED", { memberId: target.id, role });
  redirect(back);
}

export async function updateGroupSettingsAction(formData: FormData) {
  const code = String(formData.get("code") ?? "");
  const { admin, group, me } = await requireGroupMember(code, { admin: true });
  const back = groupPath(group.code, "?tab=settings");

  const name = parseString(formData.get("name")) ?? group.name;
  const reminderDays = parseNumber(formData.get("reminder_days"));
  const password = parseString(formData.get("password"));
  const clearPassword = formData.get("clear_password") === "true";

  const update: Record<string, unknown> = {
    name,
    description: parseString(formData.get("description")),
    base_currency: parseCurrency(formData.get("base_currency"), group.base_currency),
    simplify_debts: formData.get("simplify_debts") === "on",
    convert_balances: formData.get("convert_balances") === "on",
    reminders_enabled: formData.get("reminders_enabled") === "on",
    reminder_days: reminderDays && reminderDays > 0 ? Math.round(reminderDays) : group.reminder_days,
    status: formData.get("archived") === "on" ? "archived" : "active",
  };
  if (clearPassword) update.password_hash = null;
  else if (password) update.password_hash = hashGroupPassword(password);

  const { error } = await admin.from("split_groups").update(update).eq("id", group.id);
  if (error) redirect(withError(back, error.message));

  if (update.base_currency !== group.base_currency) {
    // Locked rates were relative to the old base currency.
    await admin.from("group_fx_rates").delete().eq("group_id", group.id);
  }

  await logActivity(admin, group.id, me, "GROUP_SETTINGS_UPDATED", {
    simplifyDebts: update.simplify_debts,
    baseCurrency: update.base_currency,
  });
  scheduleGroupSync(admin, group.id);
  redirect(withNotice(back, "Settings saved."));
}

export async function leaveGroupAction(formData: FormData) {
  const code = String(formData.get("code") ?? "");
  const { admin, group, me, members } = await requireGroupMember(code);

  if (me.role === "admin" && adminCount(members, me.id) === 0 && members.length > 1) {
    redirect(withError(groupPath(group.code, "?tab=settings"), "Promote another admin before leaving."));
  }

  await admin
    .from("group_members")
    .update({ user_id: null, removed_at: new Date().toISOString(), role: "member" })
    .eq("id", me.id);
  await logActivity(admin, group.id, me, "MEMBER_LEFT", { nickname: me.nickname });
  scheduleGroupSync(admin, group.id);
  redirect(withNotice("/groups", `You left ${group.name}.`));
}

export async function deleteGroupAction(formData: FormData) {
  const code = String(formData.get("code") ?? "");
  const { admin, group } = await requireGroupMember(code, { admin: true });
  const confirmation = normalizeGroupCode(String(formData.get("confirm") ?? ""));
  if (confirmation !== group.code) {
    redirect(withError(groupPath(group.code, "?tab=settings"), "Type the group code to confirm."));
  }

  const { data: receipts } = await admin
    .from("group_expenses")
    .select("receipt_path")
    .eq("group_id", group.id)
    .not("receipt_path", "is", null);
  const paths = (receipts ?? []).map((r: { receipt_path: string }) => r.receipt_path);
  if (paths.length) await admin.storage.from("receipts").remove(paths);

  await admin.from("split_groups").delete().eq("id", group.id);
  redirect(withNotice("/groups", `${group.name} was deleted.`));
}

export async function updateBudgetSyncAction(formData: FormData) {
  const code = String(formData.get("code") ?? "");
  const { admin, group, me, authUserId } = await requireGroupMember(code);
  const back = groupPath(group.code, "?tab=settings");

  await admin
    .from("group_members")
    .update({ sync_to_budget: formData.get("sync_to_budget") === "on" })
    .eq("id", me.id);

  const mappings: { user_id: string; group_category: string; category_id: string }[] = [];
  const cleared: string[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("map:")) continue;
    const groupCategory = key.slice(4);
    if (typeof value === "string" && value) {
      mappings.push({ user_id: authUserId, group_category: groupCategory, category_id: value });
    } else {
      cleared.push(groupCategory);
    }
  }

  if (mappings.length) {
    const { data: user } = await admin.from("users").select("couple_id").eq("id", authUserId).maybeSingle();
    const { data: owned } = await admin
      .from("categories")
      .select("id")
      .eq("couple_id", user?.couple_id ?? "")
      .in("id", mappings.map((m) => m.category_id));
    const ownedIds = new Set((owned ?? []).map((c: { id: string }) => c.id));
    const valid = mappings.filter((m) => ownedIds.has(m.category_id));
    if (valid.length) {
      await admin.from("group_category_map").upsert(valid, { onConflict: "user_id,group_category" });
    }
  }
  if (cleared.length) {
    await admin.from("group_category_map").delete().eq("user_id", authUserId).in("group_category", cleared);
  }

  scheduleGroupSync(admin, group.id);
  redirect(withNotice(back, "Budget sync updated."));
}
