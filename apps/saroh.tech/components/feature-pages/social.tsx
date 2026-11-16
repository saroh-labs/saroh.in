import { SocialView } from "@saroh/marketing/feature-pages/social-page";

import { socialWords } from "@/content/reach-social";
import { WORLD } from "@/content/world";
import { pageSite } from "@/lib/page-site";
import { paidPlansOn } from "@/lib/plans";

import { featureName, inTheAppData, REACH_CRUMB } from "./data";
import { SITE_FONTS } from "./site-fonts";

/** /features/social: saroh.in's Reach page with Global's words and world. */
export async function SocialPage() {
    const plansOn = await paidPlansOn();
    const site = pageSite();
    return (
        <SocialView
            site={site}
            words={socialWords({
                everyPlan: site.claimOn("share-every-plan"),
                posting: site.claimOn("social-posting"),
                insights: site.claimOn("share-insights"),
                askSocial: site.claimOn("ask-ai-social"),
                plansOn,
            })}
            world={WORLD}
            crumb={REACH_CRUMB}
            featureName={featureName}
            inTheApp={inTheAppData("social")}
            fonts={SITE_FONTS}
        />
    );
}
