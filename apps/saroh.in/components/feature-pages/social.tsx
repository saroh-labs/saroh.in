import { LegacyFeaturePage } from "./legacy-feature-page";

/**
 * /features/social: a stub for agent reach, which replaces this file with the
 * page's own design. Until then it draws the page as it was.
 */
export async function SocialPage() {
    return LegacyFeaturePage({ slug: "social" });
}
