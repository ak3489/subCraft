import type { MetadataRoute } from "next";

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL}/`,
      lastModified: new Date(),
      priority: 1.0,
    },
    {
      url: `${SITE_URL}/guide`,
      lastModified: new Date(),
      priority: 0.8,
    },
  ];
}
