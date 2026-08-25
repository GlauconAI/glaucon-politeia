import { permanentRedirect } from "next/navigation";

type WorkItemPageProps = {
  params: Promise<{ id: string }>;
};

export default async function LegacyWorkItemPage({ params }: WorkItemPageProps) {
  const { id } = await params;
  permanentRedirect(`/work-tracker/items/${id}`);
}
