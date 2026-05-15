import Link from "next/link";

export default function NotFound() {
  return (
    <section className="status-panel">
      <p className="eyebrow">404</p>
      <h1>页面不存在</h1>
      <p>这个页面可能还没有发布，或者链接已经失效。</p>
      <Link href="/" className="button-primary">
        返回首页
      </Link>
    </section>
  );
}
