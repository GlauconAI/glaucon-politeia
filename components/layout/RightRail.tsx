import Link from "next/link";

const tags = [
  { href: "/tags/vibe-coding", label: "Vibe Coding" },
  { href: "/tags/trae-solo", label: "Trae Solo" },
  { href: "/tags/projects", label: "项目" },
  { href: "/tags/pitfalls", label: "踩坑" },
];

export function RightRail() {
  return (
    <aside className="right-rail" aria-label="Site information">
      <section className="panel">
        <h2>欢迎来到 Vibe Academy</h2>
        <p>这里记录 AI 编程学习笔记、项目复盘与工具实验。</p>
        <div className="panel-actions">
          <Link href="/editor" className="button-primary">
            开始写作
          </Link>
          <Link href="/tags/vibe-coding" className="button-secondary">
            了解 Vibe Coding
          </Link>
        </div>
      </section>

      <section className="panel">
        <h2>热门标签</h2>
        <ul className="tag-list">
          {tags.map((tag) => (
            <li key={tag.href}>
              <Link href={tag.href}>{tag.label}</Link>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
