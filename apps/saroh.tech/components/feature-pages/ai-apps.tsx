import { AiAppsView } from "@saroh/marketing/feature-pages/ai-apps-page";

import { DEVELOPERS_PATH } from "@/content/developers";
import { features } from "@/content/features";
import { AI_APP_CARDS } from "@/content/integrations";
import { aiAppsWords } from "@/content/reach-ai-apps";
import { WORLD } from "@/content/world";
import { featuresOff } from "@/lib/feature-switches";
import { pageSite } from "@/lib/page-site";

import { inTheAppData, REACH_CRUMB } from "./data";

/** /features/ai-apps: saroh.in's Connect page with Global's words and world. */
export function AiAppsPage() {
    const apps = features["ai-apps"].apps;
    return Promise.resolve(
        <AiAppsView
            site={pageSite()}
            words={aiAppsWords()}
            world={WORLD}
            crumb={REACH_CRUMB}
            inTheApp={inTheAppData("ai-apps")}
            apps={apps ? { words: apps, list: AI_APP_CARDS } : null}
            // Developers, as on saroh.in, while its switch is on (#41).
            developersHref={
                featuresOff().includes("developers") ? null : DEVELOPERS_PATH
            }
        />,
    );
}
