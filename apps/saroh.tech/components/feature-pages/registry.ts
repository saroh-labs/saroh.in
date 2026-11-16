import type { ReactElement } from "react";

import { AiAppsPage } from "./ai-apps";
import { AskAiPage } from "./ask-ai";
import { SocialPage } from "./social";
import { WebsitePage } from "./website";

/**
 * Which page draws each Reach and Ask feature (DEC-221, as saroh.in's
 * `registry.ts`): Website, Share, Ask AI and AI apps each draw the shared
 * page from `@saroh/marketing/feature-pages` with Global's words and world.
 */
export const BESPOKE: Record<
    "website" | "social" | "ask-ai" | "ai-apps",
    () => Promise<ReactElement>
> = {
    website: WebsitePage,
    social: SocialPage,
    "ask-ai": AskAiPage,
    "ai-apps": AiAppsPage,
};
