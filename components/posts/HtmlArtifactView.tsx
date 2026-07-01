type HtmlArtifactViewProps = {
  html: string;
  title: string;
};

export function HtmlArtifactView({ html, title }: HtmlArtifactViewProps) {
  return (
    <iframe
      className="html-artifact-frame"
      sandbox=""
      srcDoc={html}
      title={title}
    />
  );
}
