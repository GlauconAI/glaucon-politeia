export type CollectionSlug =
  | "learn"
  | "sites"
  | "fragments"
  | "family"
  | "products"
  | "archive";

export type CollectionRoute = {
  command: string;
  contentFormat?: "html" | "markdown";
  description: string;
  href: `/${CollectionSlug}`;
  label: string;
  meta: string;
  tagSlugs: string[];
};

export const collectionRoutes: CollectionRoute[] = [
  {
    href: "/learn",
    label: "Learn",
    meta: "~/learn",
    command: "open learn",
    description: "AI coding notes, reading trails, and research fragments.",
    tagSlugs: ["vibe-coding"],
  },
  {
    href: "/sites",
    label: "Sites",
    meta: "~/sites",
    command: "list artifacts",
    description: "Published HTML artifacts, reports, itineraries, and standalone pages.",
    contentFormat: "html",
    tagSlugs: [],
  },
  {
    href: "/fragments",
    label: "Fragments",
    meta: "~/fragments",
    command: "grep thoughts",
    description: "Essays, observations, working thoughts, and unfinished notes.",
    tagSlugs: ["fragments"],
  },
  {
    href: "/family",
    label: "Family",
    meta: "~/family",
    command: "mount family",
    description: "Trip plans, home references, and family archives.",
    tagSlugs: ["family"],
  },
  {
    href: "/products",
    label: "Products",
    meta: "~/products",
    command: "open products",
    description: "Ideas, experiments, product notes, and company-facing work.",
    tagSlugs: ["projects"],
  },
  {
    href: "/archive",
    label: "Archive",
    meta: "~/archive",
    command: "find *",
    description: "Everything placed here, searchable and ready to resurface.",
    tagSlugs: [],
  },
];

export function collectionForPath(slug: string) {
  return collectionRoutes.find((route) => route.href === `/${slug}`);
}

export function collectionQueryForPath(slug: string) {
  const collection = collectionForPath(slug);

  if (!collection) {
    return null;
  }

  return {
    contentFormat: collection.contentFormat,
    tagSlugs: collection.tagSlugs,
  };
}
