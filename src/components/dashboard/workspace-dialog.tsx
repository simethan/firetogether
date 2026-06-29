"use client";

import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CopyButton } from "@/components/shortcut/copy-button";

export type WorkspaceUser = {
  id: string;
  name: string;
  email: string;
  created_at: string;
};

type Props = {
  members: WorkspaceUser[];
  inviteCode: string | null;
  currentUserId: string;
};

export function WorkspaceDialog({ members, inviteCode, currentUserId }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="group w-full cursor-pointer rounded-2xl border border-border bg-background/70 p-4 text-left transition-all hover:border-primary/30 hover:bg-primary/[0.03] hover:shadow-sm">
        <div className="text-sm text-muted-foreground">Workspace</div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-foreground">
          <span>
            {members.length} member
            {members.length === 1 ? "" : "s"}
          </span>
          {inviteCode ? (
            <code className="rounded-md border border-border bg-muted/50 px-1.5 py-0.5 font-mono text-xs">
              {inviteCode}
            </code>
          ) : null}
          <span className="text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
            View details →
          </span>
        </div>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Workspace</DialogTitle>
          <DialogDescription>
            Your couple&apos;s shared space for tracking expenses together.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Invite code */}
          {inviteCode && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-foreground">
                  Invite code
                </span>
                <CopyButton
                  text={inviteCode}
                  label="Copy"
                  copiedLabel="Copied!"
                />
              </div>
              <div className="rounded-xl border border-border bg-muted/30 p-3 font-mono text-xs text-foreground tracking-wider">
                {inviteCode}
              </div>
              <p className="text-xs text-muted-foreground">
                Share this code with your partner so they can join this
                workspace.
              </p>
            </div>
          )}

          <Separator />

          {/* Members */}
          <div className="space-y-2">
            <span className="text-sm font-medium text-foreground">
              Members ({members.length})
            </span>
            <div className="space-y-2">
              {members.map((member) => {
                const isMe = member.id === currentUserId;
                return (
                  <div
                    key={member.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/50 px-3 py-2.5"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                        {member.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-foreground">
                            {member.name}
                          </span>
                          {isMe && (
                            <Badge
                              variant="secondary"
                              className="text-[10px] font-normal leading-none"
                            >
                              You
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {member.email}
                        </div>
                      </div>
                    </div>
                    <div className="shrink-0 text-[11px] text-muted-foreground">
                      Joined{" "}
                      {new Date(member.created_at).toLocaleDateString(
                        "en-US",
                        { month: "short", day: "numeric" },
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
