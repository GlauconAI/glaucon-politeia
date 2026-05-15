import { getPublicEnv } from "@/lib/env";

export default function Home() {
  const env = getPublicEnv();

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
      <section className="mx-auto flex w-full max-w-4xl flex-col gap-8">
        <div className="space-y-4">
          <p className="text-sm font-medium uppercase tracking-[0.16em] text-cyan-300">
            Project baseline
          </p>
          <h1 className="text-4xl font-semibold tracking-normal sm:text-5xl">
            Glaucon Politeia
          </h1>
          <p className="max-w-2xl text-base leading-7 text-slate-300">
            A Next.js and Supabase foundation for rebuilding the Vibe Academy
            personal publishing site.
          </p>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-lg font-semibold">Supabase configuration</h2>
          {env.configured ? (
            <p className="mt-2 text-sm text-emerald-300">
              Public Supabase environment variables are configured.
            </p>
          ) : (
            <p className="mt-2 text-sm text-amber-300">
              Missing public environment variables: {env.missing.join(", ")}.
              Copy .env.example to .env.local and add your Supabase project URL
              and publishable key before connecting Supabase.
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
