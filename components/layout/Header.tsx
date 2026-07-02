import Link from "next/link";

import { logoutAction } from "@/app/auth/actions";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

type HeaderProps = {
  canPublish?: boolean;
  userEmail: string | null;
};

const collectionLinks = [
  { href: "/tags/vibe-coding", label: "Learn" },
  { href: "/search?q=html", label: "Sites" },
  { href: "/search?q=fragments", label: "Fragments" },
  { href: "/search?q=family", label: "Family" },
  { href: "/tags/projects", label: "Products" },
  { href: "/search", label: "Archive" },
];

export function Header({ canPublish = false, userEmail }: HeaderProps) {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link href="/" className="brand" aria-label="402v home">
          <span className="brand-title">402v</span>
          <span className="brand-subtitle">~/publishing-system</span>
        </Link>

        <nav className="site-nav" aria-label="Primary">
          {collectionLinks.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>

        <form className="search-form" action="/search">
          <input
            type="search"
            name="q"
            placeholder="Search 402v"
            aria-label="Search posts"
          />
        </form>

        <div className="header-actions">
          {canPublish ? (
            <Link href="/editor" className="write-link">
              Publish
            </Link>
          ) : null}
          <ThemeToggle />
          {userEmail ? (
            <div className="user-menu">
              <span>{userEmail}</span>
              <Link href="/profile/me">个人资料</Link>
              <form action={logoutAction}>
                <button type="submit">退出登录</button>
              </form>
            </div>
          ) : (
            <Link href="/auth" className="login-link">
              登录
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
