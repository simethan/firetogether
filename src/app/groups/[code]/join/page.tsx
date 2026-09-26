import { notFound, redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Banners, MemberAvatar } from "@/components/groups/shared";
import { getGroupContext, groupPath } from "@/lib/groups/server";
import { claimMemberAction, joinGroupAction } from "../../actions";

export default async function JoinGroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { code } = await params;
  const { error } = await searchParams;
  const context = await getGroupContext(code);
  if (!context) notFound();

  const { group, me, authUserId, isBanned, canView, admin } = context;
  const joinPath = groupPath(group.code, "/join");
  if (!authUserId) redirect(`/login?next=${encodeURIComponent(joinPath)}`);
  if (me) redirect(groupPath(group.code));
  if (!canView) redirect(groupPath(group.code));

  const { data: user } = await admin.from("users").select("name").eq("id", authUserId).maybeSingle();
  const unclaimed = context.members.filter((m) => !m.user_id);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-lg flex-col justify-center gap-5 px-4 py-12">
      <Banners error={error} />
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-semibold">Join {group.name}</CardTitle>
          <CardDescription>
            {isBanned
              ? "You've been removed from this group. Ask an admin if this is a mistake."
              : unclaimed.length
                ? "See your name in the list? Claim it so items already tagged to you count toward your balance."
                : "Pick the name everyone will see."}
          </CardDescription>
        </CardHeader>
        {!isBanned ? (
          <CardContent className="space-y-6">
            {unclaimed.length ? (
              <div className="space-y-2">
                {unclaimed.map((member) => (
                  <form
                    key={member.id}
                    action={claimMemberAction}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-muted/20 px-4 py-3"
                  >
                    <input type="hidden" name="code" value={group.code} />
                    <input type="hidden" name="member_id" value={member.id} />
                    <span className="flex items-center gap-3 font-medium text-foreground">
                      <MemberAvatar name={member.nickname} />
                      {member.nickname}
                    </span>
                    <Button type="submit" variant="outline" size="sm">
                      This is me
                    </Button>
                  </form>
                ))}
              </div>
            ) : null}

            <form action={joinGroupAction} className="space-y-3">
              <input type="hidden" name="code" value={group.code} />
              <Label htmlFor="nickname">{unclaimed.length ? "I'm not on the list" : "Your name"}</Label>
              <div className="flex gap-2">
                <Input id="nickname" name="nickname" defaultValue={user?.name ?? ""} required />
                <Button type="submit">Join group</Button>
              </div>
            </form>
          </CardContent>
        ) : null}
      </Card>
    </div>
  );
}
