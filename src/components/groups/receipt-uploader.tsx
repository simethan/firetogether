"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { selectClass } from "@/components/groups/shared";

type Member = { id: string; nickname: string };

const MAX_EDGE = 2000;

function withMimeType(file: File): File {
  if (file.type) return file;
  const lower = file.name.toLowerCase();
  const type = lower.endsWith(".heic") ? "image/heic" : lower.endsWith(".heif") ? "image/heif" : "";
  return type ? new File([file], file.name, { type }) : file;
}

/** Shrink photos before upload; also turns HEIC into JPEG where the browser can decode it. */
async function prepareFile(original: File): Promise<File> {
  const file = withMimeType(original);
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.type === "image/jpeg" && file.size < 1_500_000) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.jpg`, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export function ReceiptUploader({ code, members, meId }: { code: string; members: Member[]; meId: string }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [paidById, setPaidById] = useState(meId);
  const [assignToId, setAssignToId] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const busy = status !== null;

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files);
    let lastExpenseId: string | null = null;
    let succeeded = 0;

    for (const [index, original] of list.entries()) {
      setStatus(list.length > 1 ? `Reading ${index + 1} of ${list.length}…` : "Reading receipt…");
      const form = new FormData();
      form.append("file", await prepareFile(original));
      form.append("paidById", paidById);
      if (assignToId) form.append("assignToId", assignToId);

      try {
        const response = await fetch(`/api/groups/${code}/receipts`, { method: "POST", body: form });
        const body = await response.json().catch(() => ({}));
        if (response.status === 409) {
          toast.error(body.message ?? "This receipt was already uploaded.");
        } else if (response.status === 422) {
          toast.error(`${original.name}: ${body.message ?? "Doesn't look like a receipt."}`);
        } else if (!response.ok) {
          toast.error(body.message ?? "Upload failed.");
        } else if (body.status === "payment") {
          succeeded++;
          toast.success("Recorded as a payment — waiting for the receiver to approve.");
        } else {
          succeeded++;
          lastExpenseId = body.expenseId;
          if (body.status === "failed" || body.status === "retry") toast.message(body.note ?? "Uploaded.");
        }
      } catch {
        toast.error("Upload failed. Check your connection.");
      }
    }

    setStatus(null);
    if (fileInput.current) fileInput.current.value = "";
    if (cameraInput.current) cameraInput.current.value = "";
    if (list.length === 1 && lastExpenseId) {
      router.push(`/groups/${code}/expenses/${lastExpenseId}`);
    } else {
      if (succeeded) toast.success(`Uploaded ${succeeded} of ${list.length}.`);
      router.refresh();
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="receipt-paid-by">Who paid?</Label>
          <select
            id="receipt-paid-by"
            className={selectClass}
            value={paidById}
            onChange={(e) => setPaidById(e.target.value)}
            disabled={busy}
          >
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nickname}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="receipt-assign">Auto-assign items to (optional)</Label>
          <select
            id="receipt-assign"
            className={selectClass}
            value={assignToId}
            onChange={(e) => setAssignToId(e.target.value)}
            disabled={busy}
          >
            <option value="">Split later</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nickname}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          ref={cameraInput}
          id="receipt-camera"
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => upload(e.target.files)}
        />
        <input
          ref={fileInput}
          id="receipt-file"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif,application/pdf"
          multiple
          className="sr-only"
          onChange={(e) => upload(e.target.files)}
        />
        <Button type="button" variant="outline" disabled={busy} onClick={() => cameraInput.current?.click()}>
          Take photo
        </Button>
        <Button type="button" disabled={busy} onClick={() => fileInput.current?.click()}>
          {status ?? "Upload a receipt"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Receipts, bills, or payment/bank transfer screenshots. JPG, PNG, HEIC, or PDF. We&apos;ll read the items
        automatically.
      </p>
    </div>
  );
}
