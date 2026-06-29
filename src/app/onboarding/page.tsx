import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createServiceClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { generateInviteCode, generateShortcutToken, getAuthUserId } from "@/lib/auth";

async function saveOnboarding(formData: FormData) {
  "use server";

  const mode = String(formData.get("mode") ?? "create");
  const name = String(formData.get("name") ?? "").trim();
  const inviteCode = String(formData.get("invite_code") ?? "").trim().toUpperCase();

  if (!name) {
    redirect("/onboarding?error=name_required");
  }

  const authUserId = await getAuthUserId();

  if (!authUserId) {
    redirect("/login");
  }

  const admin = createServiceClient();
  const { data: existingUser } = await admin.from("users").select("id, couple_id, shortcut_token").eq("id", authUserId).maybeSingle();

  if (existingUser?.couple_id) {
    redirect("/dashboard");
  }

  let coupleId = existingUser?.couple_id ?? null;
  let createdInviteCode: string | null = null;

  if (mode === "create") {
    const code = generateInviteCode();
    const { data: couple, error } = await admin
      .from("couples")
      .insert({ invite_code: code })
      .select("id, invite_code")
      .single();

    if (error) {
      redirect(`/onboarding?error=${encodeURIComponent(error.message)}`);
    }

    coupleId = couple.id;
    createdInviteCode = couple.invite_code;
  } else {
    if (!inviteCode) {
      redirect("/onboarding?error=invite_required");
    }

    const { data: couple } = await admin.from("couples").select("id, invite_code").eq("invite_code", inviteCode).maybeSingle();

    if (!couple) {
      redirect("/onboarding?error=invite_not_found");
    }

    coupleId = couple.id;
    createdInviteCode = couple.invite_code;
  }

  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();

  if (!authData.user?.email) {
    redirect("/login");
  }

  const { error: userError } = await admin.from("users").upsert(
    {
      id: authUserId,
      couple_id: coupleId,
      email: authData.user.email,
      shortcut_token: existingUser?.shortcut_token ?? generateShortcutToken(),
      name,
    },
    { onConflict: "id" }
  );

  if (userError) {
    redirect(`/onboarding?error=${encodeURIComponent(userError.message)}`);
  }

  redirect(`/dashboard?invite=${encodeURIComponent(createdInviteCode ?? "")}`);
}

export default async function OnboardingPage() {
  const authUserId = await getAuthUserId();

  if (!authUserId) {
    redirect("/login");
  }

  const admin = createServiceClient();
  const { data: appUser } = await admin
    .from("users")
    .select("id, couple_id, email, name")
    .eq("id", authUserId)
    .maybeSingle();

  if (appUser?.couple_id) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-12">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-2xl">Finish setting up your couple</CardTitle>
          <CardDescription>
            Create a new couple space or join your partner&apos;s invite code.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={saveOnboarding} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name">Your name</Label>
              <Input id="name" name="name" defaultValue={appUser?.name ?? appUser?.email?.split("@")[0] ?? ""} placeholder="Alex" required />
            </div>

            <div className="space-y-2">
              <Label htmlFor="invite_code">Invite code</Label>
              <Input id="invite_code" name="invite_code" placeholder="Leave blank to create a new couple" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Button name="mode" value="create" type="submit">
                Create couple
              </Button>
              <Button name="mode" value="join" type="submit" variant="outline">
                Join couple
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}