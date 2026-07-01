import Link from "next/link";

import { logoutAction } from "@/app/auth/actions";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

type HeaderProps = {
  userEmail: string | null;
};

export function Header({ userEmail }: HeaderProps) {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link href="/" className="brand" aria-label="402v home">
          <span className="brand-title">402v</span>
          <span className="brand-subtitle">Personal publishing system</span>
        </Link>

        <form className="search-form" action="/search">
          <input
            type="search"
            name="q"
            placeholder="Search notes, sites, products..."
            aria-label="Search posts"
          />
        </form>

        <div className="header-actions">
          <Link href="/editor" className="write-link">
            Publish
          </Link>
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
