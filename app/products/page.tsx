import { CollectionPage } from "@/app/collection-page";
import { ProductShowcase } from "@/components/products/ProductShowcase";
import { loadXiaoyuzhouPodcast } from "@/lib/podcast/xiaoyuzhou";

export default async function ProductsPage() {
  const podcast = await loadXiaoyuzhouPodcast();

  return (
    <>
      <ProductShowcase podcast={podcast} />
      {await CollectionPage({ headingLabel: "Product Notes", slug: "products" })}
    </>
  );
}
