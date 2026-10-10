import type { MetadataRoute } from "next";

import { APP_MANIFEST } from "@/lib/pwa/manifest";

/**
 * `/manifest.webmanifest`, which Next links from every page's head. What
 * it says is `lib/pwa/manifest.ts`.
 */
export default function manifest(): MetadataRoute.Manifest {
    return APP_MANIFEST;
}
