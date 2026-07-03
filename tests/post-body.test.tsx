import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PostBody } from "@/components/posts/PostBody";

describe("PostBody", () => {
  it("renders markdown posts with the markdown viewer", () => {
    render(
      <PostBody
        contentFormat="markdown"
        contentMd="# Markdown Post"
        contentHtml=""
        title="Markdown Post"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Markdown Post" }),
    ).toBeInTheDocument();
  });

  it("renders html posts in a sandboxed iframe", () => {
    render(
      <PostBody
        contentFormat="html"
        contentMd=""
        contentHtml="<html><body><h1>Artifact</h1></body></html>"
        title="Artifact"
      />,
    );

    expect(screen.getByText(/artifact preview/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open artifact/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /download html/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy artifact link/i })).toBeInTheDocument();
    const frame = screen.getByTitle("Artifact");
    expect(frame).toHaveAttribute("sandbox", "");
    expect(frame).toHaveAttribute(
      "srcdoc",
      "<html><body><h1>Artifact</h1></body></html>",
    );
  });
});
