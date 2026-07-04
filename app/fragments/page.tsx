import { CollectionPage } from "@/app/collection-page";
import { EarthRevolutionFeature } from "@/components/earth/EarthRevolutionFeature";

export default function FragmentsPage() {
  return (
    <section className="home-stack">
      <EarthRevolutionFeature />
      <CollectionPage slug="fragments" />
    </section>
  );
}
