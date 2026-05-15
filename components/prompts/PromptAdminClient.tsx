"use client";

import { useState } from "react";

type PromptRow = {
  id: string;
  created_at: string;
  source_url: string;
  user_id: string | null;
  content: string;
  flags: { has_sensitive?: boolean; sensitive_hits?: { type: string }[] };
  marked: boolean;
  marked_reason: string | null;
};

type PromptListResponse = {
  prompts: PromptRow[];
  total: number;
  page: number;
  pageSize: number;
};

type StatsResponse = {
  buckets: { hour: string; count: number }[];
};

type PromptAdminClientProps = {
  initialData: PromptListResponse;
  initialStats: StatsResponse["buckets"];
};

export function PromptAdminClient({
  initialData,
  initialStats,
}: PromptAdminClientProps) {
  const [query, setQuery] = useState("");
  const [marked, setMarked] = useState("");
  const [sensitive, setSensitive] = useState("");
  const [data, setData] = useState<PromptListResponse | null>(initialData);
  const [stats, setStats] = useState<StatsResponse["buckets"]>(initialStats);
  const [selected, setSelected] = useState<string[]>([]);
  const [status, setStatus] = useState("");

  function buildParams() {
    const next = new URLSearchParams({ pageSize: "25" });
    if (query.trim()) next.set("q", query.trim());
    if (marked) next.set("marked", marked);
    if (sensitive) next.set("sensitive", sensitive);
    return next;
  }

  async function load() {
    const params = buildParams();
    const [listResponse, statsResponse] = await Promise.all([
      fetch(`/api/prompts?${params.toString()}`),
      fetch("/api/prompts/stats"),
    ]);

    if (listResponse.ok) {
      setData(await listResponse.json());
    }

    if (statsResponse.ok) {
      const body = (await statsResponse.json()) as StatsResponse;
      setStats(body.buckets);
    }
  }

  async function runBulk(action: "mark" | "unmark" | "delete") {
    if (selected.length === 0) return;

    setStatus("正在更新");
    const response = await fetch("/api/prompts/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ids: selected,
        action,
        markedReason: action === "mark" ? "admin review" : undefined,
      }),
    });

    setStatus(response.ok ? "已更新" : "更新失败");
    setSelected([]);
    await load();
  }

  const exportParams = buildParams();

  return (
    <section className="admin-prompts">
      <div className="admin-toolbar">
        <input
          aria-label="搜索 prompts"
          placeholder="搜索 prompt 内容"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          aria-label="标记筛选"
          value={marked}
          onChange={(event) => setMarked(event.target.value)}
        >
          <option value="">全部标记</option>
          <option value="true">已标记</option>
          <option value="false">未标记</option>
        </select>
        <select
          aria-label="敏感筛选"
          value={sensitive}
          onChange={(event) => setSensitive(event.target.value)}
        >
          <option value="">全部敏感状态</option>
          <option value="true">含敏感信号</option>
          <option value="false">无敏感信号</option>
        </select>
        <a className="button-secondary" href={`/api/prompts/export?${exportParams.toString()}`}>
          导出 CSV
        </a>
        <button className="button-secondary" onClick={() => void load()}>
          应用筛选
        </button>
      </div>

      <div className="stats-strip">
        {stats.slice(-8).map((bucket) => (
          <div key={bucket.hour} className="stat-cell">
            <strong>{bucket.count}</strong>
            <span>{new Date(bucket.hour).getHours()}:00</span>
          </div>
        ))}
      </div>

      <div className="admin-bulkbar">
        <span>{selected.length} selected</span>
        <button className="button-secondary" onClick={() => void runBulk("mark")}>
          标记
        </button>
        <button className="button-secondary" onClick={() => void runBulk("unmark")}>
          取消标记
        </button>
        <button className="button-secondary" onClick={() => void runBulk("delete")}>
          软删除
        </button>
        {status ? <span className="empty-text">{status}</span> : null}
      </div>

      <div className="admin-table">
        {data?.prompts.map((prompt) => (
          <article key={prompt.id} className="prompt-row">
            <label>
              <input
                type="checkbox"
                checked={selected.includes(prompt.id)}
                onChange={(event) =>
                  setSelected((current) =>
                    event.target.checked
                      ? [...current, prompt.id]
                      : current.filter((id) => id !== prompt.id),
                  )
                }
              />
            </label>
            <div>
              <div className="prompt-meta">
                <span>{new Date(prompt.created_at).toLocaleString()}</span>
                <span>{prompt.flags?.has_sensitive ? "sensitive" : "normal"}</span>
                <span>{prompt.marked ? "marked" : "unmarked"}</span>
              </div>
              <p>{prompt.content}</p>
              <small>{prompt.source_url}</small>
            </div>
          </article>
        ))}
        {data && data.prompts.length === 0 ? (
          <p className="empty-text">没有符合条件的 prompt。</p>
        ) : null}
      </div>
    </section>
  );
}
