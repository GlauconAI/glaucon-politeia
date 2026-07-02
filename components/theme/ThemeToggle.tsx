"use client";

import { useState } from "react";

import { themeStorageKey } from "@/lib/theme/init";

type ThemeMode = "light" | "dark" | "system";

function resolveTheme(mode: ThemeMode) {
  if (mode === "system") {
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  return mode;
}

function applyTheme(mode: ThemeMode) {
  const resolved = resolveTheme(mode);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.style.colorScheme = resolved;
}

function readStoredTheme(): ThemeMode {
  if (typeof window === "undefined") {
    return "system";
  }

  const saved = window.localStorage?.getItem?.(themeStorageKey);
  return saved === "light" || saved === "dark" || saved === "system"
    ? saved
    : "system";
}

export function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(readStoredTheme);
  const modeLabel =
    mode === "system" ? "System" : mode === "light" ? "Light" : "Dark";

  function cycleTheme() {
    const next = mode === "system" ? "light" : mode === "light" ? "dark" : "system";
    setMode(next);
    window.localStorage?.setItem?.(themeStorageKey, next);
    applyTheme(next);
  }

  return (
    <button
      type="button"
      className="theme-button"
      aria-label={`Theme: ${mode}`}
      title={`Theme: ${mode}`}
      onClick={cycleTheme}
      suppressHydrationWarning
    >
      Theme: {modeLabel}
    </button>
  );
}
