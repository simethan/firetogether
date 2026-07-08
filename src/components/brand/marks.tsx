type GlyphKind = "bank" | "investment" | "managed";

/** Brand mark: two strokes converging into one flame — the couple's pool. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className ?? "h-5 w-5"}
      aria-hidden
    >
      <path
        d="M5 4 C10 9 9 15 12 20"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M19 4 C14 9 15 15 12 20"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M12 20 C11 16 13 13 12 9 C11 13 13 16 12 20Z"
        fill="currentColor"
        opacity="0.9"
      />
    </svg>
  );
}

/** Account-type glyphs used on the net-worth page (replaces emoji). */
export function AccountGlyph({
  kind,
  className,
}: {
  kind: GlyphKind;
  className?: string;
}) {
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: className ?? "h-4 w-4",
    "aria-hidden": true,
  };

  if (kind === "bank") {
    return (
      <svg {...common}>
        <path d="M3 9 L12 4 L21 9" />
        <path d="M5 9 V18 M9.5 9 V18 M14.5 9 V18 M19 9 V18" />
        <path d="M3 21 H21" />
      </svg>
    );
  }

  if (kind === "investment") {
    return (
      <svg {...common}>
        <path d="M4 20 V15 M9 20 V10 M14 20 V13 M19 20 V7" />
        <path d="M3 11 L8 8 L12 10 L17 6 L21 8" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path d="M12 3 L20 7 V12 C20 17 16 20 12 21 C8 20 4 17 4 12 V7 Z" />
      <path d="M9 12 L11.5 14.5 L15.5 10" />
    </svg>
  );
}
