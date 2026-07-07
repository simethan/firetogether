export default function Loading() {
  return (
    <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <div className="h-40 w-full animate-pulse rounded-[2rem] bg-muted/50" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-muted/50" />
        ))}
      </div>
      <div className="h-64 w-full animate-pulse rounded-2xl bg-muted/50" />
    </div>
  );
}
