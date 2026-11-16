import { AskAiView } from "@saroh/marketing/feature-pages/ask-ai-page";

import { askAiWords } from "@/content/reach-ask-ai";
import { WORLD } from "@/content/world";
import { pageSite } from "@/lib/page-site";

import { inTheAppData, REACH_CRUMB } from "./data";

/** /features/ask-ai: saroh.in's Ask page with Global's words and world. */
export function AskAiPage() {
    const site = pageSite();
    return Promise.resolve(
        <AskAiView
            site={site}
            words={askAiWords({ stockOn: site.claimOn("ask-ai-stock") })}
            world={WORLD}
            crumb={REACH_CRUMB}
            inTheApp={inTheAppData("ask-ai")}
        />,
    );
}
