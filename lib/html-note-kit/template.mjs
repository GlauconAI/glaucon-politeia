export function renderHtmlDocument({ metadata, articleHtml, headings }) {
  const title = escapeHtml(metadata.title);
  const description = escapeHtml(metadata.description);
  const eyebrow = escapeHtml(metadata.eyebrow);
  const lang = escapeHtml(metadata.lang);
  const navigation = headings
    .filter((heading) => heading.level === 2 || heading.level === 3)
    .map(
      (heading) =>
        `<li class="toc-level-${heading.level}"><a href="#${escapeHtml(heading.id)}">${escapeHtml(heading.text)}</a></li>`,
    )
    .join("");

  return `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${description}">
  <meta name="generator" content="402v HTML Note Kit">
  <title>${title}</title>
  <style>
    :root {
      --note-bg: #f7f7f4;
      --note-panel: #ffffff;
      --note-panel-muted: #f0f1ed;
      --note-border: #deded6;
      --note-border-strong: #b8b8ad;
      --note-text: #22231f;
      --note-muted: #686a61;
      --note-strong: #11120f;
      --note-accent: #1d4ed8;
      --note-accent-strong: #173c9f;
      --note-accent-soft: #e8eefc;
      --note-code: #161816;
      --note-success: #047857;
      --note-warning: #925f00;
      color-scheme: light;
      font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      background:
        radial-gradient(circle at 10% -10%, rgba(29, 78, 216, 0.08), transparent 32rem),
        var(--note-bg);
      color: var(--note-text);
      line-height: 1.72;
      text-rendering: optimizeLegibility;
    }

    a { color: var(--note-accent-strong); text-underline-offset: 0.18em; }
    a:hover { color: var(--note-accent); }
    a:focus-visible { outline: 3px solid rgba(29, 78, 216, 0.35); outline-offset: 3px; border-radius: 3px; }

    .note-shell {
      width: min(1180px, calc(100% - 32px));
      margin: 0 auto;
      display: grid;
      grid-template-columns: minmax(0, 760px) 240px;
      gap: 56px;
      padding: 72px 0 96px;
      align-items: start;
    }

    .note-main { min-width: 0; }
    .note-header {
      border-bottom: 1px solid var(--note-border-strong);
      padding-bottom: 32px;
      margin-bottom: 40px;
    }
    .note-eyebrow {
      margin: 0 0 14px;
      color: var(--note-accent-strong);
      font-size: 0.76rem;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .note-header h1 {
      max-width: 15ch;
      margin: 0;
      color: var(--note-strong);
      font-family: Georgia, "Times New Roman", serif;
      font-size: clamp(2.6rem, 7vw, 5.8rem);
      font-weight: 600;
      letter-spacing: -0.055em;
      line-height: 0.98;
    }
    .note-description {
      max-width: 58ch;
      margin: 24px 0 0;
      color: var(--note-muted);
      font-size: clamp(1.05rem, 2vw, 1.28rem);
    }

    .note-article > h1:first-child { display: none; }
    .note-article h2,
    .note-article h3 {
      color: var(--note-strong);
      scroll-margin-top: 24px;
      line-height: 1.18;
    }
    .note-article h2 {
      margin: 64px 0 20px;
      padding-top: 16px;
      border-top: 1px solid var(--note-border);
      font-family: Georgia, "Times New Roman", serif;
      font-size: clamp(1.8rem, 4vw, 2.7rem);
      letter-spacing: -0.035em;
    }
    .note-article h3 { margin: 38px 0 14px; font-size: 1.28rem; }
    .note-article p { margin: 0 0 1.25em; }
    .note-article strong { color: var(--note-strong); }
    .note-article ul,
    .note-article ol { margin: 0 0 1.4em; padding-left: 1.4em; }
    .note-article li { margin: 0.42em 0; padding-left: 0.2em; }
    .note-article li::marker { color: var(--note-accent); }
    .note-article .contains-task-list { padding-left: 0; list-style: none; }
    .note-article .task-list-item { display: flex; gap: 10px; align-items: baseline; }
    .note-article input[type="checkbox"] { accent-color: var(--note-accent); }

    .note-article blockquote {
      margin: 28px 0;
      border: 1px solid var(--note-border);
      border-left: 4px solid var(--note-accent);
      border-radius: 0 10px 10px 0;
      background: var(--note-panel);
      padding: 18px 22px;
      color: var(--note-muted);
    }
    .note-article blockquote p:last-child { margin-bottom: 0; }
    .note-article .callout::before {
      content: attr(data-callout-label);
      display: block;
      margin-bottom: 5px;
      color: var(--note-accent-strong);
      font-size: 0.7rem;
      font-weight: 850;
      letter-spacing: 0.1em;
    }
    .note-article .callout-warning,
    .note-article .callout-caution { border-left-color: var(--note-warning); }
    .note-article .callout-warning::before,
    .note-article .callout-caution::before { color: var(--note-warning); }

    .note-article table {
      width: 100%;
      margin: 28px 0;
      border-collapse: collapse;
      border: 1px solid var(--note-border);
      background: var(--note-panel);
      font-size: 0.94rem;
    }
    .note-article th,
    .note-article td { border-bottom: 1px solid var(--note-border); padding: 12px 14px; text-align: left; }
    .note-article th { background: var(--note-panel-muted); color: var(--note-strong); font-weight: 750; }
    .note-article tr:last-child td { border-bottom: 0; }

    .note-article pre {
      margin: 28px 0;
      overflow-x: auto;
      border-radius: 10px;
      background: var(--note-code);
      color: #f4f5ef;
      padding: 18px 20px;
      font-size: 0.88rem;
      line-height: 1.62;
    }
    .note-article code {
      border-radius: 5px;
      background: var(--note-panel-muted);
      padding: 0.16em 0.38em;
      font-family: "SFMono-Regular", Consolas, monospace;
      font-size: 0.88em;
    }
    .note-article pre code { background: transparent; padding: 0; font-size: inherit; }

    .note-article img {
      max-width: 100%;
      height: auto;
      margin: 28px auto;
      display: block;
      border: 1px solid var(--note-border);
      border-radius: 10px;
      background: var(--note-panel);
    }

    .flow-diagram {
      margin: 32px 0;
      overflow-x: auto;
      border: 1px solid var(--note-border);
      border-radius: 12px;
      background: var(--note-panel);
      padding: 18px;
    }
    .flow-diagram svg { width: 100%; min-width: 580px; height: auto; display: block; }
    .flow-edge path { fill: none; stroke: var(--note-border-strong); stroke-width: 2; }
    #flow-arrow path { fill: var(--note-border-strong); }
    .flow-edge-label { fill: var(--note-muted); font-size: 11px; paint-order: stroke; stroke: var(--note-panel); stroke-width: 5px; }
    .flow-node rect,
    .flow-node > path { fill: var(--note-panel-muted); stroke: var(--note-border-strong); stroke-width: 1.5; }
    .flow-node-decision > path { fill: var(--note-accent-soft); stroke: var(--note-accent); }
    .flow-node text { fill: var(--note-strong); font-size: 13px; font-weight: 700; }

    .note-toc {
      position: sticky;
      top: 24px;
      border-left: 1px solid var(--note-border);
      padding-left: 20px;
      font-size: 0.84rem;
    }
    .note-toc strong {
      color: var(--note-strong);
      font-size: 0.72rem;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }
    .note-toc ol { margin: 14px 0 0; padding: 0; list-style: none; }
    .note-toc li { margin: 7px 0; }
    .note-toc .toc-level-3 { padding-left: 12px; }
    .note-toc a { color: var(--note-muted); text-decoration: none; }
    .note-toc a:hover { color: var(--note-accent-strong); }

    .note-footer {
      margin-top: 72px;
      border-top: 1px solid var(--note-border);
      padding-top: 18px;
      color: var(--note-muted);
      font-size: 0.78rem;
    }

    @media (max-width: 920px) {
      .note-shell { grid-template-columns: minmax(0, 1fr); width: min(760px, calc(100% - 28px)); padding-top: 46px; }
      .note-toc { display: none; }
    }
    @media (max-width: 560px) {
      .note-header h1 { font-size: 2.7rem; }
      .note-article table { display: block; overflow-x: auto; }
      .flow-diagram { margin-inline: -7px; padding: 10px; }
    }
    @media print {
      body { background: white; }
      .note-shell { display: block; width: 100%; padding: 0; }
      .note-toc { display: none; }
      .note-article a { color: inherit; text-decoration: none; }
      .note-article h2 { break-after: avoid; }
      .note-article pre,
      .flow-diagram,
      .note-article table { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="note-shell">
    <main class="note-main">
      <header class="note-header">
        <p class="note-eyebrow">${eyebrow}</p>
        <h1>${title}</h1>
        ${description ? `<p class="note-description">${description}</p>` : ""}
      </header>
      <article class="note-article">${articleHtml}</article>
      <footer class="note-footer">Built with 402v HTML Note Kit · standalone HTML</footer>
    </main>
    ${navigation ? `<nav class="note-toc" aria-label="Table of contents"><strong>Contents</strong><ol>${navigation}</ol></nav>` : ""}
  </div>
</body>
</html>
`;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
