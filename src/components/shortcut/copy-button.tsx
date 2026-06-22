"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";

type CopyButtonProps = {
  text: string;
  label: string;
  copiedLabel: string;
};

export function CopyButton({ text, label, copiedLabel }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Button type="button" variant="outline" onClick={handleCopy}>
      {copied ? copiedLabel : label}
    </Button>
  );
}