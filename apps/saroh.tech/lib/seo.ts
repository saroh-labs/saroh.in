import type { Metadata } from "next";

import { site } from "@/site.config";

import type { SitePage } from "./site-map";

/** Self-referencing, https, no trailing slash, no query string. */
export const canonicalOf = (path: string) =>
    path === "/" ? site.url : `${site.url}${path}`;

export function pageMetadata(page: SitePage): Metadata {
    return {
        title: { absolute: page.title },
        description: page.description,
        alternates: { canonical: canonicalOf(page.path) },
        openGraph: {
            title: page.title,
            description: page.description,
            url: canonicalOf(page.path),
            siteName: site.name,
            type: "website",
        },
        ...(page.unreviewed && {
            robots: { index: false, follow: true },
        }),
    };
}
