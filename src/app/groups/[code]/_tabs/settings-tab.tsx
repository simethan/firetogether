import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MemberAvatar, formatDay, selectClass } from "@/components/groups/shared";
import type { GroupContext, GroupData } from "@/lib/groups/server";
import { SUPPORTED_CURRENCIES } from "@/lib/groups/types";
import { missingRates } from "@/lib/splitting";
import {
  addPersonAction,
  deleteGroupAction,
  leaveGroupAction,
  removeMemberAction,
  renameMemberAction,
  setMemberRoleAction,
  updateBudgetSyncAction,
  updateGroupSettingsAction,
} from "../../actions";
import { lockRatesAction, setRateAction } from "../settle-actions";

export async function SettingsTab({ context, data }: { context: GroupContext; data: GroupData }) {
  const { group, members, me, isAdmin, admin, authUserId } = context;
  if (!me || !authUserId) return null;

  const { data: user } = await admin.from("users").select("couple_id").eq("id", authUserId).maybeSingle();
  const [{ data: budgetCategories }, { data: mappings }] = await Promise.all([
    user?.couple_id
      ? admin.from("categories").select("id, name").eq("couple_id", user.couple_id).order("name")
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    admin.from("group_category_map").select("group_category, category_id").eq("user_id", authUserId),
  ]);
  const mappingByCategory = new Map(
    (mappings ?? []).map((m: { group_category: string; category_id: string }) => [m.group_category, m.category_id]),
  );
  const groupCategories = [
    ...new Set([...data.expenses.map((e) => e.category), ...data.items.map((i) => i.category).filter(Boolean)]),
  ].sort() as string[];

  const currencies = [...new Set([...data.expenses.map((e) => e.currency), ...data.payments.map((p) => p.currency)])]
    .filter((c) => c !== group.base_currency)
    .sort();
  const missing = missingRates(data.ledgerExpenses, data.ledgerPayments, data.options);

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-semibold">People</CardTitle>
          <CardDescription>Names without an account can be claimed by whoever joins with the invite link.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {members.map((member) => {
            const canRename = isAdmin || member.id === me.id;
            return (
              <div key={member.id} className="space-y-3 rounded-2xl border border-border bg-muted/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-3 font-medium text-foreground">
                    <MemberAvatar name={member.nickname} />
                    {member.nickname}
                    {member.id === me.id ? <span className="text-xs text-muted-foreground">(you)</span> : null}
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    {member.role === "admin" ? <Badge variant="secondary">Admin</Badge> : null}
                    <Badge variant="outline">{member.user_id ? "Registered" : "Not claimed"}</Badge>
                  </span>
                </div>
                {canRename ? (
                  <form action={renameMemberAction} className="flex gap-2">
                    <input type="hidden" name="code" value={group.code} />
                    <input type="hidden" name="member_id" value={member.id} />
                    <Input name="nickname" defaultValue={member.nickname} aria-label={`Rename ${member.nickname}`} />
                    <Button type="submit" variant="outline">
                      Rename
                    </Button>
                  </form>
                ) : null}
                {isAdmin && member.id !== me.id ? (
                  <div className="flex flex-wrap gap-2">
                    {member.user_id ? (
                      <form action={setMemberRoleAction}>
                        <input type="hidden" name="code" value={group.code} />
                        <input type="hidden" name="member_id" value={member.id} />
                        <input type="hidden" name="role" value={member.role === "admin" ? "member" : "admin"} />
                        <Button type="submit" variant="ghost" size="sm">
                          {member.role === "admin" ? "Remove admin" : "Make admin"}
                        </Button>
                      </form>
                    ) : null}
                    <form action={removeMemberAction}>
                      <input type="hidden" name="code" value={group.code} />
                      <input type="hidden" name="member_id" value={member.id} />
                      <Button type="submit" variant="ghost" size="sm">
                        Remove from group
                      </Button>
                    </form>
                    {member.user_id ? (
                      <form action={removeMemberAction}>
                        <input type="hidden" name="code" value={group.code} />
                        <input type="hidden" name="member_id" value={member.id} />
                        <input type="hidden" name="ban" value="true" />
                        <Button type="submit" variant="destructive" size="sm">
                          Ban
                        </Button>
                      </form>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground">
            Removing someone keeps their items and payments on a &ldquo;Former member&rdquo; placeholder so balances stay
            correct. Banning also stops them rejoining.
          </p>
          <form action={addPersonAction} className="flex gap-2 pt-2">
            <input type="hidden" name="code" value={group.code} />
            <Input name="nickname" placeholder="Add a person" required />
            <Button type="submit">Add</Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-semibold">Budget sync</CardTitle>
            <CardDescription>
              Your share of each expense is added to your budget as a personal expense, and your group balance shows up in
              Net Worth as an IOU account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {user?.couple_id ? (
              <form action={updateBudgetSyncAction} className="grid gap-4">
                <input type="hidden" name="code" value={group.code} />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="sync_to_budget" defaultChecked={me.sync_to_budget} />
                  Sync my share to my budget
                </label>
                {groupCategories.length ? (
                  <div className="grid gap-3">
                    <p className="text-xs text-muted-foreground">
                      Map group categories to your budget categories. Unmapped ones use a category with the same name,
                      then &ldquo;Other&rdquo;.
                    </p>
                    {groupCategories.map((category) => (
                      <div key={category} className="grid grid-cols-[1fr_1fr] items-center gap-3">
                        <Label htmlFor={`map-${category}`} className="text-sm">
                          {category}
                        </Label>
                        <select
                          id={`map-${category}`}
                          name={`map:${category}`}
                          defaultValue={mappingByCategory.get(category) ?? ""}
                          className={selectClass}
                        >
                          <option value="">Automatic</option>
                          {(budgetCategories ?? []).map((c: { id: string; name: string }) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                ) : null}
                <Button type="submit" className="w-full sm:w-fit">
                  Save budget sync
                </Button>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">
                Set up your budget first (Dashboard → onboarding) to sync your group spending.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-semibold">Conversion rates</CardTitle>
            <CardDescription>
              Every balance, settlement and payment in this group is calculated at these rates (1 unit = X{" "}
              {group.base_currency}).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {missing.length ? (
              <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
                No rate yet for {missing.join(", ")} — those amounts stay in their own currency.
              </p>
            ) : null}
            {currencies.length ? (
              currencies.map((currency) => {
                const rate = data.rates.find((r) => r.currency === currency);
                return (
                  <form key={currency} action={setRateAction} className="flex items-center gap-2">
                    <input type="hidden" name="code" value={group.code} />
                    <input type="hidden" name="currency" value={currency} />
                    <span className="w-14 text-sm font-medium">{currency}</span>
                    <Input
                      name="rate"
                      type="number"
                      step="0.00000001"
                      min="0"
                      defaultValue={rate ? String(rate.rate_to_base) : ""}
                      disabled={!isAdmin}
                      aria-label={`${currency} rate`}
                    />
                    {rate ? (
                      <span className="hidden text-xs text-muted-foreground sm:inline">{formatDay(rate.locked_at)}</span>
                    ) : null}
                    {isAdmin ? (
                      <Button type="submit" variant="outline" size="sm">
                        Save
                      </Button>
                    ) : null}
                  </form>
                );
              })
            ) : (
              <p className="text-sm text-muted-foreground">This group has no other currencies to set rates for.</p>
            )}
            {isAdmin && currencies.length ? (
              <form action={lockRatesAction}>
                <input type="hidden" name="code" value={group.code} />
                <Button type="submit" variant="secondary">
                  Lock today&apos;s rates
                </Button>
              </form>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl font-semibold">Admin settings</CardTitle>
            <CardDescription>Only group admins can change these.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={updateGroupSettingsAction} className="grid gap-4">
              <input type="hidden" name="code" value={group.code} />
              <div className="space-y-2">
                <Label htmlFor="group-name">Name</Label>
                <Input id="group-name" name="name" defaultValue={group.name} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="group-description">Description</Label>
                <Input id="group-description" name="description" defaultValue={group.description ?? ""} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="group-currency">Group currency</Label>
                  <select id="group-currency" name="base_currency" defaultValue={group.base_currency} className={selectClass}>
                    {SUPPORTED_CURRENCIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reminder-days">Reminder frequency (days)</Label>
                  <Input id="reminder-days" name="reminder_days" type="number" min="1" defaultValue={group.reminder_days} />
                </div>
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="simplify_debts" defaultChecked={group.simplify_debts} className="mt-1" />
                <span>
                  <span className="font-medium">Simplified payments</span>
                  <span className="block text-muted-foreground">
                    Fewer transactions to make, same total owed. Off shows every individual debt.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="convert_balances" defaultChecked={group.convert_balances} className="mt-1" />
                <span>
                  <span className="font-medium">Convert all balances to {group.base_currency}</span>
                  <span className="block text-muted-foreground">
                    Off tracks each expense in its original currency (a SGD dinner and a USD coffee stay separate).
                  </span>
                </span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="reminders_enabled" defaultChecked={group.reminders_enabled} />
                Settlement reminders
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="archived" defaultChecked={group.status === "archived"} />
                Archive group (read-only for new joiners)
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="group-password">{group.password_hash ? "New access password" : "Access password"}</Label>
                  <Input id="group-password" name="password" type="password" autoComplete="new-password" />
                </div>
                {group.password_hash ? (
                  <label className="flex items-end gap-2 pb-2 text-sm">
                    <input type="checkbox" name="clear_password" value="true" />
                    Remove password
                  </label>
                ) : null}
              </div>
              <Button type="submit" className="w-full sm:w-fit">
                Save settings
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-xl font-semibold">Leave or delete</CardTitle>
          <CardDescription>Leaving keeps your history in the group under a placeholder.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form action={leaveGroupAction}>
            <input type="hidden" name="code" value={group.code} />
            <Button type="submit" variant="outline">
              Leave group
            </Button>
          </form>
          {isAdmin ? (
            <form action={deleteGroupAction} className="flex flex-wrap gap-2">
              <input type="hidden" name="code" value={group.code} />
              <Input name="confirm" placeholder={`Type ${group.code} to delete`} className="max-w-56" />
              <Button type="submit" variant="destructive">
                Delete group
              </Button>
            </form>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
