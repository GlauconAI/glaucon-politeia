import Link from "next/link";

const navItems = [
  { href: "/", label: "Home", kicker: "Overview" },
  { href: "/tags/vibe-coding", label: "Learn", kicker: "AI notes" },
  { href: "/search?q=essay", label: "Notes", kicker: "Essays" },
  { href: "/search?q=html", label: "Sites", kicker: "HTML artifacts" },
  { href: "/search?q=family", label: "Family", kicker: "Trips & home" },
  { href: "/tags/projects", label: "Products", kicker: "Builds" },
  { href: "/search", label: "Archive", kicker: "Everything" },
];

const operatorItems = [
  { href: "/lab/world", label: "Lab" },
  { href: "/todos", label: "TODO" },
  { href: "/profile/me", label: "个人资料" },
  { href: "/admin/prompts", label: "Prompt 管理" },
];

export function Sidebar() {
  return (
    <aside className="site-sidebar" aria-label="Left navigation">
      <nav aria-label="Primary">
        <ul className="nav-list">
          {navItems.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="nav-link" aria-label={item.label}>
                <span>{item.label}</span>
                <small>{item.kicker}</small>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="sidebar-note">
        <strong>Spaces</strong>
        <p>学习、写作、HTML site、家庭资料和产品记录，都从这里进入。</p>
      </div>

      <nav aria-label="Operator">
        <p className="nav-section-label">Operator</p>
        <ul className="nav-list nav-list-compact">
          {operatorItems.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="nav-link">
                <span>{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <div className="sidebar-note sidebar-note-muted">
        <strong>Vibe Academy</strong>
        <p>保留为 AI coding 学习与项目复盘空间。</p>
      </div>
    </aside>
  );
}
