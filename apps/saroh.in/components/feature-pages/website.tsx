import { LegacyFeaturePage } from "./legacy-feature-page";

/**
 * /features/website: a stub for agent reach, which replaces this file with the
 * page's own design. Until then it draws the page as it was.
 */
export async function WebsitePage() {
    return LegacyFeaturePage({ slug: "website" });
}
