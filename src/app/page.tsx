import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Calculator, Goal, ReceiptText, Tags, Users, Smartphone } from "lucide-react";

const features = [
  {
    icon: ReceiptText,
    title: "Shared expenses",
    description: "Log expenses together — personal or shared, always in sync.",
  },
  {
    icon: Calculator,
    title: "Monthly budgets",
    description: "Set budgets by category and track spending as a couple.",
  },
  {
    icon: Goal,
    title: "Savings goals",
    description: "Set targets and watch your progress grow side by side.",
  },
  {
    icon: Tags,
    title: "Custom categories",
    description: "Organize spending your way with default and custom categories.",
  },
  {
    icon: Users,
    title: "Built for two",
    description: "One dashboard, two people. See who spent what at a glance.",
  },
  {
    icon: Smartphone,
    title: "Quick shortcut",
    description: "Add expenses from your phone's home screen in seconds.",
  },
];

export default function Home() {
  return (
    <div className="flex min-h-full flex-col">
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border/60">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10" />
        <div className="relative mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-20 text-center sm:gap-8 sm:py-28 lg:py-36">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/10 text-5xl">
            🔥
          </div>
          <div className="space-y-4">
            <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
              Finances, together
            </h1>
            <p className="mx-auto max-w-lg text-lg text-muted-foreground">
              The expense tracker built for couples. Shared dashboards, budgets, and goals — so money talks don't have to.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/login"
              className="inline-flex h-12 items-center justify-center rounded-xl bg-primary px-8 text-base font-semibold text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.97]"
            >
              Get started — it's free
            </Link>
            <Link
              href="/login"
              className="inline-flex h-12 items-center justify-center rounded-xl border border-border bg-background px-8 text-base font-medium text-foreground transition-colors hover:bg-muted"
            >
              Sign in
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <div className="mb-12 text-center">
          <Badge variant="secondary" className="mb-3">Features</Badge>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Everything your couple needs
          </h2>
          <p className="mx-auto mt-2 max-w-md text-muted-foreground">
            One place to track, budget, and save — designed from the ground up for two.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <Card
              key={feature.title}
              className="border-border/60 bg-card/50 transition-shadow"
            >
              <CardContent className="flex gap-4 p-5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <feature.icon className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <h3 className="font-semibold leading-tight">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="border-t border-border/60 bg-muted/30">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-16 text-center sm:py-20">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Ready to get on the same page?
          </h2>
          <p className="max-w-md text-muted-foreground">
            Stop splitting spreadsheets. Start tracking together.
          </p>
          <Link
            href="/login"
            className="mt-2 inline-flex h-12 items-center justify-center rounded-xl bg-primary px-8 text-base font-semibold text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.97]"
          >
            Get started
          </Link>
        </div>
      </section>
    </div>
  );
}
