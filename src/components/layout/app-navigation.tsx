"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calculator,
  Calendar,
  Goal,
  Home,
  PlusCircle,
  ReceiptText,
  Smartphone,
  Tags,
} from "lucide-react";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { cn } from "@/lib/utils";

const primaryLinks = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/expenses", label: "Expenses", icon: ReceiptText },
  { href: "/budgets", label: "Budgets", icon: Calculator },
  { href: "/goals", label: "Goals", icon: Goal },
];

const secondaryLinks = [
  { href: "/categories", label: "Categories", icon: Tags },
  { href: "/shortcut", label: "Shortcut", icon: Smartphone },
  { href: "/year-in-review", label: "Year in Review", icon: Calendar },
];

const publicRoutes = new Set(["/", "/login", "/onboarding"]);

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppNavigation() {
  const pathname = usePathname();

  if (publicRoutes.has(pathname) || pathname.startsWith("/auth")) {
    return null;
  }

  const isAddExpenseActive = pathname === "/expenses/new";

  return (
    <>
      {/* Sidebar spacer — pushes main content right */}
      <div className="hidden w-60 shrink-0 md:block" aria-hidden="true" />

      {/* Desktop sidebar — visible from md breakpoint */}
      <aside className="fixed left-0 top-0 z-40 hidden h-full w-60 flex-col border-r border-border/70 bg-card md:flex">

        {/* Brand */}
        <div className="flex h-16 shrink-0 items-center gap-2.5 px-5">
          <Link
            href="/dashboard"
            className="flex items-center gap-2.5 font-semibold tracking-tight text-foreground"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/10 text-lg">
              🔥
            </span>
            <span className="text-base">FireTogether</span>
          </Link>
        </div>

        {/* Nav links */}
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
          {primaryLinks.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group relative flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-all duration-200 hover:bg-muted hover:text-foreground",
                  active &&
                    "bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary",
                )}
                aria-current={active ? "page" : undefined}
              >

                <Icon className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:scale-110" />
                {item.label}
              </Link>
            );
          })}

          {/* Secondary nav group */}
          <div className="my-2 border-t border-border/40" />
          <p className="px-3 pb-1 text-[11px] font-medium uppercase tracking-widest text-muted-foreground/60">
            Settings
          </p>
          {secondaryLinks.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  active &&
                    "bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary",
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Bottom actions */}
        <div className="space-y-1.5 border-t border-border/70 p-3">
          <Link
            href="/expenses/new"
            className={cn(
              "flex h-10 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 active:scale-[0.97]",
              isAddExpenseActive && "ring-2 ring-primary/30",
            )}
          >
            <PlusCircle className="h-4 w-4" />
            Add expense
          </Link>
          <SignOutButton />
        </div>
      </aside>

      {/* Mobile bottom tab bar — hidden from md breakpoint */}
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border/70 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80 md:hidden">

        <div className="flex gap-1 overflow-x-auto px-2 pb-[calc(env(safe-area-inset-bottom)+0.35rem)] pt-2 scrollbar-none">
          {[...primaryLinks, ...secondaryLinks].map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex shrink-0 flex-col items-center justify-center gap-1 rounded-xl px-3 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  active && "bg-primary/10 text-primary",
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
          <Link
            href="/expenses/new"
            className="flex shrink-0 flex-col items-center justify-center gap-1 rounded-xl bg-primary px-3 text-[11px] font-semibold text-primary-foreground"
          >
            <PlusCircle className="h-5 w-5" />
            Add
          </Link>
        </div>
      </nav>
    </>
  );
}
