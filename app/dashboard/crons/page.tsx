import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function destination(params: SearchParams): string {
  const search = new URLSearchParams();
  for (const [key, rawValue] of Object.entries(params)) {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const value of values) {
      if (value !== undefined) search.append(key, value);
    }
  }
  const query = search.toString();
  return `/dashboard/automations${query ? `?${query}` : ""}`;
}

export default async function CronsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  redirect(destination(await searchParams));
}
