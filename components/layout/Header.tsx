import Link from "next/link";

import { logoutAction } from "@/app/auth/actions";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { collectionRoutes } from "@/lib/posts/collections";

type HeaderProps = {
  canPublish?: boolean;
  userEmail: string | null;
};

const collectionLinks = collectionRoutes.map(({ href, label }) => ({ href, label }));

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

        <div className="header-actions">
          {canPublish ? (
            <>
              <Link href="/dashboard" className="operator-link">
                Dashboard
              </Link>
              <Link href="/editor" className="write-link">
                Publish
              </Link>
            </>
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
