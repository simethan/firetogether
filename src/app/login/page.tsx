import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSiteUrl } from "@/lib/siteUrl";
import { createClient } from "@/lib/supabase/server";

async function sendMagicLink(formData: FormData) {
  "use server";

  const email = String(formData.get("email") ?? "").trim();

  if (!email) {
    redirect("/login?error=email_required");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${getSiteUrl()}/auth/callback`,
    },
  });

  if (error) {
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/login?sent=1");
}

export default async function LoginPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (data.user) {
    redirect("/onboarding");
  }

  return (
    <div className="flex min-h-full items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md border-border/60 shadow-xl shadow-orange-500/5">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-3xl">
            🔥
          </div>
          <CardTitle className="text-2xl font-bold">Sign in to FireTogether</CardTitle>
          <CardDescription>
            We'll send a magic link to your email, then continue you into onboarding.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={sendMagicLink} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" placeholder="you@example.com" required className="h-11" />
            </div>
            <Button className="h-11 w-full text-base font-semibold shadow-md shadow-primary/20" type="submit">
              Send magic link
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}