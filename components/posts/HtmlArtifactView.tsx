import { HtmlArtifactActions } from "@/components/posts/HtmlArtifactActions";

type HtmlArtifactViewProps = {
  html: string;
  title: string;
};

export function HtmlArtifactView({ html, title }: HtmlArtifactViewProps) {
  return (
    <section className="artifact-preview" aria-label="Artifact preview">
      <div className="artifact-preview-bar">
        <span>artifact preview</span>
        <strong>{title}</strong>
        <HtmlArtifactActions html={html} title={title} />
      </div>
      <iframe
        className="html-artifact-frame"
        sandbox=""
        srcDoc={html}
        title={title}
      />
    </section>
  );
}
