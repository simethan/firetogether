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
      emailRedirectTo: `${getSiteUrl()}/auth/callback?next=/onboarding`,
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
      <Card className="w-full max-w-md border-border/60 shadow-lg shadow-orange-500/5">
        <CardHeader>
          <CardTitle className="text-2xl">Sign in to FireTogether</CardTitle>
          <CardDescription>
            We&apos;ll send a magic link to your email, then continue you into onboarding.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={sendMagicLink} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" placeholder="you@example.com" required />
            </div>
            <Button className="w-full" type="submit">
              Send magic link
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}