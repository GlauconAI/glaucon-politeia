import type { MetadataRoute } from "next";

const siteUrl = "https://402v.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/editor", "/admin", "/profile"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
