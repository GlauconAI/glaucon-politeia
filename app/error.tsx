"use client";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="status-panel">
      <p className="eyebrow">Error</p>
      <h1>页面加载失败</h1>
      <p>请稍后重试。如果问题持续存在，检查 Supabase 配置和网络状态。</p>
      <button type="button" className="button-primary" onClick={reset}>
        重试
      </button>
    </section>
  );
}
