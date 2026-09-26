"use server";

import { redirect } from "next/navigation";

import { parseAmount, parseNumber, parseString } from "@/lib/actions";
import { scheduleGroupSync } from "@/lib/groups/bridge";
import { fetchRatesToBase } from "@/lib/groups/fx";
import { RECEIPT_BUCKET } from "@/lib/groups/receipts";
import {
  groupPath,
  logActivity,
  memberName,
  PAYMENT_COLUMNS,
  requireGroupMember,
  withError,
  withNotice,
} from "@/lib/groups/server";
import { SUPPORTED_CURRENCIES, type GroupPayment } from "@/lib/groups/types";
import { round2 } from "@/lib/splitting";

export async function recordPaymentAction(formData: FormData) {
  const code = String(formData.get("code") ?? "");
  const { admin, group, me, isAdmin, members } = await requireGroupMember(code);
  const back = groupPath(group.code, "?tab=balances");

  const payerId = parseString(formData.get("payer_id")) ?? me.id;
  const receiverId = parseString(formData.get("receiver_id"));
  const amount = parseAmount(formData.get("amount"));
  const currencyInput = parseString(formData.get("currency"))?.toUpperCase();
  const currency =
    currencyInput && (SUPPORTED_CURRENCIES as readonly string[]).includes(currencyInput) ? currencyInput : group.base_currency;
  const note = parseString(formData.get("note"));
  const markSettled = formData.get("mark_settled") === "true";

  if (!amount || amount <= 0) redirect(withError(back, "Enter an amount greater than 0."));
  if (!members.some((m) => m.id === payerId) || !members.some((m) => m.id === receiverId)) {
    redirect(withError(back, "Choose who paid and who received."));
  }
  if (payerId === receiverId) redirect(withError(back, "Payer and receiver must be different people."));
  if (payerId !== me.id && receiverId !== me.id && !isAdmin) {
    redirect(withError(back, "Only admins can record payments between other people."));
  }

  // The receiver confirming, or an admin marking it settled, needs no approval.
  const approved = receiverId === me.id || (isAdmin && markSettled);
  const { data: payment, error } = await admin
    .from("group_payments")
    .insert({
      group_id: group.id,
      payer_member_id: payerId,
      receiver_member_id: receiverId,
      amount: round2(amount),
      currency,
      note,
      status: approved ? "approved" : "pending",
      recorded_by_member_id: me.id,
      approved_by_member_id: approved ? me.id : null,
      resolved_at: approved ? new Date().toISOString() : null,
    })
    .select("id")
    .single();
  if (error || !payment) redirect(withError(back, error?.message ?? "Could not record the payment."));

  await logActivity(admin, group.id, me, approved ? "PAYMENT_RECORDED_SETTLED" : "PAYMENT_RECORDED", {
    paymentId: payment.id,
    amount: round2(amount),
    currency,
    payerId,
    receiverId,
    payerName: memberName(members, payerId),
    receiverName: memberName(members, receiverId),
    byAdmin: isAdmin && payerId !== me.id && receiverId !== me.id,
  });
  if (approved) scheduleGroupSync(admin, group.id);

  redirect(
    withNotice(
      back,
      approved ? "Payment recorded." : `Payment recorded — waiting for ${memberName(members, receiverId)} to approve.`,
    ),
  );
}

async function loadPayment(code: string, formData: FormData) {
  const context = await requireGroupMember(code);
  const paymentId = parseString(formData.get("payment_id"));
  const { data } = await context.admin
    .from("group_payments")
    .select(PAYMENT_COLUMNS)
    .eq("id", paymentId)
    .eq("group_id", context.group.id)
    .maybeSingle();
  const back = groupPath(context.group.code, "?tab=balances");
  if (!data) redirect(withError(back, "Payment not found."));
  return { ...context, payment: data as GroupPayment, back };
}

export async function resolvePaymentAction(formData: FormData) {
  const code = String(formData.get("code") ?? "");
  const decision = formData.get("decision") === "reject" ? "rejected" : "approved";
  const { admin, group, me, isAdmin, payment, back, allMembers } = await loadPayment(code, formData);

  if (payment.status !== "pending") redirect(withError(back, "This payment was already handled."));
  if (payment.receiver_member_id !== me.id && !isAdmin) {
    redirect(withError(back, "Only the receiver or an admin can approve this."));
  }

  await admin
    .from("group_payments")
    .update({ status: decision, approved_by_member_id: me.id, resolved_at: new Date().toISOString() })
    .eq("id", payment.id);
  await logActivity(admin, group.id, me, decision === "approved" ? "PAYMENT_APPROVED" : "PAYMENT_REJECTED", {
    paymentId: payment.id,
    amount: payment.amount,
    currency: payment.currency,
    payerName: memberName(allMembers, payment.payer_member_id),
  });
  if (decision === "approved") scheduleGroupSync(admin, group.id);
  redirect(withNotice(back, decision === "approved" ? "Payment approved." : "Payment rejected."));
}

export async function deletePaymentAction(formData: FormData) {
  const code = String(formData.get("code") ?? "");
  const { admin, group, me, isAdmin, payment, back } = await loadPayment(code, formData);

  const involved = [payment.payer_member_id, payment.recorded_by_member_id].includes(me.id);
  if (!involved && !isAdmin) redirect(withError(back, "Only the payer, the recorder or an admin can delete this."));

  if (payment.proof_path) await admin.storage.from(RECEIPT_BUCKET).remove([payment.proof_path]);
  await admin.from("group_payments").delete().eq("id", payment.id);
  await logActivity(admin, group.id, me, "PAYMENT_DELETED", {
    paymentId: payment.id,
    amount: payment.amount,
    currency: payment.currency,
  });
  scheduleGroupSync(admin, group.id);
  redirect(withNotice(back, "Payment deleted."));
}

export async function lockRatesAction(formData: FormData) {
  const code = String(formData.get("code") ?? "");
  const { admin, group, me } = await requireGroupMember(code, { admin: true });
  const back = groupPath(group.code, "?tab=settings");

  const [{ data: expenseCurrencies }, { data: paymentCurrencies }] = await Promise.all([
    admin.from("group_expenses").select("currency").eq("group_id", group.id),
    admin.from("group_payments").select("currency").eq("group_id", group.id),
  ]);
  const currencies = [
    ...new Set([...(expenseCurrencies ?? []), ...(paymentCurrencies ?? [])].map((r: { currency: string }) => r.currency)),
  ].filter((c) => c !== group.base_currency);
  if (!currencies.length) redirect(withNotice(back, "Only one currency in this group — nothing to lock."));

  const rates = await fetchRatesToBase(group.base_currency, currencies);
  const rows = Object.entries(rates).map(([currency, rate]) => ({
    group_id: group.id,
    currency,
    rate_to_base: rate,
    locked_at: new Date().toISOString(),
  }));
  if (!rows.length) redirect(withError(back, "Couldn't fetch rates right now. Enter them manually."));

  await admin.from("group_fx_rates").upsert(rows, { onConflict: "group_id,currency" });
  await logActivity(admin, group.id, me, "RATES_LOCKED", { currencies: rows.map((r) => r.currency) });
  scheduleGroupSync(admin, group.id);

  const missing = currencies.filter((c) => rates[c] == null);
  redirect(
    missing.length
      ? withError(back, `Locked ${rows.length} rate(s); couldn't fetch ${missing.join(", ")}.`)
      : withNotice(back, "Rates locked."),
  );
}

export async function setRateAction(formData: FormData) {
  const code = String(formData.get("code") ?? "");
  const { admin, group, me } = await requireGroupMember(code, { admin: true });
  const back = groupPath(group.code, "?tab=settings");
  const currency = parseString(formData.get("currency"))?.toUpperCase();
  const rate = parseNumber(formData.get("rate"));

  if (!currency || currency === group.base_currency) redirect(withError(back, "Choose a currency."));
  if (rate == null || rate <= 0) {
    await admin.from("group_fx_rates").delete().eq("group_id", group.id).eq("currency", currency);
  } else {
    await admin
      .from("group_fx_rates")
      .upsert(
        { group_id: group.id, currency, rate_to_base: rate, locked_at: new Date().toISOString() },
        { onConflict: "group_id,currency" },
      );
  }
  await logActivity(admin, group.id, me, "RATE_EDITED", { currency, rate });
  scheduleGroupSync(admin, group.id);
  redirect(withNotice(back, `${currency} rate saved.`));
}
