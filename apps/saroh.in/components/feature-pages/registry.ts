import type { ReactElement } from "react";

import type { KeepSlug } from "@/content/feature-keep";
import type { FeatureSlug } from "@/content/types";

import { AiAppsPage } from "./ai-apps";
import { AskAiPage } from "./ask-ai";
import { SocialPage } from "./social";
import { WebsitePage } from "./website";

/**
 * Which page draws each feature (DEC-221, three kinds): every record
 * feature is a Keep page (`keep-page.tsx`, the Orders template, by slug);
 * Website, Share, Ask AI and AI apps each have their own component here.
 */
export const BESPOKE: Record<
    Exclude<FeatureSlug, KeepSlug>,
    () => Promise<ReactElement>
> = {
    website: WebsitePage,
    social: SocialPage,
    "ask-ai": AskAiPage,
    "ai-apps": AiAppsPage,
};
