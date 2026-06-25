import {
  Car,
  Gamepad2,
  Heart,
  Home,
  LucideIcon,
  MoreHorizontal,
  Plane,
  Receipt,
  ShoppingBag,
  ShoppingCart,
  Tags,
  UtensilsCrossed,
} from "lucide-react";

import { cn } from "@/lib/utils";

const categoryIcons: Record<string, LucideIcon> = {
  Car,
  Gamepad2,
  Heart,
  Home,
  MoreHorizontal,
  Plane,
  Receipt,
  ShoppingBag,
  ShoppingCart,
  Tags,
  UtensilsCrossed,
};

export const shortcutCategoryEmoji: Record<string, string> = {
  Car: "🚗",
  Gamepad2: "🎮",
  Heart: "❤️",
  Home: "🏠",
  MoreHorizontal: "•••",
  Plane: "✈️",
  Receipt: "🧾",
  ShoppingBag: "🛍️",
  ShoppingCart: "🛒",
  Tags: "🏷️",
  UtensilsCrossed: "🍽️",
};

type CategoryIconProps = {
  icon?: string | null;
  className?: string;
  fallback?: React.ReactNode;
};

export function CategoryIcon({ icon, className, fallback = "◎" }: CategoryIconProps) {
  if (!icon) {
    return <span className={cn("text-sm", className)}>{fallback}</span>;
  }

  const Icon = categoryIcons[icon];

  if (!Icon) {
    return <span className={cn("text-sm", className)}>{shortcutCategoryEmoji[icon] ?? fallback}</span>;
  }

  return <Icon aria-hidden="true" className={cn("h-4 w-4", className)} />;
}

export function getShortcutCategoryLabel(name: string, icon?: string | null) {
  const emoji = icon ? shortcutCategoryEmoji[icon] : null;
  return emoji ? `${emoji} ${name}` : name;
}
