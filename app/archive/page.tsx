import { CollectionPage } from "@/app/collection-page";

type ArchivePageProps = {
  searchParams: Promise<{ page?: string }>;
};

function parsePage(value?: string) {
  const page = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

export default async function ArchivePage({ searchParams }: ArchivePageProps) {
  const { page } = await searchParams;

  return <CollectionPage slug="archive" page={parsePage(page)} />;
}
