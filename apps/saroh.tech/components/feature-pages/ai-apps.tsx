import { AiAppsView } from "@saroh/marketing/feature-pages/ai-apps-page";

import { features } from "@/content/features";
import { AI_APP_CARDS } from "@/content/integrations";
import { aiAppsWords } from "@/content/reach-ai-apps";
import { WORLD } from "@/content/world";
import { pageSite } from "@/lib/page-site";

import { featureName, inTheAppData, REACH_CRUMB } from "./data";

/** /features/ai-apps: saroh.in's Connect page with Global's words and world. */
export function AiAppsPage() {
    const apps = features["ai-apps"].apps;
    return Promise.resolve(
        <AiAppsView
            site={pageSite()}
            words={aiAppsWords()}
            world={WORLD}
            crumb={REACH_CRUMB}
            featureName={featureName}
            inTheApp={inTheAppData("ai-apps")}
            apps={apps ? { words: apps, list: AI_APP_CARDS } : null}
            // No Developers page on Global yet: the page links none.
            developersHref={null}
        />,
    );
}
