export function getSafeRedirectPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  try {
    const url = new URL(value, "https://glaucon.local");

    if (url.origin !== "https://glaucon.local") {
      return "/";
    }

    if (url.pathname === "/auth" || url.pathname.startsWith("/auth/")) {
      return "/";
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}
