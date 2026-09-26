/**
 * Phase 1 placeholder for a ResolveX route. States which phase delivers the real
 * screen instead of rendering invented data — the command center is built in
 * Phase 12, once the domain and API exist.
 */
export function PlaceholderPage({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex h-full flex-col items-start justify-center gap-2 px-8 py-12">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-100">{title}</h1>
      <p className="max-w-xl text-sm leading-relaxed text-zinc-400">{detail}</p>
      <span className="mt-4 rounded border border-zinc-800 bg-zinc-900/60 px-2 py-1 text-xs font-medium tracking-wide text-zinc-500 uppercase">
        Not implemented yet
      </span>
    </div>
  );
}
