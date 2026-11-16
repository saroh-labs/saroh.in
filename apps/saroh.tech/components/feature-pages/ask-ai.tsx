import { AskAiView } from "@saroh/marketing/feature-pages/ask-ai-page";

import { askAiWords } from "@/content/reach-ask-ai";
import { WORLD } from "@/content/world";
import { pageSite } from "@/lib/page-site";
import { paidPlansOn } from "@/lib/plans";

import { featureName, inTheAppData, REACH_CRUMB } from "./data";

/** /features/ask-ai: saroh.in's Ask page with Global's words and world. */
export async function AskAiPage() {
    const plansOn = await paidPlansOn();
    const site = pageSite();
    return (
        <AskAiView
            site={site}
            words={askAiWords({
                stockOn: site.claimOn("ask-ai-stock"),
                plansOn,
            })}
            world={WORLD}
            crumb={REACH_CRUMB}
            featureName={featureName}
            inTheApp={inTheAppData("ask-ai")}
        />
    );
}
