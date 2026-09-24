const NAVIGATION_ROWS = Array.from({ length: 9 }, (_, index) => index);
const CONTENT_ROWS = Array.from({ length: 3 }, (_, index) => index);

function Bone({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block bg-muted motion-safe:animate-pulse ${className}`}
    />
  );
}

export function DashboardShellSkeleton() {
  return (
    <div
      className="flex h-screen overflow-hidden bg-background"
      role="status"
      aria-label="Cargando espacio de trabajo"
      aria-live="polite"
    >
      <aside className="hidden h-full w-60 shrink-0 border-r border-border bg-card lg:flex lg:flex-col">
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
          <Bone className="size-8 rounded-md" />
          <Bone className="h-4 w-20 rounded" />
        </div>
        <div className="flex flex-1 flex-col gap-2 px-3 py-4">
          {NAVIGATION_ROWS.map((row) => (
            <div key={row} className="flex h-9 items-center gap-3 px-3">
              <Bone className="size-4 rounded" />
              <Bone
                className={`h-3 rounded ${row % 3 === 0 ? 'w-28' : 'w-24'}`}
              />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 border-t border-border p-4">
          <Bone className="size-8 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Bone className="h-3 w-24 rounded" />
            <Bone className="h-2.5 w-32 max-w-full rounded" />
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <Bone className="size-9 rounded-md lg:hidden" />
            <Bone className="h-4 w-28 rounded" />
          </div>
          <div className="flex items-center gap-2">
            <Bone className="size-9 rounded-md" />
            <Bone className="size-8 rounded-full" />
            <Bone className="hidden h-3 w-20 rounded sm:block" />
          </div>
        </header>

        <main className="flex flex-1 items-center justify-center overflow-hidden p-4 sm:p-6">
          <div className="w-full max-w-3xl space-y-5" aria-hidden="true">
            <div className="space-y-2 text-center">
              <Bone className="mx-auto h-5 w-44 rounded" />
              <Bone className="mx-auto h-3 w-64 max-w-[80%] rounded" />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              {CONTENT_ROWS.map((row) => (
                <div
                  key={row}
                  className="space-y-4 rounded-lg border border-border bg-card p-4"
                >
                  <Bone className="h-3 w-20 rounded" />
                  <Bone className="h-7 w-24 rounded" />
                  <Bone className="h-2.5 w-full rounded" />
                </div>
              ))}
            </div>
            <div className="space-y-3 rounded-lg border border-border bg-card p-5">
              <Bone className="h-4 w-36 rounded" />
              <Bone className="h-3 w-full rounded" />
              <Bone className="h-3 w-5/6 rounded" />
              <Bone className="h-3 w-2/3 rounded" />
            </div>
          </div>
          <span className="sr-only">Cargando...</span>
        </main>
      </div>
    </div>
  );
}
