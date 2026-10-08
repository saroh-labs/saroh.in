import type { ImageFacts } from "./image-probe";
import type { LinkFacts } from "./link-report";
import { factsFrom } from "./link-report";
import type { HeadTags } from "./og-parse";

/**
 * The page's "A sample bakery site" chip (design 1b): example-bakery.in is
 * not a real site (it doesn't resolve), so the tool answers it with these
 * fixed tags instead of fetching anything — the design's own example: no
 * description, a 600 × 315 picture, no twitter:card. The report is built
 * by the same `buildReport` as any page, and the result says it's a sample.
 */
export const SAMPLE_HOST = "example-bakery.in";

const TAGS: HeadTags = {
    title: "Example Bakery",
    description: null,
    canonical: "https://example-bakery.in/",
    headEnded: true,
    og: {
        title: "Fresh bread every morning | Example Bakery",
        description: null,
        image: "https://example-bakery.in/cover.jpg",
        imageWidth: 600,
        imageHeight: 315,
        imageType: "image/jpeg",
        url: "https://example-bakery.in/",
        siteName: "Example Bakery",
        type: "website",
    },
    twitter: { card: null, title: null, description: null, image: null },
};

const IMAGE: ImageFacts = {
    url: "https://example-bakery.in/cover.jpg",
    loads: true,
    width: 600,
    height: 315,
    type: "image/jpeg",
    bytes: 96 * 1024,
};

export function isSampleHost(url: URL): boolean {
    return (
        url.hostname === SAMPLE_HOST || url.hostname === `www.${SAMPLE_HOST}`
    );
}

export function sampleFacts(): LinkFacts {
    return factsFrom(TAGS, IMAGE, new URL(`https://${SAMPLE_HOST}/`), 200);
}
