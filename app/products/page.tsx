import { CollectionPage } from "@/app/collection-page";
import { PodcastFeature } from "@/components/podcast/PodcastFeature";
import { loadXiaoyuzhouPodcast } from "@/lib/podcast/xiaoyuzhou";

export default async function ProductsPage() {
  const podcast = await loadXiaoyuzhouPodcast();

  return (
    <>
      <PodcastFeature podcast={podcast} />
      {await CollectionPage({ slug: "products" })}
    </>
  );
}
