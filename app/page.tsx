import { getPublicEnv } from "@/lib/env";

export default function Home() {
  const env = getPublicEnv();

  return (
    <section className="home-stack">
      <div className="intro-panel">
        <p className="eyebrow">Vibe First, Code Later</p>
        <h1>Glaucon Politeia</h1>
        <p>
          A personal publishing site for AI coding notes, project retrospectives,
          and experiments. The core shell is ready for authentication, profiles,
          posts, comments, likes, and bookmarks.
        </p>
        <div className="intro-actions">
          <a href="/lab/world" className="button-primary">
            查看互动实验模块
          </a>
          <a href="/editor" className="button-secondary">
            开始写作
          </a>
        </div>
      </div>

      <div className="status-panel">
        <h2>Supabase configuration</h2>
        {env.configured ? (
          <p className="success-text">
            Public Supabase environment variables are configured.
          </p>
        ) : (
          <p className="warning-text">
            Missing public environment variables: {env.missing.join(", ")}. Copy
            .env.example to .env.local and add your Supabase project URL and
            publishable key before connecting Supabase.
          </p>
        )}
      </div>
    </section>
  );
}
