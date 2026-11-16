import { SocialView } from "@saroh/marketing/feature-pages/social-page";

import { socialWords } from "@/content/reach-social";
import { WORLD } from "@/content/world";
import { pageSite } from "@/lib/page-site";

import { inTheAppData, REACH_CRUMB } from "./data";
import { SITE_FONTS } from "./site-fonts";

/** /features/social: saroh.in's Reach page with Global's words and world. */
export function SocialPage() {
    const site = pageSite();
    return Promise.resolve(
        <SocialView
            site={site}
            words={socialWords({
                everyPlan: site.claimOn("share-every-plan"),
                posting: site.claimOn("social-posting"),
                insights: site.claimOn("share-insights"),
                askSocial: site.claimOn("ask-ai-social"),
            })}
            world={WORLD}
            crumb={REACH_CRUMB}
            inTheApp={inTheAppData("social")}
            fonts={SITE_FONTS}
        />,
    );
}
