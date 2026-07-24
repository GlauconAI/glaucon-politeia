#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";

import { parseMarkdownDocument } from "../lib/html-note-kit/frontmatter.mjs";
import { renderMarkdown } from "../lib/html-note-kit/render.mjs";
import { renderHtmlDocument } from "../lib/html-note-kit/template.mjs";

const values = process.argv.slice(2);
const command = values[0];

try {
  if (command === "init") {
    initNote(values.slice(1));
  } else if (command === "build") {
    buildNote(values.slice(1));
  } else if (command === "--help" || command === "-h" || !command) {
    process.stdout.write(helpText());
  } else {
    throw new Error(`Unknown command: ${command}\n\n${helpText()}`);
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

function initNote(args) {
  const targetDirectory = positional(args, 0);
  const title = flag(args, "--title");
  const force = args.includes("--force");

  if (!targetDirectory) {
    throw new Error("Usage: html-note-kit init <directory> --title <title>");
  }
  if (!title?.trim()) {
    throw new Error("--title is required");
  }

  const directory = resolve(targetDirectory);
  const sourcePath = join(directory, "note.md");
  if (existsSync(sourcePath) && !force) {
    throw new Error(`Source already exists: ${sourcePath}`);
  }

  mkdirSync(directory, { recursive: true });
  writeFileSync(sourcePath, starterMarkdown(title.trim()), "utf8");
  printResult({ command: "init", source: sourcePath });
}

function buildNote(args) {
  const inputValue = positional(args, 0);
  const outputValue = flag(args, "--output");
  const force = args.includes("--force");

  if (!inputValue) {
    throw new Error(
      "Usage: html-note-kit build <input.md> [--output <output.html>] [--force]",
    );
  }

  const inputPath = resolve(inputValue);
  if (!existsSync(inputPath)) {
    throw new Error(`Markdown input not found: ${inputPath}`);
  }
  if (extname(inputPath).toLowerCase() !== ".md") {
    throw new Error("Input must be a .md file");
  }

  const outputPath = resolve(
    outputValue || inputPath.replace(/\.md$/i, ".html"),
  );
  if (existsSync(outputPath) && !force) {
    throw new Error(`Output already exists: ${outputPath}`);
  }

  const source = readFileSync(inputPath, "utf8");
  const { body, metadata } = parseMarkdownDocument(source);
  const { articleHtml, headings } = renderMarkdown(body, {
    sourceDirectory: dirname(inputPath),
  });
  const html = renderHtmlDocument({ metadata, articleHtml, headings });
  verifyGeneratedHtml(html);

  mkdirSync(dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.tmp-${process.pid}`;
  try {
    writeFileSync(temporaryPath, html, "utf8");
    renameSync(temporaryPath, outputPath);
  } finally {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  }

  printResult({
    command: "build",
    source: inputPath,
    output: outputPath,
    title: metadata.title,
    bytes: Buffer.byteLength(html),
  });
}

function verifyGeneratedHtml(html) {
  const checks = [
    [/^<!doctype html>/i, "doctype"],
    [/<title>[^<]+<\/title>/i, "title"],
    [/<style>[\s\S]+<\/style>/i, "inline stylesheet"],
    [/<article class="note-article">[\s\S]+<\/article>/i, "article content"],
  ];

  for (const [pattern, label] of checks) {
    if (!pattern.test(html)) {
      throw new Error(`Generated HTML is missing ${label}`);
    }
  }
  if (/<script[^>]+src=/i.test(html)) {
    throw new Error("Generated HTML has an external script dependency");
  }
}

function starterMarkdown(title) {
  return `---
title: ${title}
description: Add one sentence that explains why this note matters.
eyebrow: 402v Knowledge
---

# ${title}

Write the core idea here.

## Key idea

> [!NOTE]
> Use a short callout for the decisive point.

## Flow

\`\`\`mermaid
flowchart LR
A[Source] --> B{Review}
B -->|pass| C[Standalone HTML]
B -->|revise| D[Revise]
D --> A
\`\`\`

## Details

| Part | Purpose |
| --- | --- |
| Markdown | Optional writing input |
| HTML | Primary reading and publishing artifact |
`;
}

function positional(args, index) {
  const values = [];
  for (let cursor = 0; cursor < args.length; cursor += 1) {
    if (args[cursor].startsWith("--")) {
      if (args[cursor] === "--title" || args[cursor] === "--output") {
        cursor += 1;
      }
      continue;
    }
    values.push(args[cursor]);
  }
  return values[index];
}

function flag(args, name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function printResult(result) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function helpText() {
  return `402v HTML Note Kit

Usage:
  node scripts/html-note-kit.mjs init <directory> --title <title> [--force]
  node scripts/html-note-kit.mjs build <input.md> [--output <output.html>] [--force]
`;
}
