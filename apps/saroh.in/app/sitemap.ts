import type { MetadataRoute } from "next";

import { JOBS } from "@/lib/site-content";

const SITE = "https://www.saroh.in";

/** The marketing pages: home, how it works, coming soon, one per job. */
export default function sitemap(): MetadataRoute.Sitemap {
    return [
        { url: `${SITE}/`, changeFrequency: "weekly", priority: 1 },
        { url: `${SITE}/how-it-works`, changeFrequency: "monthly" },
        { url: `${SITE}/coming-soon`, changeFrequency: "monthly" },
        ...JOBS.map((job) => ({
            url: `${SITE}/${job.key}`,
            changeFrequency: "monthly" as const,
        })),
    ];
}
