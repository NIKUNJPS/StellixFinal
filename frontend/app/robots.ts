import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Authenticated app surfaces aren't public content — keep them out of the index.
      disallow: ["/admin/", "/dashboard", "/settings", "/login", "/register", "/reset-password", "/forgot-password"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
