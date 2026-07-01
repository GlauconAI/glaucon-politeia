import Link from "next/link";

const tags = [
  { href: "/tags/vibe-coding", label: "Vibe Coding" },
  { href: "/search?q=html", label: "HTML Sites" },
  { href: "/tags/projects", label: "Projects" },
  { href: "/search?q=family", label: "Family" },
];

export function RightRail() {
  return (
    <aside className="right-rail" aria-label="Site information">
      <section className="panel">
        <p className="eyebrow">Publishing surface</p>
        <h2>402v is the public edge of Glaucon&apos;s knowledge system.</h2>
        <p>Public notes, private pages, HTML artifacts, family references, and product work share one calm shell.</p>
        <div className="panel-actions">
          <Link href="/editor" className="button-primary">
            Publish
          </Link>
          <Link href="/search" className="button-secondary">
            Browse
          </Link>
        </div>
      </section>

      <section className="panel">
        <h2>Active Areas</h2>
        <ul className="tag-list">
          {tags.map((tag) => (
            <li key={tag.href}>
              <Link href={tag.href}>{tag.label}</Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="panel panel-quiet">
        <h2>Access model</h2>
        <p><strong>Public</strong> pages are open on the web. <strong>Private</strong> pages stay behind login.</p>
      </section>
    </aside>
  );
}
