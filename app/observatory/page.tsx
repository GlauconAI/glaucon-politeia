import { permanentRedirect } from "next/navigation";

export default function ObservatoryRedirectPage() {
  permanentRedirect("/dashboard");
}
