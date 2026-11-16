import { AiAppsView } from "@saroh/marketing/feature-pages/ai-apps-page";

import { aiAppsWords } from "@/content/reach-ai-apps";
import { WORLD } from "@/content/world";
import { claimOn } from "@/lib/feature-switches";
import { pageSite } from "@/lib/page-site";

import { inTheAppData, REACH_CRUMB } from "./reach/data";

/** /features/ai-apps (FMDesk, FMPhone2): the shared page with saroh.in's words and world. */
export function AiAppsPage() {
    return Promise.resolve(
        <AiAppsView
            site={pageSite()}
            words={aiAppsWords({
                plans: claimOn("ai-apps-plans"),
                askPlans: claimOn("ask-ai-plans"),
                languages: claimOn("ask-ai-languages"),
            })}
            world={WORLD}
            crumb={REACH_CRUMB}
            inTheApp={inTheAppData("ai-apps")}
        />,
    );
}
