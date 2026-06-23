import Link from "next/link";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function Home() {
  return (
    <div className="flex min-h-full items-center justify-center px-4 py-12">
      <Card className="w-full max-w-2xl border-border/60 shadow-xl shadow-orange-500/5">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-4xl">
            🔥
          </div>
          <CardTitle className="text-4xl font-bold">FireTogether</CardTitle>
          <CardDescription className="text-base">
            Couples finance and expense tracking with shared dashboards and invite-code onboarding.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/login"
            className="inline-flex h-11 flex-1 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-all hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/25 active:scale-[0.97]"
          >
            Get started
          </Link>
          <Link
            href="/login"
            className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Sign in
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
