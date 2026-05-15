import Link from "next/link";

const navItems = [
  { href: "/", label: "首页" },
  { href: "/lab/world", label: "互动实验" },
  { href: "/todos", label: "TODO" },
  { href: "/tags/vibe-coding", label: "Vibe Coding" },
  { href: "/tags/trae-solo", label: "Trae Solo" },
  { href: "/tags/projects", label: "我的项目" },
  { href: "/tags/pitfalls", label: "踩坑日记" },
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
              <Link href={item.href} className="nav-link">
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="sidebar-note">
        <strong>Vibe Academy</strong>
        <p>写作、评论、点赞、收藏与资料维护的内容工作台。</p>
      </div>
    </aside>
  );
}
