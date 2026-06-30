"use client";

import {
  Car,
  DollarSign,
  Gamepad2,
  Gift,
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

export const AVAILABLE_ICONS: Record<string, LucideIcon> = {
  Car,
  DollarSign,
  Gamepad2,
  Gift,
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

export const ICON_LABELS: Record<string, string> = {
  Car: "Car",
  DollarSign: "Money",
  Gamepad2: "Gaming",
  Gift: "Gift",
  Heart: "Heart",
  Home: "Home",
  MoreHorizontal: "Other",
  Plane: "Travel",
  Receipt: "Receipt",
  ShoppingBag: "Shopping",
  ShoppingCart: "Groceries",
  Tags: "Tags",
  UtensilsCrossed: "Food",
};

type IconPickerProps = {
  value: string;
  onChange: (icon: string) => void;
};

export function IconPicker({ value, onChange }: IconPickerProps) {
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {Object.entries(AVAILABLE_ICONS).map(([name, Icon]) => {
        const isSelected = value === name;
        return (
          <button
            key={name}
            type="button"
            onClick={() => onChange(name === value ? "" : name)}
            className={cn(
              "flex flex-col items-center gap-0.5 rounded-xl border p-2 transition-all outline-none",
              "hover:border-primary/40 hover:bg-primary/5",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
              isSelected
                ? "border-primary bg-primary/10 ring-1 ring-primary"
                : "border-border bg-background",
            )}
            title={ICON_LABELS[name]}
          >
            <Icon className="h-4 w-4" />
            <span className="text-[10px] leading-tight text-muted-foreground">
              {ICON_LABELS[name]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
