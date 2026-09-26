/**
 * Import a SmartSplit group into FireTogether.
 *
 *   npm run import:smartsplit -- --code AJ7AGT [options]
 *
 * Options:
 *   --source <url>        SmartSplit origin (default https://smartsplit.snorlab.site)
 *   --cookie "<cookie>"   A signed-in SmartSplit session cookie. Needed for recurring
 *                         expenses and budgets, and for private groups.
 *   --password <pw>       The group's access password, if it has one.
 *   --admin-email <e>     Make this person a group admin (SmartSplit doesn't expose roles).
 *   --send-invites        Email an invite to members who don't have a FireTogether account yet.
 *   --replace             Delete a previous import of this group first.
 *   --dry-run             Fetch and verify only; write nothing.
 *
 * SmartSplit's own database isn't reachable, so this reads the same HTTP API
 * its web app uses. Field names below are SmartSplit's API shapes.
 */
import crypto from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  computeBalances,
  type LedgerExpense,
  type LedgerPayment,
} from "../src/lib/splitting.ts";

// ---------- SmartSplit API shapes ----------

type SsUser = { id: string; name: string; email: string | null; hasAccount: boolean };
type SsMember = { id: string; nickname: string; role: string; userId: string; banned: boolean; user: SsUser | null };
type SsGroup = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  currency: string;
  status: string;
  settlementReminderDays: number | null;
  settlementRemindersEnabled: boolean;
  simplifyDebts: boolean;
  requiresPassword: boolean;
};
type SsBootstrap = {
  group: SsGroup;
  members: SsMember[];
  requiresPassword?: boolean;
  dashboard: {
    balances: { userId: string; net: number }[];
    rateLock: { ratesToBase?: Record<string, number>; lockedAt?: string } | null;
  } | null;
};
type SsAssignment = { userId: string; share: string; amount: string };
type SsItem = {
  id: string;
  name: string;
  category: string | null;
  quantity: number;
  unitPrice: string;
  totalPrice: string;
  paidById: string | null;
  splitMethod: string;
  disputeStatus: string;
  disputeReason: string | null;
  disputedById: string | null;
  disputedAt: string | null;
  resolvedAt: string | null;
  assignments: SsAssignment[];
};
type SsReceipt = {
  id: string;
  merchant: string | null;
  receiptDate: string | null;
  receiptNumber: string | null;
  currency: string;
  gstPercent: string | null;
  serviceChargePercent: string | null;
  discount: string | null;
  total: string;
  category: string | null;
  imageUrl: string | null;
  imageContentType: string | null;
  contentHash: string | null;
  ocrRawText: string | null;
  parseStatus: string;
  parseNote: string | null;
  createdById: string | null;
  paidById: string | null;
  createdAt: string;
  items: SsItem[];
};
type SsPayment = {
  id: string;
  payerId: string;
  receiverId: string;
  amount: string;
  paidCurrency: string;
  status: string;
  proofUrl: string | null;
  approvedBy: string | null;
  recordedBy: string | null;
  note: string | null;
  createdAt: string;
  resolvedAt: string | null;
};
type SsActivity = { action: string; actorName: string; metadata: Record<string, unknown>; timestamp: string };
type SsComment = { body?: string; text?: string; userId?: string; authorId?: string; user?: { id: string }; createdAt?: string };

// ---------- CLI ----------

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      args[key.slice(2)] = next;
      i++;
    } else {
      args[key.slice(2)] = true;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const code = String(args.code ?? "").toUpperCase();
const source = String(args.source ?? "https://smartsplit.snorlab.site").replace(/\/$/, "");
const dryRun = Boolean(args["dry-run"]);
let cookie = typeof args.cookie === "string" ? args.cookie : "";

if (!code) {
  console.error("Usage: npm run import:smartsplit -- --code <GROUP_CODE> [options]");
  process.exit(1);
}

// ---------- SmartSplit fetching ----------

async function ss<T>(path: string, init: RequestInit = {}): Promise<{ status: number; body: T | null }> {
  const response = await fetch(`${source}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), ...(cookie ? { cookie } : {}), accept: "application/json" },
  });
  const setCookie = response.headers.getSetCookie?.() ?? [];
  if (setCookie.length) {
    const fresh = setCookie.map((c) => c.split(";")[0]).join("; ");
    cookie = cookie ? `${cookie}; ${fresh}` : fresh;
  }
  const body = (await response.json().catch(() => null)) as T | null;
  return { status: response.status, body };
}

async function fetchReceipts(): Promise<SsReceipt[]> {
  const seen = new Map<string, SsReceipt>();
  for (let page = 0; page < 50; page++) {
    const { body } = await ss<{ receipts: SsReceipt[]; hasMore: boolean }>(
      `/api/receipts/list?groupCode=${code}${page ? `&offset=${seen.size}&page=${page + 1}` : ""}`,
    );
    const before = seen.size;
    for (const receipt of body?.receipts ?? []) seen.set(receipt.id, receipt);
    if (!body?.hasMore || seen.size === before) break;
  }
  return [...seen.values()];
}

async function download(url: string): Promise<{ bytes: Buffer; contentType: string } | null> {
  const absolute = url.startsWith("http") ? url : `${source}${url}`;
  const response = await fetch(absolute, { headers: cookie ? { cookie } : {} });
  if (!response.ok) return null;
  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    contentType: response.headers.get("content-type")?.split(";")[0] ?? "image/jpeg",
  };
}

// ---------- Mapping helpers ----------

const num = (value: string | number | null | undefined) => (value == null || value === "" ? null : Number(value));
const lower = (value: string | null | undefined) => (value ?? "").toLowerCase();
const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

function mapParseStatus(status: string, hasImage: boolean) {
  const s = lower(status);
  if (["parsed", "verified", "manual", "failed"].includes(s)) return s;
  return hasImage ? "pending_ocr" : "failed";
}

function mapDispute(status: string) {
  const s = lower(status);
  return s === "none" || !s ? "none" : s.includes("resolv") ? "resolved" : "open";
}

function mapPeriod(period: string | undefined) {
  const p = lower(period);
  return p.startsWith("week") ? "weekly" : p.startsWith("month") ? "monthly" : "total";
}

async function findOrCreateUser(admin: SupabaseClient, email: string, name: string, invite: boolean) {
  const { data: existing } = await admin.from("users").select("id").ilike("email", email).maybeSingle();
  if (existing) return { id: existing.id as string, created: false };

  const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/callback?next=/groups`;
  const { data, error } = invite
    ? await admin.auth.admin.inviteUserByEmail(email, { data: { name }, redirectTo })
    : await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { name } });
  if (error || !data.user) throw new Error(`Could not create ${email}: ${error?.message}`);

  // The auth trigger normally creates the profile row; make sure it exists.
  await admin
    .from("users")
    .upsert({ id: data.user.id, email, name }, { onConflict: "id", ignoreDuplicates: true });
  return { id: data.user.id, created: true };
}

// ---------- Main ----------

async function main() {
  if (typeof args.password === "string") {
    const { status } = await ss(`/api/groups/${code}/verify-password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: args.password }),
    });
    if (status >= 400) throw new Error("SmartSplit rejected the group password.");
  }

  const { status, body: boot } = await ss<SsBootstrap>(`/api/groups/${code}/bootstrap?includeInsights=false`);
  if (!boot?.group) throw new Error(`Group ${code} not found on SmartSplit (HTTP ${status}).`);
  if (boot.requiresPassword) throw new Error("This group is password protected. Pass --password.");

  const [receipts, payments, activity, recurring, budgets] = await Promise.all([
    fetchReceipts(),
    ss<{ payments: SsPayment[] }>(`/api/payments?groupCode=${code}`).then((r) => r.body?.payments ?? []),
    ss<{ entries: SsActivity[] }>(`/api/activity?groupCode=${code}`).then((r) => r.body?.entries ?? []),
    ss<{ recurring: Record<string, unknown>[] }>(`/api/recurring?groupCode=${code}`).then((r) => r.body?.recurring ?? null),
    ss<{ budgets: Record<string, unknown>[] }>(`/api/budgets?groupCode=${code}`).then((r) => r.body?.budgets ?? null),
  ]);
  const comments = new Map<string, SsComment[]>();
  for (const receipt of receipts) {
    const { body } = await ss<{ comments: SsComment[] }>(`/api/receipts/${receipt.id}/comments`);
    if (body?.comments?.length) comments.set(receipt.id, body.comments);
  }

  console.log(
    `SmartSplit "${boot.group.name}": ${boot.members.length} members, ${receipts.length} receipts, ` +
      `${payments.length} payments, ${activity.length} activity entries` +
      `${recurring ? `, ${recurring.length} recurring` : ""}${budgets ? `, ${budgets.length} budgets` : ""}.`,
  );
  if (!recurring || !budgets) console.log("  (recurring expenses and budgets need --cookie; skipped)");

  // SmartSplit keys assignments and payments by user id (placeholders have users too).
  const memberIdByUserId = new Map<string, string>();
  boot.members.forEach((m) => memberIdByUserId.set(m.userId, crypto.randomUUID()));
  const mapUser = (userId: string | null | undefined) => (userId ? memberIdByUserId.get(userId) ?? null : null);

  const groupId = crypto.randomUUID();
  const expenseIdByReceipt = new Map<string, string>();
  receipts.forEach((r) => expenseIdByReceipt.set(r.id, crypto.randomUUID()));

  // ----- Verify: our engine on the mapped data must reproduce SmartSplit's balances -----
  const ledgerExpenses: LedgerExpense[] = receipts
    .filter((r) => !["pending_ocr", "processing"].includes(lower(r.parseStatus)))
    .map((r) => {
      const payer = mapUser(r.paidById ?? r.items.find((i) => i.paidById)?.paidById);
      return {
        id: expenseIdByReceipt.get(r.id)!,
        date: (r.receiptDate ?? r.createdAt).slice(0, 10),
        currency: r.currency,
        total: Number(r.total),
        category: r.category ?? "Miscellaneous",
        paidByMemberId: payer,
        items: r.items.map((item) => ({
          id: item.id,
          paidByMemberId: mapUser(item.paidById),
          category: item.category,
          assignments: item.assignments.map((a) => ({ memberId: mapUser(a.userId)!, amount: Number(a.amount) })),
        })),
      };
    });
  const ledgerPayments: LedgerPayment[] = payments.map((p) => ({
    id: p.id,
    payerMemberId: mapUser(p.payerId)!,
    receiverMemberId: mapUser(p.receiverId)!,
    amount: Number(p.amount),
    currency: p.paidCurrency,
    status: lower(p.status) as LedgerPayment["status"],
    createdAt: p.createdAt,
  }));

  const baseCurrency = boot.group.currency;
  const ratesToBase = boot.dashboard?.rateLock?.ratesToBase ?? null;
  const rates: Record<string, number> = {};
  if (ratesToBase?.[baseCurrency]) {
    for (const [currency, value] of Object.entries(ratesToBase)) {
      if (currency !== baseCurrency && value > 0) rates[currency] = value / ratesToBase[baseCurrency];
    }
  }

  const ours = computeBalances(ledgerExpenses, ledgerPayments, { baseCurrency, rates, convert: true })[baseCurrency] ?? {};
  let mismatches = 0;
  for (const { userId, net } of boot.dashboard?.balances ?? []) {
    const mine = ours[mapUser(userId) ?? ""] ?? 0;
    if (Math.abs(mine - net) > 0.01) {
      mismatches++;
      const who = boot.members.find((m) => m.userId === userId)?.nickname ?? userId;
      console.warn(`  balance mismatch for ${who}: SmartSplit ${net}, FireTogether ${mine}`);
    }
  }
  console.log(mismatches ? `Verification: ${mismatches} balance mismatch(es).` : "Verification: balances match SmartSplit exactly.");
  if (dryRun) {
    process.exit(mismatches ? 1 : 0);
  }

  // ----- Write -----
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (use --env-file).");
  const admin = createClient(url, key, { auth: { persistSession: false } });
  const check = (label: string, error: { message: string } | null) => {
    if (error) throw new Error(`${label}: ${error.message}`);
  };

  const { data: previous } = await admin
    .from("split_groups")
    .select("id, code")
    .eq("legacy_source", "smartsplit")
    .eq("legacy_id", boot.group.id)
    .maybeSingle();
  if (previous && !args.replace) {
    throw new Error(`Already imported as /groups/${previous.code}. Pass --replace to import again.`);
  }
  if (previous) check("delete previous import", (await admin.from("split_groups").delete().eq("id", previous.id)).error);

  // Accounts: registered SmartSplit users become FireTogether users (matched by email).
  const userIdByMember = new Map<string, string>();
  let createdUsers = 0;
  for (const member of boot.members) {
    const email = member.user?.hasAccount ? member.user.email : null;
    if (!email || member.banned) continue;
    const { id, created } = await findOrCreateUser(admin, email, member.user?.name ?? member.nickname, Boolean(args["send-invites"]));
    userIdByMember.set(member.userId, id);
    if (created) createdUsers++;
  }

  const { data: codeTaken } = await admin.from("split_groups").select("id").eq("code", code).maybeSingle();
  const newCode = codeTaken ? `${code}${crypto.randomBytes(1).toString("hex").toUpperCase()}` : code;

  check(
    "insert group",
    (
      await admin.from("split_groups").insert({
        id: groupId,
        code: newCode,
        name: boot.group.name,
        description: boot.group.description,
        base_currency: baseCurrency,
        simplify_debts: boot.group.simplifyDebts,
        reminders_enabled: boot.group.settlementRemindersEnabled,
        reminder_days: boot.group.settlementReminderDays || 7,
        status: lower(boot.group.status) === "archived" ? "archived" : "active",
        legacy_source: "smartsplit",
        legacy_id: boot.group.id,
      })
    ).error,
  );

  const adminEmail = typeof args["admin-email"] === "string" ? args["admin-email"].toLowerCase() : null;
  const firstRegistered = boot.members.find((m) => userIdByMember.has(m.userId))?.userId;
  check(
    "insert members",
    (
      await admin.from("group_members").insert(
        boot.members.map((m) => {
          const isAdmin =
            lower(m.role) === "admin" ||
            (adminEmail ? lower(m.user?.email) === adminEmail : m.userId === firstRegistered);
          return {
            id: memberIdByUserId.get(m.userId),
            group_id: groupId,
            user_id: userIdByMember.get(m.userId) ?? null,
            nickname: m.nickname,
            role: isAdmin && userIdByMember.has(m.userId) ? "admin" : "member",
            banned: m.banned,
            removed_at: m.banned ? new Date().toISOString() : null,
            legacy_id: m.id,
          };
        }),
      )
    ).error,
  );

  let copiedImages = 0;
  for (const receipt of receipts) {
    const expenseId = expenseIdByReceipt.get(receipt.id)!;
    let receiptPath: string | null = null;
    let contentType: string | null = receipt.imageContentType;
    if (receipt.imageUrl) {
      const file = await download(receipt.imageUrl);
      if (file) {
        contentType = file.contentType;
        receiptPath = `${groupId}/${crypto.randomUUID()}.${EXTENSIONS[file.contentType] ?? "jpg"}`;
        const { error } = await admin.storage.from("receipts").upload(receiptPath, file.bytes, { contentType: file.contentType });
        if (error) {
          console.warn(`  could not copy image for ${receipt.merchant ?? receipt.id}: ${error.message}`);
          receiptPath = null;
        } else {
          copiedImages++;
        }
      }
    }

    const payer = mapUser(receipt.paidById ?? receipt.items.find((i) => i.paidById)?.paidById);
    check(
      "insert expense",
      (
        await admin.from("group_expenses").insert({
          id: expenseId,
          group_id: groupId,
          paid_by_member_id: payer,
          created_by_member_id: mapUser(receipt.createdById),
          kind: lower(receipt.parseStatus) === "manual" ? "manual" : "receipt",
          merchant: receipt.merchant,
          expense_date: (receipt.receiptDate ?? receipt.createdAt).slice(0, 10),
          receipt_number: receipt.receiptNumber,
          currency: receipt.currency,
          service_charge_percent: num(receipt.serviceChargePercent),
          tax_percent: num(receipt.gstPercent),
          discount: num(receipt.discount) ?? 0,
          total: Number(receipt.total),
          category: receipt.category ?? "Miscellaneous",
          receipt_path: receiptPath,
          receipt_content_type: receiptPath ? contentType : null,
          content_hash: receipt.contentHash,
          parse_status: mapParseStatus(receipt.parseStatus, Boolean(receiptPath)),
          parse_note: receipt.parseNote,
          ocr_raw_text: receipt.ocrRawText,
          legacy_id: receipt.id,
          created_at: receipt.createdAt,
        })
      ).error,
    );

    for (const [index, item] of receipt.items.entries()) {
      const itemId = crypto.randomUUID();
      const itemPayer = mapUser(item.paidById);
      check(
        "insert item",
        (
          await admin.from("group_expense_items").insert({
            id: itemId,
            expense_id: expenseId,
            group_id: groupId,
            paid_by_member_id: itemPayer && itemPayer !== payer ? itemPayer : null,
            name: item.name,
            quantity: item.quantity || 1,
            unit_price: Number(item.unitPrice),
            line_total: Number(item.totalPrice),
            category: item.category && item.category !== receipt.category ? item.category : null,
            split_method: ["equal", "percentage", "custom"].includes(lower(item.splitMethod)) ? lower(item.splitMethod) : "equal",
            dispute_status: mapDispute(item.disputeStatus),
            dispute_reason: item.disputeReason,
            disputed_by_member_id: mapUser(item.disputedById),
            disputed_at: item.disputedAt,
            resolved_at: item.resolvedAt,
            sort_order: index,
          })
        ).error,
      );
      if (item.assignments.length) {
        check(
          "insert assignments",
          (
            await admin.from("item_assignments").insert(
              item.assignments.map((a) => ({
                item_id: itemId,
                member_id: mapUser(a.userId),
                group_id: groupId,
                share: Number(a.share),
                amount: Number(a.amount),
              })),
            )
          ).error,
        );
      }
    }

    for (const comment of comments.get(receipt.id) ?? []) {
      const body = comment.body ?? comment.text;
      if (!body) continue;
      await admin.from("group_comments").insert({
        group_id: groupId,
        expense_id: expenseId,
        member_id: mapUser(comment.userId ?? comment.authorId ?? comment.user?.id),
        body,
        created_at: comment.createdAt ?? receipt.createdAt,
      });
    }
  }

  if (payments.length) {
    const rows = [];
    for (const p of payments) {
      let proofPath: string | null = null;
      if (p.proofUrl) {
        const file = await download(p.proofUrl);
        if (file) {
          proofPath = `${groupId}/${crypto.randomUUID()}.${EXTENSIONS[file.contentType] ?? "jpg"}`;
          const { error } = await admin.storage.from("receipts").upload(proofPath, file.bytes, { contentType: file.contentType });
          if (error) proofPath = null;
        }
      }
      rows.push({
        group_id: groupId,
        payer_member_id: mapUser(p.payerId),
        receiver_member_id: mapUser(p.receiverId),
        amount: Number(p.amount),
        currency: p.paidCurrency,
        status: ["pending", "approved", "rejected"].includes(lower(p.status)) ? lower(p.status) : "pending",
        note: p.note,
        proof_path: proofPath,
        recorded_by_member_id: mapUser(p.recordedBy),
        approved_by_member_id: mapUser(p.approvedBy),
        resolved_at: p.resolvedAt,
        legacy_id: p.id,
        created_at: p.createdAt,
      });
    }
    check("insert payments", (await admin.from("group_payments").insert(rows)).error);
  }

  if (Object.keys(rates).length) {
    check(
      "insert rates",
      (
        await admin.from("group_fx_rates").insert(
          Object.entries(rates).map(([currency, rate]) => ({
            group_id: groupId,
            currency,
            rate_to_base: rate,
            locked_at: boot.dashboard?.rateLock?.lockedAt ?? new Date().toISOString(),
          })),
        )
      ).error,
    );
  }

  if (activity.length) {
    const remap = (metadata: Record<string, unknown>) => {
      const out = { ...metadata };
      if (typeof out.receiptId === "string") out.receiptId = expenseIdByReceipt.get(out.receiptId) ?? null;
      return out;
    };
    check(
      "insert activity",
      (
        await admin.from("group_activity").insert(
          activity.map((entry) => ({
            group_id: groupId,
            actor_name: entry.actorName || "SmartSplit",
            action: entry.action,
            metadata: remap(entry.metadata ?? {}),
            created_at: entry.timestamp,
          })),
        )
      ).error,
    );
  }
  await admin.from("group_activity").insert({
    group_id: groupId,
    actor_name: "System",
    action: "IMPORTED_FROM_SMARTSPLIT",
    metadata: { code, source },
  });

  for (const r of recurring ?? []) {
    const frequency = lower(String(r.frequency ?? "monthly"));
    await admin.from("scheduled_transactions").insert({
      couple_id: null,
      group_id: groupId,
      group_paid_by_member_id: mapUser(r.paidById as string),
      group_category: (r.category as string) ?? "Bills & Utilities",
      amount: Number(r.amount),
      currency: (r.currency as string) ?? baseCurrency,
      description: (r.name as string) ?? "Recurring expense",
      split_type: "shared",
      frequency: ["weekly", "monthly", "yearly"].includes(frequency) ? frequency : "monthly",
      frequency_interval: 1,
      next_date: String(r.nextDate ?? r.nextRunAt ?? r.startDate ?? new Date().toISOString()).slice(0, 10),
      end_date: r.endDate ? String(r.endDate).slice(0, 10) : null,
      is_active: r.isActive !== false && r.active !== false,
    });
  }

  for (const b of budgets ?? []) {
    await admin.from("group_budgets").insert({
      group_id: groupId,
      category: (b.category as string) || null,
      amount: Number(b.amount),
      period: mapPeriod(b.period as string),
      alert_threshold: Math.min(100, Math.max(1, Number(b.alertThreshold ?? 80))),
    });
  }

  console.log(
    `Imported into /groups/${newCode}: ${userIdByMember.size} linked accounts (${createdUsers} new), ` +
      `${receipts.length} expenses, ${copiedImages} receipt images, ${payments.length} payments.`,
  );
  if (boot.group.requiresPassword) {
    console.log("  SmartSplit password hashes can't be migrated — set a new access password in the group's Settings.");
  }
  console.log("  Each member's budget and IOU account sync the first time they open the group.");
  process.exit(mismatches ? 1 : 0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
