import { LegacyFeaturePage } from "./legacy-feature-page";

/**
 * /features/ask-ai: a stub for agent reach, which replaces this file with the
 * page's own design. Until then it draws the page as it was.
 */
export async function AskAiPage() {
    return LegacyFeaturePage({ slug: "ask-ai" });
}
