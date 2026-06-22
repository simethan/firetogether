import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <div className="flex min-h-full items-center justify-center px-4 py-12">
      <Card className="w-full max-w-2xl border-border/60 shadow-lg shadow-orange-500/5">
        <CardHeader>
          <CardTitle className="text-3xl">FireTogether</CardTitle>
          <CardDescription>
            Couples finance and expense tracking with shared dashboards and invite-code onboarding.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/login"
            className="inline-flex h-10 flex-1 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Sign in
          </Link>
          <Link
            href="/onboarding"
            className="inline-flex h-10 flex-1 items-center justify-center rounded-lg border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Start onboarding
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
