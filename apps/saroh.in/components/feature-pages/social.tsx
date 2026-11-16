import { SocialView } from "@saroh/marketing/feature-pages/social-page";

import { socialWords } from "@/content/reach-social";
import { WORLD } from "@/content/world";
import { claimOn } from "@/lib/feature-switches";
import { pageSite } from "@/lib/page-site";

import { featureName, inTheAppData, REACH_CRUMB } from "./reach/data";
import { SITE_FONTS } from "./reach/site-fonts";

/** /features/social (FSDesk, FSPhone2): the shared page with saroh.in's words and world. */
export function SocialPage() {
    return Promise.resolve(
        <SocialView
            site={pageSite()}
            words={socialWords({
                everyPlan: claimOn("share-every-plan"),
                posting: claimOn("social-posting"),
                insights: claimOn("share-insights"),
                askPlans: claimOn("ask-ai-plans"),
                askLanguages: claimOn("ask-ai-languages"),
                askSocial: claimOn("ask-ai-social"),
            })}
            world={WORLD}
            crumb={REACH_CRUMB}
            featureName={featureName}
            inTheApp={inTheAppData("social")}
            fonts={SITE_FONTS}
        />,
    );
}
