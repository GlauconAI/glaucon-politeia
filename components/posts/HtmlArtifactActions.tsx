"use client";

type HtmlArtifactActionsProps = {
  html: string;
  title: string;
};

function artifactDataUrl(html: string) {
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

export function HtmlArtifactActions({ html, title }: HtmlArtifactActionsProps) {
  const dataUrl = artifactDataUrl(html);

  async function copyArtifactLink() {
    await navigator.clipboard?.writeText(window.location.href);
  }

  return (
    <div className="artifact-actions">
      <a className="button-secondary" href={dataUrl} target="_blank" rel="noreferrer">
        Open artifact
      </a>
      <a className="button-secondary" href={dataUrl} download={`${title || "artifact"}.html`}>
        Download HTML
      </a>
      <button className="button-secondary" type="button" onClick={copyArtifactLink}>
        Copy artifact link
      </button>
    </div>
  );
}
