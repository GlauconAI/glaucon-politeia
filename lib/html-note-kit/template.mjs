export const BASE_402V_STYLES = `    :root {
      --note-bg: #0d0e10;
      --note-panel: #15171b;
      --note-panel-muted: #1d2026;
      --note-panel-soft: #111318;
      --note-border: #2c3038;
      --note-border-strong: #4e5664;
      --note-text: #e8eaed;
      --note-muted: #969da9;
      --note-strong: #ffffff;
      --note-accent: #7c3aed;
      --note-accent-strong: #a78bfa;
      --note-accent-soft: #211a34;
      --note-success: #43d38b;
      --note-warning: #f2b84b;
      --note-danger: #fb7185;
      --note-shadow: 0 20px 60px rgba(0, 0, 0, 0.24);
      --note-mono: "SFMono-Regular", "Cascadia Code", "Roboto Mono", ui-monospace, monospace;
      --note-sans: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color-scheme: dark;
      font-family: var(--note-sans);
    }

    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      background:
        linear-gradient(#191b20 1px, transparent 1px),
        linear-gradient(90deg, #191b20 1px, transparent 1px),
        radial-gradient(circle at 20% -10%, rgba(124, 58, 237, 0.11), transparent 34rem),
        var(--note-bg);
      background-size: 44px 44px, 44px 44px, auto, auto;
      color: var(--note-text);
      line-height: 1.68;
      text-rendering: optimizeLegibility;
    }

    a { color: var(--note-accent-strong); text-underline-offset: 0.18em; }
    a:hover { color: var(--note-strong); }
    a:focus-visible {
      border-radius: 4px;
      outline: 3px solid rgba(124, 58, 237, 0.4);
      outline-offset: 3px;
    }

    .artifact-topbar {
      position: sticky;
      z-index: 20;
      top: 0;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(13, 14, 16, 0.88);
      backdrop-filter: blur(16px);
    }
    .artifact-topbar-inner {
      display: grid;
      width: min(1200px, calc(100% - 32px));
      min-height: 64px;
      margin: 0 auto;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 12px;
      align-items: center;
      font-family: var(--note-mono);
    }
    .artifact-brand {
      color: var(--note-strong);
      font-size: 18px;
      font-weight: 750;
      text-decoration: none;
    }
    .artifact-path {
      min-width: 0;
      overflow: hidden;
      color: var(--note-success);
      font-size: 12px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .artifact-topbar-status,
    .artifact-status span,
    .artifact-meta dt {
      width: fit-content;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.035);
      color: var(--note-muted);
      padding: 4px 9px;
      font-family: var(--note-mono);
      font-size: 11px;
    }
    .artifact-topbar-status {
      border-color: rgba(67, 211, 139, 0.4);
      color: var(--note-success);
    }

    .artifact-shell {
      width: min(1200px, calc(100% - 32px));
      margin: 0 auto;
      padding: 34px 0 72px;
    }
    .artifact-hero,
    .artifact-main-panel,
    .artifact-rail-panel {
      border: 1px solid rgba(255, 255, 255, 0.09);
      border-radius: 8px;
      background: rgba(18, 20, 25, 0.9);
      box-shadow: var(--note-shadow);
    }
    .artifact-hero {
      min-height: 300px;
      padding: 24px;
    }
    .note-eyebrow {
      margin: 0 0 18px;
      color: var(--note-accent-strong);
      font-family: var(--note-mono);
      font-size: 0.74rem;
      font-weight: 800;
      letter-spacing: 0.11em;
      text-transform: uppercase;
    }
    .artifact-hero h1 {
      max-width: 18ch;
      margin: 0;
      color: var(--note-strong);
      font-family: var(--note-mono);
      font-size: clamp(2.2rem, 6vw, 3.5rem);
      font-weight: 650;
      letter-spacing: -0.045em;
      line-height: 1.03;
    }
    .note-description {
      max-width: 68ch;
      margin: 24px 0 0;
      color: var(--note-text);
      font-family: var(--note-mono);
      font-size: clamp(1rem, 2vw, 1.18rem);
      line-height: 1.5;
    }
    .artifact-status {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 32px;
    }
    .artifact-status span:first-child {
      border-color: rgba(67, 211, 139, 0.4);
      color: var(--note-success);
    }

    .artifact-layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(240px, 280px);
      gap: 10px;
      margin-top: 10px;
      align-items: start;
    }
    .artifact-main-panel {
      min-width: 0;
      padding: 28px;
    }
    .artifact-rail {
      position: sticky;
      top: 74px;
      display: grid;
      gap: 10px;
    }
    .artifact-rail-panel { padding: 16px; }

    .note-article > h1:first-child { display: none; }
    .note-article h2,
    .note-article h3 {
      color: var(--note-strong);
      scroll-margin-top: 84px;
      line-height: 1.2;
    }
    .note-article h2 {
      margin: 54px 0 18px;
      padding-top: 18px;
      border-top: 1px solid var(--note-border);
      font-size: clamp(1.55rem, 4vw, 2rem);
      font-weight: 750;
      letter-spacing: -0.025em;
    }
    .note-article h3 { margin: 34px 0 13px; font-size: 1.22rem; }
    .note-article p { margin: 0 0 1.2em; }
    .note-article strong { color: var(--note-strong); }
    .note-article ul,
    .note-article ol { margin: 0 0 1.4em; padding-left: 1.4em; }
    .note-article li { margin: 0.42em 0; padding-left: 0.2em; }
    .note-article li::marker { color: var(--note-accent-strong); }
    .note-article .contains-task-list { padding-left: 0; list-style: none; }
    .note-article .task-list-item { display: flex; gap: 10px; align-items: baseline; }
    .note-article input[type="checkbox"] { accent-color: var(--note-success); }

    .note-article blockquote {
      margin: 26px 0;
      border: 1px solid var(--note-border);
      border-left: 3px solid var(--note-accent);
      border-radius: 8px;
      background: var(--note-panel-soft);
      padding: 16px 18px;
      color: var(--note-muted);
    }
    .note-article blockquote p:last-child { margin-bottom: 0; }
    .note-article .callout::before {
      content: attr(data-callout-label);
      display: block;
      margin-bottom: 5px;
      color: var(--note-accent-strong);
      font-family: var(--note-mono);
      font-size: 0.68rem;
      font-weight: 850;
      letter-spacing: 0.1em;
    }
    .note-article .callout-warning,
    .note-article .callout-caution { border-left-color: var(--note-warning); }
    .note-article .callout-warning::before,
    .note-article .callout-caution::before { color: var(--note-warning); }

    .note-article table {
      width: 100%;
      margin: 26px 0;
      border-collapse: collapse;
      border: 1px solid var(--note-border);
      background: var(--note-panel-soft);
      font-size: 0.92rem;
    }
    .note-article th,
    .note-article td {
      border-bottom: 1px solid var(--note-border);
      padding: 11px 13px;
      text-align: left;
      vertical-align: top;
    }
    .note-article th {
      background: var(--note-panel-muted);
      color: var(--note-strong);
      font-family: var(--note-mono);
      font-weight: 700;
    }
    .note-article tr:last-child td { border-bottom: 0; }

    .note-article pre {
      margin: 26px 0;
      overflow-x: auto;
      border: 1px solid var(--note-border);
      border-radius: 8px;
      background: #0b0c0e;
      color: var(--note-text);
      padding: 17px 18px;
      font-size: 0.86rem;
      line-height: 1.62;
    }
    .note-article code {
      border-radius: 5px;
      background: var(--note-panel-muted);
      color: var(--note-accent-strong);
      padding: 0.16em 0.38em;
      font-family: var(--note-mono);
      font-size: 0.88em;
    }
    .note-article pre code { background: transparent; color: inherit; padding: 0; font-size: inherit; }

    .note-article img {
      display: block;
      max-width: 100%;
      height: auto;
      margin: 26px auto;
      border: 1px solid var(--note-border);
      border-radius: 8px;
      background: var(--note-panel);
    }

    .flow-diagram {
      margin: 28px 0;
      overflow-x: auto;
      border: 1px solid var(--note-border);
      border-radius: 8px;
      background: var(--note-panel-soft);
      padding: 16px;
    }
    .flow-diagram svg { display: block; width: 100%; min-width: 580px; height: auto; }
    .flow-edge path { fill: none; stroke: var(--note-border-strong); stroke-width: 2; }
    #flow-arrow path { fill: var(--note-border-strong); }
    .flow-edge-label {
      fill: var(--note-muted);
      font-family: var(--note-mono);
      font-size: 11px;
      paint-order: stroke;
      stroke: var(--note-panel-soft);
      stroke-width: 5px;
    }
    .flow-node rect,
    .flow-node > path { fill: var(--note-panel-muted); stroke: var(--note-border-strong); stroke-width: 1.5; }
    .flow-node-decision > path { fill: var(--note-accent-soft); stroke: var(--note-accent); }
    .flow-node text { fill: var(--note-strong); font-family: var(--note-mono); font-size: 13px; font-weight: 700; }

    .note-toc strong,
    .artifact-meta h2 {
      display: block;
      margin: 0;
      color: var(--note-strong);
      font-family: var(--note-mono);
      font-size: 0.7rem;
      letter-spacing: 0.11em;
      text-transform: uppercase;
    }
    .note-toc ol { margin: 14px 0 0; padding: 0; list-style: none; }
    .note-toc li { margin: 7px 0; }
    .note-toc .toc-level-3 { padding-left: 12px; }
    .note-toc a { color: var(--note-muted); text-decoration: none; font-size: 0.83rem; }
    .note-toc a:hover { color: var(--note-accent-strong); }

    .artifact-meta dl { display: grid; gap: 10px; margin: 14px 0 0; }
    .artifact-meta div { min-width: 0; }
    .artifact-meta dt { padding: 3px 7px; }
    .artifact-meta dd {
      margin: 5px 0 0;
      overflow-wrap: anywhere;
      color: var(--note-text);
      font-family: var(--note-mono);
      font-size: 0.78rem;
    }
    .note-footer {
      margin-top: 64px;
      border-top: 1px solid var(--note-border);
      padding-top: 16px;
      color: var(--note-muted);
      font-family: var(--note-mono);
      font-size: 0.75rem;
    }

    @media (max-width: 900px) {
      .artifact-layout { grid-template-columns: minmax(0, 1fr); }
      .artifact-rail { position: static; grid-row: 1; grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .artifact-hero { min-height: 260px; }
    }
    @media (max-width: 640px) {
      .artifact-topbar-inner,
      .artifact-shell { width: calc(100% - 20px); }
      .artifact-topbar-inner { grid-template-columns: auto minmax(0, 1fr); }
      .artifact-topbar-status { display: none; }
      .artifact-shell { padding: 20px 0 48px; }
      .artifact-hero,
      .artifact-main-panel,
      .artifact-rail-panel { padding: 14px; }
      .artifact-hero h1 { font-size: 2rem; }
      .artifact-rail { grid-template-columns: minmax(0, 1fr); }
      .note-toc { display: none; }
      .note-article table { display: block; overflow-x: auto; }
      .flow-diagram { padding: 10px; }
    }
    @media print {
      :root {
        --note-bg: #ffffff;
        --note-panel: #ffffff;
        --note-panel-muted: #f3f4f6;
        --note-panel-soft: #ffffff;
        --note-border: #d1d5db;
        --note-border-strong: #9ca3af;
        --note-text: #202124;
        --note-muted: #5f6368;
        --note-strong: #000000;
      }
      body { background: white; }
      .artifact-topbar,
      .artifact-rail { display: none; }
      .artifact-shell { width: 100%; padding: 0; }
      .artifact-hero,
      .artifact-main-panel { border: 0; box-shadow: none; padding-inline: 0; }
      .artifact-layout { display: block; }
      .note-article h2 { break-after: avoid; }
      .note-article pre,
      .flow-diagram,
      .note-article table { break-inside: avoid; }
    }`;

export function render402vBaseStyles() {
  return BASE_402V_STYLES;
}

export function renderHtmlDocument({ metadata, articleHtml, headings }) {
  const title = escapeHtml(metadata.title);
  const description = escapeHtml(metadata.description);
  const eyebrow = escapeHtml(metadata.eyebrow);
  const lang = escapeHtml(metadata.lang);
  const slug = escapeHtml(slugify(metadata.title));
  const navigation = headings
    .filter((heading) => heading.level === 2 || heading.level === 3)
    .map(
      (heading) =>
        `<li class="toc-level-${heading.level}"><a href="#${escapeHtml(heading.id)}">${escapeHtml(heading.text)}</a></li>`,
    )
    .join("");

  return render402vShell({
    lang,
    head: `  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${description}">
  <meta name="generator" content="402v HTML Note Kit">
  <title>${title}</title>
  <style>
${BASE_402V_STYLES}
  </style>`,
    body: `  <header class="artifact-topbar">
    <div class="artifact-topbar-inner">
      <a class="artifact-brand" href="https://402v.com">402v</a>
      <span class="artifact-path">~/sites/${slug}</span>
      <span class="artifact-topbar-status">artifact: standalone</span>
    </div>
  </header>
  <div class="artifact-shell">
    <header class="artifact-hero">
      <p class="note-eyebrow">${eyebrow}</p>
      <h1>${title}</h1>
      ${description ? `<p class="note-description">&gt; ${description}</p>` : ""}
      <div class="artifact-status" aria-label="Artifact status">
        <span>status: ready</span>
        <span>target: 402v</span>
        <span>runtime: offline</span>
      </div>
    </header>
    <div class="artifact-layout">
      <main class="artifact-main-panel">
        <article class="note-article">${articleHtml}</article>
        <footer class="note-footer">402v HTML Note Kit · standalone HTML</footer>
      </main>
      <aside class="artifact-rail" aria-label="Artifact information">
        ${navigation ? `<nav class="artifact-rail-panel note-toc" aria-label="Table of contents"><strong>Contents</strong><ol>${navigation}</ol></nav>` : ""}
        <section class="artifact-rail-panel artifact-meta">
          <h2>Artifact</h2>
          <dl>
            <div><dt>format</dt><dd>HTML</dd></div>
            <div><dt>layout</dt><dd>402v / note</dd></div>
            <div><dt>delivery</dt><dd>local · 402v</dd></div>
          </dl>
        </section>
      </aside>
    </div>
  </div>`,
  });
}

function slugify(value) {
  const slug = String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\u3400-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
  return slug || "html-artifact";
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function render402vShell({ lang, head, body }) {
  return `<!doctype html>
<html lang="${lang}">
<head>
${head}
</head>
<body>
${body}
</body>
</html>
`;
}

export { escapeHtml, slugify };
