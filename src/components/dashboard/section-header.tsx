import Link from "next/link";

export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-taupe">
          {eyebrow}
        </div>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {description ? (
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action ? (
        <Link
          href={action.href}
          className="font-mono text-[11px] text-ember hover:underline"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
