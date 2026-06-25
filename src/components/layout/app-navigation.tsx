"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Calculator,
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
  { href: "/categories", label: "Categories", icon: Tags },
  { href: "/shortcut", label: "Shortcut", icon: Smartphone },
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

  return (
    <>
      <header className="sticky top-0 z-40 hidden border-b border-border/70 bg-background/90 backdrop-blur supports-backdrop-filter:bg-background/70 md:block">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center gap-4 px-6 lg:px-8">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 font-semibold tracking-tight text-foreground"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/10 text-lg">
              🔥
            </span>
            FireTogether
          </Link>

          <nav className="ml-4 flex flex-1 items-center gap-1">
            {primaryLinks.map((item) => {
              const Icon = item.icon;
              const active = isActive(pathname, item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                    active &&
                      "bg-primary/10 text-primary hover:bg-primary/10 hover:text-primary",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <Link
            href="/expenses/new"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-all hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/25 active:scale-[0.97]"
          >
            <PlusCircle className="h-4 w-4" />
            Add expense
          </Link>
          <SignOutButton />
        </div>
      </header>

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border/70 bg-background/95 px-2 pb-[calc(env(safe-area-inset-bottom)+0.35rem)] pt-2 backdrop-blur supports-backdrop-filter:bg-background/80 md:hidden">
        <div className="grid grid-cols-5 gap-1">
          {primaryLinks.slice(0, 4).map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  active && "bg-primary/10 text-primary",
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
          <Link
            href="/expenses/new"
            className="flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl bg-primary px-1 text-[11px] font-semibold text-primary-foreground shadow-md shadow-primary/20"
          >
            <PlusCircle className="h-4 w-4" />
            Add
          </Link>
        </div>
      </nav>
    </>
  );
}
