import "server-only";

import { GROUP_CATEGORIES } from "@/lib/groups/types";

export type OcrItem = { name: string; quantity: number; unitPrice: number; total: number; category?: string | null };

export type OcrResult =
  | {
      docType: "receipt";
      merchant: string | null;
      date: string | null;
      receiptNumber: string | null;
      currency: string | null;
      category: string | null;
      items: OcrItem[];
      subtotal: number | null;
      serviceChargePercent: number | null;
      taxPercent: number | null;
      discount: number | null;
      total: number | null;
      rawText: string | null;
    }
  | {
      docType: "payment";
      amount: number | null;
      currency: string | null;
      payerName: string | null;
      receiverName: string | null;
      rawText: string | null;
    }
  | { docType: "other"; rawText: string | null };

export class OcrNotConfiguredError extends Error {}

const PROMPT = `You read photos of receipts, bills and bank-transfer screenshots for a bill-splitting app.
Return ONLY a JSON object, no prose.

If the image is a receipt or bill:
{"docType":"receipt","merchant":string|null,"date":"YYYY-MM-DD"|null,"receiptNumber":string|null,
 "currency":ISO 4217 code|null,"category":one of ${JSON.stringify(GROUP_CATEGORIES)},
 "items":[{"name":string,"quantity":number,"unitPrice":number,"total":number,"category":same list|null}],
 "subtotal":number|null,"serviceChargePercent":number|null,"taxPercent":number|null,"discount":number|null,
 "total":number|null,"rawText":string}
Rules: list purchasable line items only (no subtotal/tax/service/discount lines). "total" per item is the line
amount before service charge and tax. Percentages are numbers like 10 for 10%. Discount is a positive amount.

If it is a payment or bank-transfer confirmation (PayNow, PayLah, bank app, etc.):
{"docType":"payment","amount":number|null,"currency":string|null,"payerName":string|null,"receiverName":string|null,"rawText":string}

Otherwise: {"docType":"other","rawText":string|null}`;

function config() {
  const apiKey = process.env.RECEIPT_OCR_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) throw new OcrNotConfiguredError("Receipt reading isn't configured (RECEIPT_OCR_API_KEY).");
  return {
    apiKey,
    baseUrl: (process.env.RECEIPT_OCR_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, ""),
    model: process.env.RECEIPT_OCR_MODEL ?? "gpt-4o-mini",
  };
}

function toNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function toText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalize(raw: Record<string, unknown>): OcrResult {
  const rawText = toText(raw.rawText);
  if (raw.docType === "payment") {
    return {
      docType: "payment",
      amount: toNumber(raw.amount),
      currency: toText(raw.currency)?.toUpperCase() ?? null,
      payerName: toText(raw.payerName),
      receiverName: toText(raw.receiverName),
      rawText,
    };
  }
  if (raw.docType !== "receipt") return { docType: "other", rawText };

  const categories = GROUP_CATEGORIES as readonly string[];
  const pickCategory = (value: unknown) => {
    const text = toText(value);
    return text && categories.includes(text) ? text : null;
  };

  const items: OcrItem[] = (Array.isArray(raw.items) ? raw.items : [])
    .map((entry) => {
      const item = entry as Record<string, unknown>;
      const quantity = toNumber(item.quantity) ?? 1;
      const total = toNumber(item.total) ?? (toNumber(item.unitPrice) ?? 0) * quantity;
      const unitPrice = toNumber(item.unitPrice) ?? (quantity ? total / quantity : total);
      return {
        name: toText(item.name) ?? "Item",
        quantity,
        unitPrice: Math.round(unitPrice * 100) / 100,
        total: Math.round(total * 100) / 100,
        category: pickCategory(item.category),
      };
    })
    .filter((item) => item.total !== 0);

  const date = toText(raw.date);
  return {
    docType: "receipt",
    merchant: toText(raw.merchant),
    date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    receiptNumber: toText(raw.receiptNumber),
    currency: toText(raw.currency)?.toUpperCase() ?? null,
    category: pickCategory(raw.category),
    items,
    subtotal: toNumber(raw.subtotal),
    serviceChargePercent: toNumber(raw.serviceChargePercent),
    taxPercent: toNumber(raw.taxPercent),
    discount: toNumber(raw.discount),
    total: toNumber(raw.total),
    rawText,
  };
}

export async function readReceipt(file: Buffer, contentType: string): Promise<OcrResult> {
  const { apiKey, baseUrl, model } = config();
  const dataUrl = `data:${contentType};base64,${file.toString("base64")}`;
  const filePart =
    contentType === "application/pdf"
      ? { type: "file", file: { filename: "receipt.pdf", file_data: dataUrl } }
      : { type: "image_url", image_url: { url: dataUrl, detail: "high" } };

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: PROMPT },
        { role: "user", content: [{ type: "text", text: "Read this document." }, filePart] },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`OCR request failed (${response.status}): ${detail.slice(0, 200)}`);
  }

  const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const content = body.choices?.[0]?.message?.content ?? "";
  const json = content.slice(content.indexOf("{"), content.lastIndexOf("}") + 1);
  return normalize(JSON.parse(json) as Record<string, unknown>);
}
