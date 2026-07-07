"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HistoryIcon } from "lucide-react";
import { useActionState, useState } from "react";

export function BackfillDialog({
  backfillAction,
}: {
  backfillAction: (formData: FormData) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <HistoryIcon className="mr-1.5 size-3.5" />
        Backfill history
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Backfill net worth history</DialogTitle>
          <DialogDescription>
            Create balance snapshots for all your accounts on a past date, so
            the chart shows where you were.
          </DialogDescription>
        </DialogHeader>
        <form action={backfillAction} onSubmit={() => setOpen(false)}>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="backfill-date">Starting date</Label>
              <Input
                id="backfill-date"
                name="target_date"
                type="date"
                defaultValue="2025-05-01"
                required
              />
              <p className="text-[10px] text-muted-foreground">
                The earliest date you want the chart to show.
              </p>
            </div>

            <label className="flex items-start gap-3 rounded-xl border border-border/50 bg-muted/20 p-3">
              <input
                type="checkbox"
                name="include_monthly"
                defaultChecked
                className="mt-0.5 size-4 accent-foreground"
              />
              <div className="space-y-0.5">
                <span className="text-sm font-medium text-foreground">
                  Include month-end snapshots
                </span>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Creates a snapshot on the last day of each month for bank
                  and managed accounts, giving the chart a richer shape.
                </p>
              </div>
            </label>

            <p className="text-[10px] leading-relaxed text-muted-foreground/60">
              Stock accounts use historical close prices from Yahoo Finance for
              every trading day. Bank and managed accounts use the latest recorded
              balance. You can edit or delete individual snapshots later.
            </p>
          </div>
          <div className="flex justify-end gap-2 border-t border-border/40 pt-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm">
              Generate snapshots
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
